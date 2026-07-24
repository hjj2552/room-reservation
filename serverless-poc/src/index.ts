import { createHttpApp } from "./http/app";
import { parseRuntimeConfig } from "./core/runtime-config";
import { NeonP3Repository } from "./infra/neon-repository";

interface Bindings {
  APP_ENV: string;
  DATABASE_URL: string;
  E2E_CLEANUP_ENABLED: string;
}

export default {
  async fetch(request: Request, env: Bindings): Promise<Response> {
    const config = parseRuntimeConfig(env);
    const repository = NeonP3Repository.fromConnectionString(env.DATABASE_URL);
    const app = createHttpApp(config, {
      sessions: repository,
      cleanup: repository,
      now: () => new Date(),
    });
    return await app.fetch(request, env);
  },
} satisfies ExportedHandler<Bindings>;
