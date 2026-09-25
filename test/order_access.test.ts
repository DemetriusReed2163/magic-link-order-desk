import assert from "node:assert/strict";
import test from "node:test";
import { AccessError, OrderAccess } from "../src/order_access.ts";

test("a verified shopper receives the matching paid order snapshot", async () => {
  const calls: Array<{ widget_record_id: string; token: string }> = [];
  const infrai = {
    async verifyCaptcha(input: { widget_record_id: string; token: string }): Promise<{ verified: boolean }> {
      calls.push(input);
      return { verified: true };
    },
  };
  const access = new OrderAccess(infrai, "test-secret", () => 1_700_000_000_000);

  const issued = await access.issue({
    email: "buyer@example.com",
    orderId: "ord_42",
    widgetRecordId: "widget-test-id",
    captchaToken: "captcha-test-token",
  });
  const token = new URL(issued.magicLink).searchParams.get("token");
  assert.ok(token);

  assert.deepEqual(access.redeem(token), {
    orderId: "ord_42",
    checkout: "paid",
    fulfillment: "packing",
    receipt: { number: "RCPT-ord_42", total: "USD 84.00" },
    customerUpdate: "Packing update ready for buyer@example.com",
  });
  assert.deepEqual(calls, [{ widget_record_id: "widget-test-id", token: "captcha-test-token", ip: undefined, action: "order_access" }]);
});

test("an expired link cannot expose the order", async () => {
  let clock = 1_700_000_000_000;
  const infrai = {
    async verifyCaptcha(): Promise<{ verified: boolean }> { return { verified: true }; },
  };
  const access = new OrderAccess(infrai, "test-secret", () => clock);
  const issued = await access.issue({
    email: "buyer@example.com",
    orderId: "ord_42",
    widgetRecordId: "widget-test-id",
    captchaToken: "captcha-test-token",
  });
  const token = new URL(issued.magicLink).searchParams.get("token");
  assert.ok(token);
  clock += 16 * 60_000;

  assert.throws(() => access.redeem(token), AccessError);
});

test("an unverified captcha cannot issue a link", async () => {
  const access = new OrderAccess({
    async verifyCaptcha() { return { verified: false }; },
  }, "test-secret");
  await assert.rejects(access.issue({
    email: "buyer@example.com",
    orderId: "ord_42",
    widgetRecordId: "widget-test-id",
    captchaToken: "captcha-test-token",
  }), AccessError);
});
