import type { ConfigService } from '@nestjs/config';
import { ShippoService, type ShippoAddress, type ShippoParcel } from './shippo.service';

function svc(key?: string): ShippoService {
  return new ShippoService({ get: () => key } as unknown as ConfigService);
}
const FROM: ShippoAddress = { name: 'WH', street1: '1 A St', city: 'NYC', state: 'NY', zip: '10001', country: 'US' };
const TO: ShippoAddress = { name: 'Cust', street1: '2 B St', city: 'LA', state: 'CA', zip: '90001', country: 'US' };
const PARCEL: ShippoParcel = { lengthCm: 20, widthCm: 15, heightCm: 10, weightG: 500 };

describe('ShippoService', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('isConfigured reflects the API key', () => {
    expect(svc('shippo_test_x').isConfigured).toBe(true);
    expect(svc(undefined).isConfigured).toBe(false);
  });

  it('buys the cheapest rate and parses the label', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          rates: [
            { object_id: 'r1', amount: '9.50', currency: 'USD', provider: 'USPS', servicelevel: { name: 'Priority' } },
            { object_id: 'r2', amount: '7.25', currency: 'USD', provider: 'USPS', servicelevel: { name: 'Ground' } },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'SUCCESS', tracking_number: '1Z9', tracking_url_provider: 'https://t/1Z9', label_url: 'https://l/9.pdf' }),
      });
    global.fetch = fetchMock as unknown as typeof fetch;

    const label = await svc('k').buyLabel(FROM, TO, PARCEL);

    expect(label.rateAmountCents).toBe(725); // cheapest (7.25)
    expect(label.carrier).toBe('USPS');
    expect(label.service).toBe('Ground');
    expect(label.trackingNumber).toBe('1Z9');
    expect(label.labelUrl).toBe('https://l/9.pdf');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('/shipments/'),
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'ShippoToken k' }) }),
    );
  });

  it('throws when not configured', async () => {
    await expect(svc(undefined).buyLabel(FROM, TO, PARCEL)).rejects.toThrow('not configured');
  });

  it('throws when the transaction is not SUCCESS', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ rates: [{ object_id: 'r1', amount: '5.00' }] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'ERROR', messages: [{ text: 'bad address' }] }) }) as unknown as typeof fetch;

    await expect(svc('k').buyLabel(FROM, TO, PARCEL)).rejects.toThrow('bad address');
  });
});
