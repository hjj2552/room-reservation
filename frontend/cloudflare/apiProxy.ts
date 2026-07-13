const BODYLESS_METHODS = new Set(["GET", "HEAD"]);

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "content-length",
  "host",
  "keep-alive",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

type UpstreamFetch = (request: Request) => Promise<Response>;

class BackendOriginConfigurationError extends Error {}

function parseBackendOrigin(value: string | undefined): URL {
  if (!value?.trim()) {
    throw new BackendOriginConfigurationError();
  }

  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new BackendOriginConfigurationError();
  }

  const isLocalHost = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  const isAllowedProtocol = url.protocol === "https:" || (url.protocol === "http:" && isLocalHost);

  if (
    !isAllowedProtocol ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  ) {
    throw new BackendOriginConfigurationError();
  }

  return new URL(url.origin);
}

function createUpstreamHeaders(request: Request, incomingUrl: URL): Headers {
  const headers = new Headers(request.headers);
  const connectionTokens = (headers.get("connection") ?? "")
    .split(",")
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);

  for (const name of [...headers.keys()]) {
    const lowerName = name.toLowerCase();
    if (
      HOP_BY_HOP_HEADERS.has(lowerName) ||
      lowerName.startsWith("proxy-") ||
      connectionTokens.includes(lowerName)
    ) {
      headers.delete(name);
    }
  }

  headers.delete("x-forwarded-for");
  headers.set("x-forwarded-proto", "https");
  headers.set("x-forwarded-host", incomingUrl.host);

  const connectingIp = request.headers.get("cf-connecting-ip")?.trim();
  if (connectingIp) {
    headers.set("x-forwarded-for", connectingIp);
  }

  return headers;
}

function jsonError(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ code, message }), {
    status,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
    },
  });
}

export async function proxyApiRequest(
  request: Request,
  backendOriginValue: string | undefined,
  upstreamFetch: UpstreamFetch = fetch,
): Promise<Response> {
  let backendOrigin: URL;
  try {
    backendOrigin = parseBackendOrigin(backendOriginValue);
  } catch {
    return jsonError(
      500,
      "PROXY_CONFIGURATION_ERROR",
      "The API proxy is not configured correctly.",
    );
  }

  const incomingUrl = new URL(request.url);
  const targetUrl = new URL(`${incomingUrl.pathname}${incomingUrl.search}`, backendOrigin);
  const method = request.method.toUpperCase();

  try {
    const body =
      BODYLESS_METHODS.has(method) || request.body === null
        ? undefined
        : await request.arrayBuffer();
    const upstreamRequest = new Request(targetUrl, {
      method,
      headers: createUpstreamHeaders(request, incomingUrl),
      body,
      cache: "no-store",
      redirect: "manual",
    });

    // Returning the original Response preserves separate Set-Cookie headers.
    return await upstreamFetch(upstreamRequest);
  } catch {
    return jsonError(502, "UPSTREAM_UNAVAILABLE", "The API service is temporarily unavailable.");
  }
}
