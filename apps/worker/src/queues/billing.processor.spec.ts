jest.mock('@aicos/db', () => ({
  __esModule: true,
  ...jest.requireActual('@aicos/db'),
  withTenant: jest.fn(),
  withSystem: jest.fn(),
}));

import type { Job } from 'bullmq';
import type { Queue } from 'bullmq';
import { OrderStatus, withTenant } from '@aicos/db';
import { BillingProcessor } from './billing.processor';
import { BILLING_JOBS, type StripeEventJobData } from './contracts';
import type { PrismaService } from '../prisma/prisma.service';
import type { RedisService } from '../redis/redis.service';
import type { MetricsService } from '../metrics/metrics.service';

const wt = withTenant as jest.Mock;

interface Tx {
  order: { findFirst: jest.Mock; update: jest.Mock };
  payment: { upsert: jest.Mock };
  inventoryItem: { findMany: jest.Mock };
  stockMovement: { create: jest.Mock };
  cart: { updateMany: jest.Mock };
  notification: { create: jest.Mock };
}

// A verified checkout.session.completed event, as it arrives in the job payload.
function sessionEvent(session: Record<string, unknown>): StripeEventJobData {
  return {
    eventId: 'evt_1',
    type: 'checkout.session.completed',
    payload: { type: 'checkout.session.completed', data: { object: session } },
  } as unknown as StripeEventJobData;
}
function makeJob(data: StripeEventJobData): Job<StripeEventJobData> {
  return { name: BILLING_JOBS.stripeEvent, id: 'evt_1', data } as unknown as Job<StripeEventJobData>;
}

describe('BillingProcessor — checkout.session.completed address capture', () => {
  let tx: Tx;
  let notifyAdd: jest.Mock;
  let proc: BillingProcessor;

  beforeEach(() => {
    tx = {
      order: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'o1',
          number: '1001',
          status: OrderStatus.PENDING,
          financialStatus: 'PENDING',
          totalCents: 1999,
          currency: 'USD',
          email: null,
          billingAddress: null,
          items: [],
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      payment: { upsert: jest.fn().mockResolvedValue({}) },
      inventoryItem: { findMany: jest.fn().mockResolvedValue([]) },
      stockMovement: { create: jest.fn() },
      cart: { updateMany: jest.fn() },
      notification: { create: jest.fn().mockResolvedValue({ id: 'n1' }) },
    };
    wt.mockImplementation((_c: unknown, _t: string, fn: (tx: Tx) => unknown) => fn(tx));
    notifyAdd = jest.fn().mockResolvedValue(undefined);
    proc = new BillingProcessor(
      { client: {} } as unknown as PrismaService,
      { client: { exists: jest.fn().mockResolvedValue(0), set: jest.fn().mockResolvedValue('OK') } } as unknown as RedisService,
      { ordersPaid: { inc: jest.fn() } } as unknown as MetricsService,
      { add: notifyAdd } as unknown as Queue,
    );
  });

  it('persists shipping + billing address and the buyer email from the session', async () => {
    const session = {
      id: 'cs_1',
      payment_intent: 'pi_1',
      amount_total: 1999,
      currency: 'usd',
      metadata: { tenantId: 't1', orderId: 'o1', cartToken: 'ct1' },
      shipping_details: {
        name: 'Ada Lovelace',
        phone: '+15551234',
        address: { line1: '12 Analytical Ave', line2: 'Apt 1', city: 'London', state: null, postal_code: 'EC1', country: 'GB' },
      },
      customer_details: {
        email: 'ada@calc.dev',
        name: 'Ada Lovelace',
        address: { line1: '1 Billing Rd', city: 'London', postal_code: 'EC1', country: 'GB' },
      },
    };

    const res = await proc.process(makeJob(sessionEvent(session)));
    expect(res.handled).toBe(true);

    const data = tx.order.update.mock.calls[0][0].data;
    expect(data.status).toBe(OrderStatus.PAID);
    expect(data.shippingAddress).toEqual({
      name: 'Ada Lovelace',
      phone: '+15551234',
      line1: '12 Analytical Ave',
      line2: 'Apt 1',
      city: 'London',
      state: null,
      postalCode: 'EC1',
      country: 'GB',
    });
    expect(data.billingAddress).toMatchObject({ line1: '1 Billing Rd', postalCode: 'EC1' });
    expect(data.email).toBe('ada@calc.dev'); // captured (order had none)
    // Order-confirmation email enqueued to the captured address.
    expect(notifyAdd).toHaveBeenCalled();
  });

  it('still marks PAID without crashing when no shipping address is collected', async () => {
    const session = {
      id: 'cs_2',
      payment_intent: 'pi_2',
      amount_total: 1999,
      currency: 'usd',
      metadata: { tenantId: 't1', orderId: 'o1' },
      // no shipping_details / customer_details (e.g. digital goods)
    };

    await proc.process(makeJob(sessionEvent(session)));

    const data = tx.order.update.mock.calls[0][0].data;
    expect(data.status).toBe(OrderStatus.PAID);
    expect(data.shippingAddress).toBeUndefined(); // nothing to capture, no key written
    expect(data.email).toBeUndefined();
  });
});
