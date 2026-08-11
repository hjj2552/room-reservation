const names = [
  "CLOUDFLARE_ACCOUNT_ID",
  "CLOUDFLARE_PRODUCTION_ORIGIN",
  "CLOUDFLARE_WORKER_NAME",
  "CLOUDFLARE_INGRESS_RATE_LIMIT_NAMESPACE_ID",
  "CLOUDFLARE_READ_RATE_LIMIT_NAMESPACE_ID",
  "CLOUDFLARE_WRITE_RATE_LIMIT_NAMESPACE_ID",
];

for (const name of names) {
  const value = process.env[name]?.trim();
  if (value) process.stdout.write(`::add-mask::${value}\n`);
}
