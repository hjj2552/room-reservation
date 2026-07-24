import type { AppEnvironment } from "./ports";

const APP_ENVIRONMENTS = new Set<AppEnvironment>(["local", "test", "e2e", "uat", "prod"]);

export interface RuntimeConfig {
  appEnvironment: AppEnvironment;
  e2eCleanupEnabled: boolean;
}

export function parseRuntimeConfig(input: {
  APP_ENV?: string;
  E2E_CLEANUP_ENABLED?: string;
}): RuntimeConfig {
  const appEnvironment = input.APP_ENV;
  if (!appEnvironment || !APP_ENVIRONMENTS.has(appEnvironment as AppEnvironment)) {
    throw new Error("APP_ENV must be one of local, test, e2e, uat, prod");
  }

  if (input.E2E_CLEANUP_ENABLED !== "true" && input.E2E_CLEANUP_ENABLED !== "false") {
    throw new Error("E2E_CLEANUP_ENABLED must be exactly true or false");
  }

  return {
    appEnvironment: appEnvironment as AppEnvironment,
    e2eCleanupEnabled: input.E2E_CLEANUP_ENABLED === "true",
  };
}

export function shouldRegisterCleanup(config: RuntimeConfig): boolean {
  return config.appEnvironment !== "prod" && config.e2eCleanupEnabled;
}
