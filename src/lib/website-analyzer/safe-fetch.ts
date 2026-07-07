import "server-only";
import { assertSafeHttpUrl } from "./ssrf-guard";
import { FETCH_TIMEOUT_MS, MAX_REDIRECTS, USER_AGENT } from "./constants";

export class FetchError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "FetchError";
  }
}

export type SafeFetchResult = {
  status: number;
  finalUrl: string;
  body: string;
  contentType: string | null;
};

/**
 * Fetches `rawUrl` with SSRF protection (re-checked on every redirect hop), a
 * hard timeout, and a byte cap on the response body. Does not throw on
 * non-2xx responses — callers can inspect `status`. Only ever issues a
 * single request per hop; never retries and never follows links found on
 * the page.
 */
export async function safeFetchText(rawUrl: string, maxBytes: number): Promise<SafeFetchResult> {
  let url = await assertSafeHttpUrl(rawUrl);

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(url, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/html,application/xhtml+xml",
        },
      });
    } catch (error) {
      throw new FetchError("Could not reach that website.", error);
    } finally {
      clearTimeout(timeout);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) {
        throw new FetchError("Received a redirect with no destination.");
      }
      url = await assertSafeHttpUrl(new URL(location, url).toString());
      continue;
    }

    const body = await readCappedBody(response, maxBytes);
    return {
      status: response.status,
      finalUrl: url.toString(),
      body,
      contentType: response.headers.get("content-type"),
    };
  }

  throw new FetchError("Too many redirects.");
}

/** Reads at most `maxBytes` of the response body; stops early (does not throw) if it's larger. */
async function readCappedBody(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel();
      break;
    }
    chunks.push(value);
  }

  const combined = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder("utf-8", { fatal: false }).decode(combined);
}
