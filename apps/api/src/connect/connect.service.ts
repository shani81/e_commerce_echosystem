import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Stripe from 'stripe';
import type { Prisma } from '@aicos/db';
import { PrismaService } from '../prisma/prisma.service';
import { StripeService } from '../billing/stripe.service';
import type { CreateConnectAccountDto } from './dto/create-connect-account.dto';

export interface ConnectStatus {
  connected: boolean;
  stripeAccountId: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  requirementsDue: string[];
}

/**
 * Stripe Connect onboarding for a tenant. Each tenant charges through its own
 * connected (Express) account; the platform takes an application fee on the
 * destination charge created at checkout. This service creates the account,
 * issues hosted onboarding links, and syncs capability state back into the
 * ConnectAccount mirror (also kept fresh by the `account.updated` webhook).
 */
@Injectable()
export class ConnectService {
  private readonly logger = new Logger(ConnectService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeService,
    private readonly config: ConfigService,
  ) {}

  async getStatus(tenantId: string): Promise<ConnectStatus> {
    const account = await this.prisma.forTenant(tenantId, (tx) =>
      tx.connectAccount.findUnique({ where: { tenantId } }),
    );
    if (!account) return this.emptyStatus();

    // Best-effort refresh from Stripe when configured; fall back to the mirror.
    if (this.stripe.isApiConfigured) {
      try {
        const fresh = await this.stripe.client.accounts.retrieve(account.stripeAccountId);
        const synced = await this.syncFromStripe(tenantId, fresh);
        return this.toStatus(synced);
      } catch (err) {
        this.logger.warn(
          `connect status refresh failed for tenant ${tenantId}: ${
            err instanceof Error ? err.message : 'unknown'
          }`,
        );
      }
    }
    return this.toStatus(account);
  }

  async createAccount(
    tenantId: string,
    dto: CreateConnectAccountDto,
  ): Promise<ConnectStatus> {
    this.stripe.assertApiConfigured();

    const existing = await this.prisma.forTenant(tenantId, (tx) =>
      tx.connectAccount.findUnique({ where: { tenantId } }),
    );
    if (existing) return this.toStatus(existing);

    const account = await this.stripe.client.accounts.create({
      type: 'express',
      ...(dto.country ? { country: dto.country } : {}),
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      metadata: { tenantId },
    });

    const created = await this.prisma.forTenant(tenantId, (tx) =>
      tx.connectAccount.create({
        data: {
          tenantId,
          stripeAccountId: account.id,
          chargesEnabled: account.charges_enabled,
          payoutsEnabled: account.payouts_enabled,
          detailsSubmitted: account.details_submitted,
          requirements: this.requirementsJson(account),
          country: account.country ?? null,
          defaultCurrency: (account.default_currency ?? 'usd').toUpperCase(),
        },
      }),
    );
    this.logger.log(`connect: created Express account ${account.id} for tenant ${tenantId}`);
    return this.toStatus(created);
  }

  async createOnboardingLink(tenantId: string): Promise<{ url: string }> {
    this.stripe.assertApiConfigured();

    const account = await this.prisma.forTenant(tenantId, (tx) =>
      tx.connectAccount.findUnique({ where: { tenantId } }),
    );
    if (!account) {
      throw new BadRequestException('No Connect account yet — create one first');
    }

    const link = await this.stripe.client.accountLinks.create({
      account: account.stripeAccountId,
      refresh_url: this.config.get<string>('commerce.connectRefreshUrl')!,
      return_url: this.config.get<string>('commerce.connectReturnUrl')!,
      type: 'account_onboarding',
    });
    return { url: link.url };
  }

  /** Upsert the local mirror from a Stripe Account (used by status + webhook). */
  async syncFromStripe(
    tenantId: string,
    account: Stripe.Account,
  ): Promise<{
    stripeAccountId: string;
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
    detailsSubmitted: boolean;
    requirements: Prisma.JsonValue;
  }> {
    const data = {
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      detailsSubmitted: account.details_submitted,
      requirements: this.requirementsJson(account),
      country: account.country ?? null,
    };
    return this.prisma.forTenant(tenantId, (tx) =>
      tx.connectAccount.update({ where: { tenantId }, data }),
    );
  }

  private requirementsJson(account: Stripe.Account): Prisma.InputJsonValue {
    const r = account.requirements;
    return {
      currentlyDue: r?.currently_due ?? [],
      pastDue: r?.past_due ?? [],
      disabledReason: r?.disabled_reason ?? null,
    };
  }

  private toStatus(account: {
    stripeAccountId: string;
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
    detailsSubmitted: boolean;
    requirements: Prisma.JsonValue;
  }): ConnectStatus {
    const req = (account.requirements ?? {}) as { currentlyDue?: string[] };
    return {
      connected: true,
      stripeAccountId: account.stripeAccountId,
      chargesEnabled: account.chargesEnabled,
      payoutsEnabled: account.payoutsEnabled,
      detailsSubmitted: account.detailsSubmitted,
      requirementsDue: req.currentlyDue ?? [],
    };
  }

  private emptyStatus(): ConnectStatus {
    return {
      connected: false,
      stripeAccountId: null,
      chargesEnabled: false,
      payoutsEnabled: false,
      detailsSubmitted: false,
      requirementsDue: [],
    };
  }
}
