export interface NeonDataApiClientOptions {
  baseUrl?: string | undefined;
  accessToken?: string | undefined;
  fetchImpl?: typeof fetch | undefined;
}

export class NeonDataApiClient {
  private readonly baseUrl: string;
  private readonly accessToken?: string | undefined;
  private readonly fetchImpl: typeof fetch;

  constructor(options: NeonDataApiClientOptions = {}) {
    const baseUrl = options.baseUrl ?? process.env.NEON_DATA_API_URL;
    if (!baseUrl) throw new Error("NEON_DATA_API_URL is not configured");
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.accessToken = options.accessToken;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async query<T = unknown>(
    path: string,
    init: RequestInit = {},
  ): Promise<T> {
    if (!path.startsWith("/")) throw new Error("Neon Data API path must start with '/'");

    const headers = new Headers(init.headers);
    headers.set("Accept", "application/json");
    if (this.accessToken) headers.set("Authorization", `Bearer ${this.accessToken}`);

    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      headers,
      cache: "no-store",
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Neon Data API request failed (${response.status}): ${body.slice(0, 500)}`);
    }

    return response.json() as Promise<T>;
  }
}

export function neonDataApiConfig() {
  return {
    enabled: Boolean(process.env.NEON_DATA_API_URL),
    url: process.env.NEON_DATA_API_URL ?? null,
    authUrl: process.env.NEON_AUTH_URL ?? null,
  };
}
