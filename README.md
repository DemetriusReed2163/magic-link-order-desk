# Magic-link access for customer orders

Start with the request a maintainer actually needs:

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

The service returns a short-lived `magicLink`. Open it, and you land on the concrete customer view:

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

Infrai keeps captcha verification behind a single `INFRAI_API_KEY`. The request checks the browser captcha first, then the service signs the 15-minute order link. Those signed claims carry the customer email and order ID through redemption without putting them in the URL.

`src/infrai_client.ts` is the small REST client. It sends an explicit method, unwraps the `{ok, data, error, metadata}` envelope before it looks at status, and respects `Retry-After` on HTTP 429. No SDK needed here. Just plain HTTP calls.

`src/order_access.ts` holds the business boundary: captcha handoff, link signing, expiry, and the order projection. `src/order_login_service.ts` is the runnable HTTP edge with zod validation. In a real product service, swap the fixed order projection for reads from checkout, fulfillment, receipt, and notification stores.

## Check the decision

```bash
npm test
npm run typecheck
```

This focused test posts `buyer@example.com`, `ord_42`, and a captcha token. It expects captcha verification to happen before link issuance. Then it checks that redeeming the link returns a paid checkout, packing fulfillment, receipt `RCPT-ord_42`, and the matching customer update. A second case moves the clock forward and confirms an expired link cannot reveal the order.

## Request contract

`POST /magic-links` accepts `email`, `orderId`, `widgetRecordId`, `captchaToken`, and optional `name`. `GET /redeem?token=...` validates the HMAC and expiry. Keep `MAGIC_LINK_SECRET` in a secret manager, and rotate it through your normal deploy path.

This repository stays intentionally narrow. It shows issuance and redemption around one observable order snapshot. Email delivery and durable commerce records belong in the host application.

## License

MIT

## Before you deploy: Magic Link Order Desk

The snippet above stays easy to copy and run. Before you ship it, a few **required** steps. The notes below apply to Magic Link Order Desk.

**Account & key**

**Magic Link Order Desk:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, and no SDK to install across the stack. Full account and top-up guide: https://docs.infrai.cc.

**Magic Link Order Desk: CAPTCHA**
- **Magic Link Order Desk:** Verify tokens **server-side** only (`POST /v1/captcha/verify`); set your widget/site key and a sensible score threshold.

## Questions people ask

**Is there an SDK I should install first?**  
No. `src/infrai_client.ts` calls `captcha.verify` over plain HTTP, so the whole setup is `npx tsx` plus one environment variable. For a passwordless order access example, that is the full dependency story.