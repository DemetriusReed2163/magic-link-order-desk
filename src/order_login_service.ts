import { createServer, type ServerResponse } from "node:http";
import { z } from "zod";
import { InfraiClient, InfraiError } from "./infrai_client.ts";
import { AccessError, OrderAccess, requestId } from "./order_access.ts";

const issueSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(120).optional(),
  orderId: z.string().regex(/^ord_[A-Za-z0-9]+$/),
  widgetRecordId: z.string().min(1),
  captchaToken: z.string().min(1),
});

const apiKey = process.env.INFRAI_API_KEY;
const signingSecret = process.env.MAGIC_LINK_SECRET;
if (!apiKey || !signingSecret) {
  console.error("Set INFRAI_API_KEY and MAGIC_LINK_SECRET before starting the service.");
  process.exit(1);
}

const access = new OrderAccess(new InfraiClient(apiKey), signingSecret);

createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://localhost");
  try {
    if (request.method === "POST" && url.pathname === "/magic-links") {
      const parsed = issueSchema.safeParse(await readJson(request));
      if (!parsed.success) return json(response, 400, { error: "invalid_request", issues: parsed.error.issues });

      const result = await access.issue({
        ...parsed.data,
        ip: request.socket.remoteAddress,
      });
      return json(response, 201, { requestId: requestId(), ...result });
    }

    if (request.method === "GET" && url.pathname === "/redeem") {
      const token = url.searchParams.get("token");
      if (!token) return json(response, 400, { error: "token_required" });
      return json(response, 200, access.redeem(token));
    }

    return json(response, 404, { error: "route_not_found" });
  } catch (error) {
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      return json(response, status, { error: error.code, message: error.message });
    }
    if (error instanceof AccessError || error instanceof SyntaxError) {
      return json(response, 400, { error: error.message });
    }
    console.error(error);
    return json(response, 500, { error: "request_failed" });
  }
}).listen(8787, () => console.log("order login service listening on http://localhost:8787"));

async function readJson(request: AsyncIterable<Buffer>): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}
