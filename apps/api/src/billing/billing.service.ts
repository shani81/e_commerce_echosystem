import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface PlanView {
  id: string;
  tier: string;
  name: string;
  priceMonthlyCents: number;
  priceYearlyCents: number;
  currency: string;
  maxProducts: number;
  maxStores: number;
  maxStaffSeats: number;
  includedExtractionMinutes: number;
  includedGenerationCredits: number;
  features: unknown;
  sortOrder: number;
}

export interface SubscriptionView {
  id: string;
  planId: string;
  planTier: string;
  planName: string;
  status: string;
  interval: string;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  trialEndsAt: Date | null;
}

@Injectable()
export class BillingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Public SaaS pricing catalogue. `Plan` is a GLOBAL (non-tenant-scoped) table —
   * the product catalogue of AICOS itself — so it is read via `asSystem`.
   */
  async listPlans(): Promise<PlanView[]> {
    const plans = await this.prisma.asSystem((tx) =>
      tx.plan.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
      }),
    );
    return plans.map((p) => ({
      id: p.id,
      tier: p.tier,
      name: p.name,
      priceMonthlyCents: p.priceMonthlyCents,
      priceYearlyCents: p.priceYearlyCents,
      currency: p.currency,
      maxProducts: p.maxProducts,
      maxStores: p.maxStores,
      maxStaffSeats: p.maxStaffSeats,
      includedExtractionMinutes: p.includedExtractionMinutes,
      includedGenerationCredits: p.includedGenerationCredits,
      features: p.features,
      sortOrder: p.sortOrder,
    }));
  }

  /**
   * The active tenant's subscription. `Subscription` is tenant-scoped, so this
   * runs through `forTenant` (RLS-enforced). The joined `Plan` is global and
   * always readable.
   */
  async getSubscription(tenantId: string): Promise<SubscriptionView> {
    const sub = await this.prisma.forTenant(tenantId, (tx) =>
      tx.subscription.findUnique({
        where: { tenantId },
        include: { plan: true },
      }),
    );
    if (!sub) {
      throw new NotFoundException('No subscription found for this tenant');
    }
    return {
      id: sub.id,
      planId: sub.planId,
      planTier: sub.plan.tier,
      planName: sub.plan.name,
      status: sub.status,
      interval: sub.interval,
      currentPeriodStart: sub.currentPeriodStart,
      currentPeriodEnd: sub.currentPeriodEnd,
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
      trialEndsAt: sub.trialEndsAt,
    };
  }
}
