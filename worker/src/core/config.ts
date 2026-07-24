export type AppEnvironment = "local" | "test" | "e2e" | "uat" | "prod";

const environments = new Set<AppEnvironment>(["local", "test", "e2e", "uat", "prod"]);

export interface RuntimeConfig {
  appEnvironment: AppEnvironment;
  e2eCleanupEnabled: boolean;
  secureCookies: boolean;
}

export function parseRuntimeConfig(input: {
  APP_ENV?: string;
  E2E_CLEANUP_ENABLED?: string;
}): RuntimeConfig {
  if (!input.APP_ENV || !environments.has(input.APP_ENV as AppEnvironment)) {
    throw new Error("APP_ENV must be one of local, test, e2e, uat, prod");
  }
  if (input.E2E_CLEANUP_ENABLED !== "true" && input.E2E_CLEANUP_ENABLED !== "false") {
    throw new Error("E2E_CLEANUP_ENABLED must be exactly true or false");
  }
  const appEnvironment = input.APP_ENV as AppEnvironment;
  return {
    appEnvironment,
    e2eCleanupEnabled: input.E2E_CLEANUP_ENABLED === "true",
    secureCookies: appEnvironment !== "local" && appEnvironment !== "test",
  };
}

export function shouldRegisterCleanup(config: RuntimeConfig): boolean {
  return config.appEnvironment !== "prod" && config.e2eCleanupEnabled;
}
