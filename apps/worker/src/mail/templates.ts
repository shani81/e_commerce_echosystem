/**
 * Transactional email templates. Keyed by Notification.template; each renders a
 * subject + HTML body from the notification payload. Kept as simple inline HTML
 * (no template engine) — enough for Phase 1; richer themed emails land later.
 */
export interface RenderedEmail {
  subject: string;
  html: string;
}

type Payload = Record<string, unknown>;

function money(cents: unknown, currency: unknown): string {
  const c = typeof cents === 'number' ? cents : 0;
  const cur = typeof currency === 'string' ? currency : 'USD';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: cur }).format(c / 100);
}

function wrap(title: string, body: string): string {
  return (
    `<div style="font-family:system-ui,Arial,sans-serif;max-width:560px;margin:auto">` +
    `<h2 style="color:#111">${title}</h2>${body}` +
    `<hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>` +
    `<p style="color:#888;font-size:12px">AICOS — AI Commerce OS</p></div>`
  );
}

export function renderTemplate(
  template: string,
  payload: Payload,
  fallbackSubject?: string,
): RenderedEmail {
  const num = payload.orderNumber ?? '';
  switch (template) {
    case 'order_confirmation':
      return {
        subject: `Order #${num} confirmed`,
        html: wrap(
          'Thank you for your order',
          `<p>Your order <strong>#${num}</strong> is confirmed and being prepared.</p>` +
            `<p>Total paid: <strong>${money(payload.totalCents, payload.currency)}</strong></p>`,
        ),
      };
    case 'shipment_tracking':
      return {
        subject: `Your order #${num} has shipped`,
        html: wrap(
          'Your order is on its way',
          `<p>Order <strong>#${num}</strong> shipped${payload.carrier ? ` via ${String(payload.carrier)}` : ''}.</p>` +
            (payload.trackingNumber
              ? `<p>Tracking number: <strong>${String(payload.trackingNumber)}</strong></p>`
              : '') +
            (payload.trackingUrl
              ? `<p><a href="${String(payload.trackingUrl)}">Track your package →</a></p>`
              : ''),
        ),
      };
    case 'return_approved':
      return {
        subject: `Return for order #${num} approved`,
        html: wrap(
          'Return approved',
          `<p>Your return request for order <strong>#${num}</strong> has been approved. ` +
            `Please send the item(s) back; we'll refund once received.</p>`,
        ),
      };
    case 'return_refunded':
      return {
        subject: `Refund issued for order #${num}`,
        html: wrap(
          'Refund issued',
          `<p>We've refunded <strong>${money(payload.amountCents, payload.currency)}</strong> ` +
            `for order <strong>#${num}</strong>. It may take a few days to appear.</p>`,
        ),
      };
    default:
      return {
        subject: fallbackSubject ?? 'A message from your store',
        html: wrap('Notification', `<p>${fallbackSubject ?? 'You have a new notification.'}</p>`),
      };
  }
}
