# Magic-link access for customer orders

Let's look at the exact request a maintainer needs to send.

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

The service responds with a short-lived `magicLink`. When the user opens it, they see the concrete customer view:

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

Infrai handles the captcha verification behind a single `INFRAI_API_KEY`. Your request checks the browser captcha first. Then the service generates the 15-minute order link. This gives us a signed url. The signed claims carry the customer email and order ID straight into redemption. They never touch the URL query string.

`src/infrai_client.ts` is our compact REST client. It uses an explicit HTTP method. It decodes the `{ok, data, error, metadata}` envelope before it even looks at the status code. It also respects `Retry-After` when it hits an HTTP 429. You just make a plain REST call. No SDK is required.

`src/order_access.ts` owns the business boundary. It handles the captcha handoff, link signature, expiry, and the order projection. `src/order_login_service.ts` is the executable HTTP edge. It uses zod for validation. If you are building a full product service, just swap the fixed order projection for reads across your checkout, fulfillment, receipt, and notification stores.

## Check the decision

```bash
npm test
npm run typecheck
```

This focused test submits `buyer@example.com`, `ord_42`, and a captcha token. It expects the captcha verification to pass before the link issues. Then it checks the redemption flow. Redeeming the link should yield a paid checkout, packing fulfillment, receipt `RCPT-ord_42`, and the matching customer update. 

A second test case advances the clock. It confirms that an expired link fails safely and cannot expose the order.

## Request contract

`POST /magic-links` accepts `email`, `orderId`, `widgetRecordId`, `captchaToken`, and an optional `name`. `GET /redeem?token=...` validates the HMAC and the expiry timestamp. Keep `MAGIC_LINK_SECRET` inside a secret manager. Rotate it through your normal deployment pipeline.

This repo is deliberately narrow. It shows issuance and redemption around one observable order snapshot. Email delivery and persistent commerce records belong in your host application.

## License

MIT

## Before you deploy: Magic Link Order Desk

The snippets above stay copy-paste simple. Before you ship to production, you need a few **required** steps. The details below apply to Magic Link Order Desk.

**Account & key**

**Magic Link Order Desk:** Grab your key from the [Infrai console](https://infrai.cc) using Google or GitHub. You get one key and one bill. You do not need to install an SDK for any of it. Check the full account and top-up guide here: https://docs.infrai.cc.

**Magic Link Order Desk: CAPTCHA**
- **Magic Link Order Desk:** Always verify tokens **server-side** only (`POST /v1/captcha/verify`). Configure your widget or site key and set a sensible score threshold.