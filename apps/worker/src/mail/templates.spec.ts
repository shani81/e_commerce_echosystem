import { renderTemplate } from './templates';

describe('renderTemplate', () => {
  it('order_confirmation renders the number + formatted total', () => {
    const r = renderTemplate('order_confirmation', { orderNumber: '1001', totalCents: 1999, currency: 'USD' });
    expect(r.subject).toBe('Order #1001 confirmed');
    expect(r.html).toContain('$19.99');
    expect(r.html).toContain('#1001');
  });

  it('shipment_tracking includes carrier + tracking + a track link', () => {
    const r = renderTemplate('shipment_tracking', {
      orderNumber: '1001',
      carrier: 'USPS',
      trackingNumber: '1Z999',
      trackingUrl: 'https://track/1Z999',
    });
    expect(r.subject).toBe('Your order #1001 has shipped');
    expect(r.html).toContain('USPS');
    expect(r.html).toContain('1Z999');
    expect(r.html).toContain('https://track/1Z999');
  });

  it('shipment_tracking omits the tracking block when absent', () => {
    const r = renderTemplate('shipment_tracking', { orderNumber: '1001' });
    expect(r.html).not.toContain('Tracking number');
  });

  it('return_refunded renders the refunded amount', () => {
    const r = renderTemplate('return_refunded', { orderNumber: '1001', amountCents: 500, currency: 'USD' });
    expect(r.subject).toBe('Refund issued for order #1001');
    expect(r.html).toContain('$5.00');
  });

  it('an unknown template falls back to the provided subject', () => {
    const r = renderTemplate('mystery', {}, 'Custom subject');
    expect(r.subject).toBe('Custom subject');
  });

  it('money formatting defaults to USD and handles missing cents', () => {
    const r = renderTemplate('order_confirmation', { orderNumber: '2002' });
    expect(r.html).toContain('$0.00');
  });
});
