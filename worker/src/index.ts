import { createHttpApp } from "./http/app";
import { parseRuntimeConfig } from "./core/config";
import { NeonDatabase } from "./infra/neon-database";
import { ProductService } from "./services/product-service";
import { SessionService } from "./services/session-service";

export interface WorkerEnv {
  DATABASE_URL: string;
  ADMIN_USERNAME: string;
  ADMIN_PASSWORD: string;
  APP_ENV: string;
  E2E_CLEANUP_ENABLED: string;
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const config = parseRuntimeConfig(env);
    if (!env.DATABASE_URL) throw new Error("DATABASE_URL is required");
    if (!env.ADMIN_USERNAME || !env.ADMIN_PASSWORD) throw new Error("ADMIN_USERNAME and ADMIN_PASSWORD are required");
    const database = new NeonDatabase(env.DATABASE_URL);
    const now = () => new Date();
    const app = createHttpApp(config, {
      products: new ProductService(database, now),
      sessions: new SessionService(database, now),
      adminUsername: env.ADMIN_USERNAME,
      adminPassword: env.ADMIN_PASSWORD,
    });
    return await app.fetch(request);
  },
};
