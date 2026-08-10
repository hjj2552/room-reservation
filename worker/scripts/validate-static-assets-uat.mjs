import { disposableUatOriginFromEnv } from "./cloudflare-uat-origin.mjs";

const baseUrl = new URL(disposableUatOriginFromEnv());

async function fetchPath(pathname) {
  const response = await fetch(new URL(pathname, baseUrl), {
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Static Assets UAT request failed for ${pathname}`);
  return response;
}

const deepLinks = [
  "/",
  "/timetable",
  "/reservations/00000000-0000-4000-8000-000000000001",
  "/reservations/00000000-0000-4000-8000-000000000001/edit",
  "/admin/reservations",
];
for (const pathname of deepLinks) {
  const response = await fetchPath(pathname);
  if (!(response.headers.get("content-type") ?? "").toLowerCase().includes("text/html")) {
    throw new Error(`SPA deep link did not return HTML for ${pathname}`);
  }
}

const indexHtml = await (await fetchPath("/")).text();
const assetPaths = [...indexHtml.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((match) => match[1]);
if (!assetPaths.some((asset) => asset.endsWith(".js")) || !assetPaths.some((asset) => asset.endsWith(".css"))) {
  throw new Error("Built JavaScript and CSS assets were not linked from the SPA shell");
}
for (const assetPath of assetPaths) await fetchPath(assetPath);

const cssPaths = assetPaths.filter((asset) => asset.endsWith(".css"));
const fontPaths = [];
for (const cssPath of cssPaths) {
  const css = await (await fetchPath(cssPath)).text();
  fontPaths.push(...[...css.matchAll(/url\((?:['"]?)(\/assets\/[^)'"?]+\.woff2)(?:['"]?)\)/g)].map((match) => match[1]));
}
if (fontPaths.length === 0) throw new Error("Wanted Sans font asset was not found in built CSS");
for (const fontPath of new Set(fontPaths)) await fetchPath(fontPath);

const settings = await fetchPath("/api/public/settings");
if (!(settings.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) {
  throw new Error("Same-origin API did not return JSON");
}
const admin = await fetch(new URL("/api/admin/rooms", baseUrl), { redirect: "error" });
if (admin.status !== 401) throw new Error("Admin API protection contract is invalid");

process.stdout.write("Disposable Static Assets Worker routing verified.\n");
