import { proxyApiRequest } from "../../cloudflare/apiProxy";

interface Env {
  BACKEND_ORIGIN?: string;
}

interface FunctionContext {
  request: Request;
  env: Env;
}

export function onRequest({ request, env }: FunctionContext): Promise<Response> {
  return proxyApiRequest(request, env.BACKEND_ORIGIN);
}
