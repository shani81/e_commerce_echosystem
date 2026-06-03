import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type Index, MeiliSearch } from 'meilisearch';

/** The product document shape stored in Meilisearch. */
export interface ProductDoc {
  id: string;
  tenantId: string;
  title: string;
  slug: string;
  description: string;
  status: string;
  type: string;
  brandId: string | null;
  brandName: string | null;
  categoryIds: string[];
  skus: string[];
  priceMinCents: number | null;
  createdAt: number;
  publishedAt: number | null;
}

export interface TenantToken {
  token: string;
  host: string;
  indexUid: string;
  expiresAt: string;
}

/**
 * Thin Meilisearch wrapper. Owns the products index (settings + per-tenant
 * filtering) and degrades gracefully: with no MEILI_MASTER_KEY the client is
 * null and every method is a safe no-op so the API still boots and serves.
 */
@Injectable()
export class MeiliService implements OnModuleInit {
  private readonly logger = new Logger(MeiliService.name);
  private readonly client: MeiliSearch | null;
  readonly indexUid: string;
  private readonly host: string;

  constructor(config: ConfigService) {
    this.host = config.getOrThrow<string>('meili.host');
    this.indexUid = config.getOrThrow<string>('meili.productsIndex');
    const apiKey = config.get<string>('meili.apiKey');
    this.client = apiKey ? new MeiliSearch({ host: this.host, apiKey }) : null;
    if (!this.client) {
      this.logger.warn('MEILI_MASTER_KEY not set — search disabled (indexing/search are no-ops).');
    }
  }

  get enabled(): boolean {
    return this.client !== null;
  }
  get hostUrl(): string {
    return this.host;
  }
  index(): Index<ProductDoc> | null {
    return this.client ? this.client.index<ProductDoc>(this.indexUid) : null;
  }

  async onModuleInit(): Promise<void> {
    const client = this.client;
    if (!client) return;
    try {
      await client.createIndex(this.indexUid, { primaryKey: 'id' }).catch(() => undefined);
      await client.index(this.indexUid).updateSettings({
        searchableAttributes: ['title', 'description', 'brandName', 'skus'],
        filterableAttributes: ['tenantId', 'status', 'brandId', 'categoryIds'],
        sortableAttributes: ['priceMinCents', 'createdAt'],
      });
      this.logger.log(`Meilisearch ready at ${this.host} (index "${this.indexUid}").`);
    } catch (err) {
      this.logger.error(`Meilisearch init failed: ${(err as Error).message}`);
    }
  }

  /** Tenant-scoped search (server-side; uses the master client + tenant filter). */
  async search(
    tenantId: string,
    query: string,
    opts: { limit?: number; offset?: number; statuses?: string[] } = {},
  ): Promise<{ hits: ProductDoc[]; total: number }> {
    const index = this.index();
    if (!index) return { hits: [], total: 0 };
    const filter = [`tenantId = "${tenantId}"`];
    if (opts.statuses?.length) {
      filter.push(`status IN [${opts.statuses.map((s) => `"${s}"`).join(', ')}]`);
    }
    const res = await index.search(query, {
      filter,
      limit: opts.limit ?? 20,
      offset: opts.offset ?? 0,
    });
    return { hits: res.hits, total: res.estimatedTotalHits ?? res.hits.length };
  }

  /**
   * Best-effort per-tenant scoped SEARCH token (1h TTL) that a storefront client
   * can use to query Meilisearch directly — it can only ever see this tenant's
   * docs (the filter is baked into the token; the master key never leaves here).
   * Returns null if token signing isn't available.
   */
  async tenantToken(tenantId: string): Promise<TenantToken | null> {
    const client = this.client;
    if (!client) return null;
    try {
      const { results } = await client.getKeys();
      const searchKey = results.find((k) => Boolean(k.uid) && k.actions.includes('search'));
      if (!searchKey) return null;
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
      const token = await client.generateTenantToken(
        searchKey.uid,
        { [this.indexUid]: { filter: `tenantId = "${tenantId}"` } },
        { apiKey: searchKey.key, expiresAt },
      );
      return { token, host: this.host, indexUid: this.indexUid, expiresAt: expiresAt.toISOString() };
    } catch (err) {
      this.logger.warn(`tenantToken failed: ${(err as Error).message}`);
      return null;
    }
  }
}
