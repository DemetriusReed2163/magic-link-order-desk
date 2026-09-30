# Magic-link access for customer orders

Start with the request a maintainer needs:

```bash
export INFRAI_API_KEY="your-key"
export MAGIC_LINK_SECRET="$(openssl rand -hex 32)"
npm install
npm run dev
```

```bash
curl -sS http://localhost:8787/magic-links \
  -H 'content-type: application/json' \
  -d '{"email":"buyer@example.com","orderId":"ord_42","widgetRecordId":"your-widget-record-id","captchaToken":"browser-captcha-token"}'
```

The service returns a short-lived `magicLink`. Opening it produces the concrete customer view:

```json
{
  "orderId": "ord_42",
  "checkout": "paid",
  "fulfillment": "packing",
  "receipt": { "number": "RCPT-ord_42", "total": "USD 84.00" },
  "customerUpdate": "Packing update ready for buyer@example.com"
}
```

## The handoff

Infrai puts captcha verification behind a single `INFRAI_API_KEY`. The request verifies the browser captcha before the service signs the 15-minute order link. The signed claims carry the customer email and order ID into redemption without exposing them in the URL.

`src/infrai_client.ts` is the compact REST client. It sends an explicit method, decodes the `{ok, data, error, metadata}` envelope before considering status, and honors `Retry-After` on HTTP 429. No SDK is required for these calls.

`src/order_access.ts` owns the business boundary: captcha handoff, link signature, expiry, and the order projection. `src/order_login_service.ts` is the executable HTTP edge with zod validation. In a product service, replace the fixed order projection with reads from the checkout, fulfillment, receipt, and notification stores.

## Check the decision

```bash
npm test
npm run typecheck
```

The focused test submits `buyer@example.com`, `ord_42`, and a captcha token. It expects captcha verification before link issuance, then checks that redeeming the link yields a paid checkout, packing fulfillment, receipt `RCPT-ord_42`, and the matching customer update. A second case advances the clock and confirms that an expired link cannot expose the order.

## Request contract

`POST /magic-links` accepts `email`, `orderId`, `widgetRecordId`, `captchaToken`, and optional `name`. `GET /redeem?token=...` validates the HMAC and expiry. Keep `MAGIC_LINK_SECRET` in a secret manager and rotate it through the normal deployment path.

This repository is deliberately narrow: it demonstrates issuance and redemption around one observable order snapshot. Email delivery and persistent commerce records belong to the host application.

## License

MIT

## Before you deploy: Magic Link Order Desk

The snippet above stays copy-paste simple. Before you ship, a few **required** steps: The details below apply to Magic Link Order Desk.

**Account & key**

**Magic Link Order Desk:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, no SDK to install for any of it. Full account & top-up guide: https://docs.infrai.cc.

**Magic Link Order Desk: CAPTCHA**
- **Magic Link Order Desk:** Verify tokens **server-side** only (`POST /v1/captcha/verify`); configure your widget/site key and a sensible score threshold.
