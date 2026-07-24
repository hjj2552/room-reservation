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

export const TRUSTED_CLIENT_IP_HEADER = "X-Room-Reservation-Client-IP";

export interface ServiceBinding {
  fetch(request: Request): Promise<Response>;
}

export type ApiProxyTransport =
  | {
      kind: "service-binding";
      service: ServiceBinding;
    }
  | {
      kind: "backend-origin";
      backendOrigin: string | undefined;
      upstreamFetch?: UpstreamFetch;
    };

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
  headers.delete(TRUSTED_CLIENT_IP_HEADER);
  headers.delete("cf-connecting-ip");
  headers.set("x-forwarded-proto", "https");
  headers.set("x-forwarded-host", incomingUrl.host);

  const connectingIp = request.headers.get("cf-connecting-ip")?.trim();
  if (connectingIp) {
    headers.set(TRUSTED_CLIENT_IP_HEADER, connectingIp);
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
  transport: ApiProxyTransport,
): Promise<Response> {
  const incomingUrl = new URL(request.url);
  let targetUrl: URL;
  let upstreamFetch: UpstreamFetch;
  if (transport.kind === "service-binding") {
    targetUrl = new URL(`${incomingUrl.pathname}${incomingUrl.search}`, incomingUrl.origin);
    upstreamFetch = (upstreamRequest) => transport.service.fetch(upstreamRequest);
  } else {
    try {
      const backendOrigin = parseBackendOrigin(transport.backendOrigin);
      targetUrl = new URL(`${incomingUrl.pathname}${incomingUrl.search}`, backendOrigin);
    } catch {
      return jsonError(
        500,
        "PROXY_CONFIGURATION_ERROR",
        "The API proxy is not configured correctly.",
      );
    }
    upstreamFetch = transport.upstreamFetch ?? fetch;
  }
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
