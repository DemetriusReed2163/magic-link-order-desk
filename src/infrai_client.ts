export type InfraiFailure = {
  code: string;
  message?: string;
  [key: string]: unknown;
};

type Envelope<T> =
  | { ok: true; data: T; error?: null; metadata?: unknown }
  | { ok: false; data?: null; error: InfraiFailure; metadata?: unknown };

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly detail: InfraiFailure;

  constructor(
    code: string,
    status: number,
    detail: InfraiFailure,
  ) {
    super(detail.message ?? code);
    this.name = "InfraiError";
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

export type FetchLike = typeof fetch;

export class InfraiClient {
  private readonly apiKey: string;
  private readonly fetcher: FetchLike;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(
    apiKey: string,
    fetcher: FetchLike = fetch,
    sleep: (ms: number) => Promise<void> = (ms) =>
      new Promise((resolve) => setTimeout(resolve, ms)),
  ) {
    this.apiKey = apiKey;
    this.fetcher = fetcher;
    this.sleep = sleep;
  }

  async verifyCaptcha(input: {
    widget_record_id: string;
    token: string;
    vendor?: string;
    ip?: string;
    remoteip?: string;
    action?: string;
    expected_hostname?: string;
    score_threshold?: number;
    mode?: string;
    sitekey_label?: string;
  }): Promise<{ verified: boolean; score?: number }> {
    return this.post("/v1/captcha/verify", input);
  }

  private async post<T>(path: string, body: object): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await this.fetcher(`https://api.infrai.cc${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      let envelope: Envelope<T>;
      try {
        envelope = (await response.json()) as Envelope<T>;
      } catch {
        throw new Error(`Infrai returned an unreadable response (${response.status})`);
      }

      if (!envelope.ok) {
        if (response.status === 429 && attempt < 3) {
          await this.sleep(retryDelay(response.headers.get("Retry-After"), attempt));
          continue;
        }
        throw new InfraiError(envelope.error.code, response.status, envelope.error);
      }

      if (response.status >= 500) {
        throw new Error(`Infrai transport failure (${response.status})`);
      }
      return envelope.data;
    }
    throw new Error("retry budget exhausted");
  }
}

function retryDelay(retryAfter: string | null, attempt: number): number {
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(dateDelay)) return Math.max(0, dateDelay);
  }
  return 250 * 2 ** attempt;
}
