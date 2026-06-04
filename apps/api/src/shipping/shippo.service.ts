import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface ShippoAddress {
  name: string;
  street1: string;
  street2?: string | null;
  city: string;
  state?: string | null;
  zip?: string | null;
  country: string;
  phone?: string | null;
}
export interface ShippoParcel {
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  weightG: number;
}
export interface ShippoLabel {
  carrier: string;
  service: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  labelUrl: string | null;
  rateAmountCents: number;
  currency: string;
}

interface ShippoRate {
  object_id: string;
  amount: string;
  currency?: string;
  provider?: string;
  servicelevel?: { name?: string; token?: string };
}

/**
 * Thin client over the Shippo REST API (label aggregator). Buys the cheapest
 * label for a shipment: create shipment → pick lowest rate → create transaction.
 * Gated on `SHIPPO_API_KEY` (`isConfigured`); callers fall back to the manual
 * shipment flow when it's absent. No SDK — uses fetch against the documented v1
 * API. (Verify field shapes against a live test key when available.)
 */
@Injectable()
export class ShippoService {
  private readonly logger = new Logger(ShippoService.name);
  private readonly apiKey?: string;
  private readonly baseUrl = 'https://api.goshippo.com';

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('shipping.shippoApiKey') || undefined;
  }

  get isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async buyLabel(from: ShippoAddress, to: ShippoAddress, parcel: ShippoParcel): Promise<ShippoLabel> {
    if (!this.apiKey) throw new Error('Shippo is not configured');

    const shipment = await this.post<{ rates?: ShippoRate[] }>('/shipments/', {
      address_from: this.toShippoAddress(from),
      address_to: this.toShippoAddress(to),
      parcels: [this.toShippoParcel(parcel)],
      async: false,
    });
    const rates = shipment.rates ?? [];
    if (rates.length === 0) throw new Error('Shippo returned no rates');
    const rate = rates.reduce((best, r) => (Number(r.amount) < Number(best.amount) ? r : best), rates[0]!);

    const tx = await this.post<{
      status: string;
      tracking_number?: string;
      tracking_url_provider?: string;
      label_url?: string;
      messages?: { text?: string }[];
    }>('/transactions/', { rate: rate.object_id, label_file_type: 'PDF', async: false });

    if (tx.status !== 'SUCCESS') {
      throw new Error(`Shippo transaction ${tx.status}: ${tx.messages?.[0]?.text ?? 'unknown'}`);
    }

    return {
      carrier: rate.provider ?? 'unknown',
      service: rate.servicelevel?.name ?? rate.servicelevel?.token ?? null,
      trackingNumber: tx.tracking_number ?? null,
      trackingUrl: tx.tracking_url_provider ?? null,
      labelUrl: tx.label_url ?? null,
      rateAmountCents: Math.round(Number(rate.amount) * 100),
      currency: rate.currency ?? 'USD',
    };
  }

  private toShippoAddress(a: ShippoAddress) {
    return {
      name: a.name,
      street1: a.street1,
      street2: a.street2 ?? undefined,
      city: a.city,
      state: a.state ?? undefined,
      zip: a.zip ?? undefined,
      country: a.country,
      phone: a.phone ?? undefined,
    };
  }

  private toShippoParcel(p: ShippoParcel) {
    return {
      length: String(p.lengthCm),
      width: String(p.widthCm),
      height: String(p.heightCm),
      distance_unit: 'cm',
      weight: String(p.weightG),
      mass_unit: 'g',
    };
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `ShippoToken ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Shippo ${path} → HTTP ${res.status}`);
    return res.json() as Promise<T>;
  }
}
