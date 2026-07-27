import { productionCloudflareValuesFromEnv } from "./cloudflare-production-config.mjs";

productionCloudflareValuesFromEnv();
process.stdout.write("Cloudflare production deployment configuration verified.\n");
