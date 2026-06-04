// k6 load test — public storefront browse + product detail.
// Run:  k6 run perf/k6/storefront.js
// Override:  API_URL=http://localhost:4000 STORE_SLUG=demo k6 run perf/k6/storefront.js
//
// NOTE: the API enforces a global rate limit (200 req/min/IP). For a real load
// run, raise it for the API instance under test (e.g. start it with a large
// THROTTLE budget) or drive from multiple source IPs — otherwise k6 will (by
// design) see 429s once it exceeds the limit.
import http from 'k6/http';
import { check, sleep } from 'k6';

const API = __ENV.API_URL || 'http://localhost:4000';
const STORE = __ENV.STORE_SLUG || 'demo';
const BASE = `${API}/api/v1/storefront/${STORE}`;

export const options = {
  scenarios: {
    browse: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 10 },
        { duration: '1m', target: 10 },
        { duration: '15s', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<500'],
  },
};

export default function () {
  const list = http.get(`${BASE}/products?page=1&pageSize=24`);
  check(list, { 'list → 200': (r) => r.status === 200 });

  let items = [];
  try {
    items = list.json('items') || [];
  } catch {
    items = [];
  }
  if (items.length) {
    const slug = items[Math.floor(Math.random() * items.length)].slug;
    const detail = http.get(`${BASE}/products/${encodeURIComponent(slug)}`);
    check(detail, { 'detail → 200': (r) => r.status === 200 });
  }
  sleep(1);
}
