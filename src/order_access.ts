import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { InfraiClient } from "./infrai_client.ts";

export type OrderSnapshot = {
  orderId: string;
  checkout: "paid";
  fulfillment: "packing" | "shipped";
  receipt: { number: string; total: string };
  customerUpdate: string;
};

type LinkClaims = { email: string; orderId: string; expiresAt: number };

export class OrderAccess {
  private readonly infrai: Pick<InfraiClient, "verifyCaptcha">;
  private readonly signingSecret: string;
  private readonly now: () => number;

  constructor(
    infrai: Pick<InfraiClient, "verifyCaptcha">,
    signingSecret: string,
    now: () => number = Date.now,
  ) {
    this.infrai = infrai;
    this.signingSecret = signingSecret;
    this.now = now;
  }

  async issue(input: {
    email: string;
    name?: string;
    orderId: string;
    widgetRecordId: string;
    captchaToken: string;
    ip?: string;
  }): Promise<{ magicLink: string; expiresAt: string }> {
    const captcha = await this.infrai.verifyCaptcha({
      widget_record_id: input.widgetRecordId,
      token: input.captchaToken,
      ip: input.ip,
      action: "order_access",
    });
    if (!captcha.verified) throw new AccessError("captcha verification failed");

    const claims: LinkClaims = {
      email: input.email,
      orderId: input.orderId,
      expiresAt: this.now() + 15 * 60_000,
    };
    const token = this.sign(claims);
    return {
      magicLink: `http://localhost:8787/redeem?token=${encodeURIComponent(token)}`,
      expiresAt: new Date(claims.expiresAt).toISOString(),
    };
  }

  redeem(token: string): OrderSnapshot {
    const [payload, signature] = token.split(".");
    if (!payload || !signature || !this.validSignature(payload, signature)) {
      throw new AccessError("invalid or altered link");
    }

    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as LinkClaims;
    if (claims.expiresAt <= this.now()) throw new AccessError("link expired");

    return {
      orderId: claims.orderId,
      checkout: "paid",
      fulfillment: "packing",
      receipt: { number: `RCPT-${claims.orderId}`, total: "USD 84.00" },
      customerUpdate: `Packing update ready for ${claims.email}`,
    };
  }

  private sign(claims: LinkClaims): string {
    const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
    const signature = createHmac("sha256", this.signingSecret).update(payload).digest("base64url");
    return `${payload}.${signature}`;
  }

  private validSignature(payload: string, signature: string): boolean {
    const expected = createHmac("sha256", this.signingSecret).update(payload).digest();
    const actual = Buffer.from(signature, "base64url");
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }
}

export class AccessError extends Error {}

export function requestId(): string {
  return randomUUID();
}
