import { pathToFileURL } from 'node:url';

const defaultBackendUrl = 'http://127.0.0.1:8080/api/public/settings';
const defaultPrefix = 'e2e-';

export async function cleanupE2eData({
  required = true,
  label = 'manual',
  preview = false,
  includeLegacy = false,
} = {}) {
  try {
    const apiBaseUrl = resolveApiBaseUrl();
    const prefix = process.env.E2E_TEST_DATA_PREFIX || defaultPrefix;
    const cookie = await login(apiBaseUrl);
    const params = new URLSearchParams({
      prefix,
      includeLegacy: String(includeLegacy),
    });
    const path = preview ? '/api/admin/test-data/e2e/preview' : '/api/admin/test-data/e2e';
    const cleanupUrl = `${apiBaseUrl}${path}?${params.toString()}`;
    const response = await fetch(cleanupUrl, {
      method: preview ? 'GET' : 'DELETE',
      headers: {
        Cookie: cookie,
      },
    });

    if (response.status === 404 && !required) {
      console.warn(`E2E cleanup skipped (${label}): cleanup endpoint is not available.`);
      return null;
    }

    if (!response.ok) {
      const body = await response.text();
      const message = buildFailureMessage({
        label,
        status: response.status,
        body,
        cleanupUrl,
        apiBaseUrl,
      });
      if (required) {
        throw new Error(message);
      }
      console.warn(message);
      return null;
    }

    const summary = await response.json();
    console.log(
      `E2E cleanup ${preview ? 'preview' : 'complete'} (${label}): ` +
        `${summary.reservationsDeleted} reservations, ` +
        `${summary.recurrencesDeleted} recurrences, ` +
        `${summary.tagsDeleted} tags ${preview ? 'matched' : 'deleted'}, ` +
        `${summary.tagsSkipped} tags skipped, ` +
        `${summary.roomsDeleted} rooms ${preview ? 'matched' : 'deleted'}, ` +
        `${summary.roomsSkipped} rooms skipped.`
    );
    return summary;
  } catch (error) {
    if (required) {
      throw error;
    }
    console.warn(`E2E cleanup skipped (${label}): ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

function resolveApiBaseUrl() {
  if (process.env.E2E_API_BASE_URL) {
    return trimTrailingSlash(process.env.E2E_API_BASE_URL);
  }
  if (process.env.VITE_API_PROXY_TARGET) {
    return trimTrailingSlash(process.env.VITE_API_PROXY_TARGET);
  }
  const backendUrl = new URL(process.env.E2E_BACKEND_URL || defaultBackendUrl);
  return `${backendUrl.protocol}//${backendUrl.host}`;
}

async function login(apiBaseUrl) {
  const response = await fetch(`${apiBaseUrl}/api/auth/admin/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      username: process.env.ADMIN_USERNAME || 'admin',
      password: process.env.ADMIN_PASSWORD || 'admin1234',
    }),
  });

  if (!response.ok) {
    throw new Error(`Admin login for E2E cleanup failed with ${response.status}: ${await response.text()}`);
  }

  const cookie = extractCookieHeader(response.headers);
  if (!cookie) {
    throw new Error('Admin login for E2E cleanup did not return a session cookie.');
  }
  return cookie;
}

function extractCookieHeader(headers) {
  const getSetCookie = headers.getSetCookie?.bind(headers);
  const values = getSetCookie ? getSetCookie() : [headers.get('set-cookie')].filter(Boolean);
  return values.map((value) => value.split(';')[0]).join('; ');
}

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, '');
}

function buildFailureMessage({ label, status, body, cleanupUrl, apiBaseUrl }) {
  let message = `E2E cleanup failed (${label}) with ${status} at ${cleanupUrl}: ${body}`;
  if (status === 404) {
    message +=
      `\nCleanup endpoint was not found on ${apiBaseUrl}. ` +
      'For local/dev, restart the backend with E2E_CLEANUP_ENABLED=true, or use start-backend-cleanup-enabled.bat from the repository root. ' +
      'Make sure this script points at that backend via E2E_API_BASE_URL or E2E_BACKEND_URL. ' +
      'The cleanup endpoint is intentionally unavailable in prod.';
  }
  return message;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = new Set(process.argv.slice(2));
  cleanupE2eData({
    preview: args.has('--preview'),
    includeLegacy: args.has('--include-legacy'),
  }).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
