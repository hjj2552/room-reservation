import {
  proxyApiRequest,
  type ApiProxyTransport,
  type ServiceBinding,
} from "../../cloudflare/apiProxy.ts";

export interface Env {
  API_PROXY_TRANSPORT?: string;
  API_BACKEND?: ServiceBinding;
  BACKEND_ORIGIN?: string;
}

interface FunctionContext {
  request: Request;
  env: Env;
}

function configurationError(): Response {
  return new Response(JSON.stringify({
    code: "PROXY_CONFIGURATION_ERROR",
    message: "The API proxy is not configured correctly.",
  }), {
    status: 500,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
    },
  });
}

export function selectApiProxyTransport(env: Env): ApiProxyTransport | null {
  if (env.API_PROXY_TRANSPORT === "service-binding") {
    if (!env.API_BACKEND || typeof env.API_BACKEND.fetch !== "function") return null;
    return { kind: "service-binding", service: env.API_BACKEND };
  }
  if (env.API_PROXY_TRANSPORT === "backend-origin") {
    return { kind: "backend-origin", backendOrigin: env.BACKEND_ORIGIN };
  }
  return null;
}

export function onRequest({ request, env }: FunctionContext): Promise<Response> | Response {
  const transport = selectApiProxyTransport(env);
  if (!transport) return configurationError();
  return proxyApiRequest(request, transport);
}
