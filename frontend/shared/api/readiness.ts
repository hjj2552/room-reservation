import type { PublicSettings } from './types';

export const appReadinessPolicy = {
  requestTimeoutMs: 10_000,
  maxWaitMs: 90_000,
  loadingDelayMs: 300,
  maxRetryDelayMs: 5_000,
} as const;

export class ReadinessRequestError extends Error {
  retryable: boolean;

  constructor(message: string, retryable: boolean) {
    super(message);
    this.name = 'ReadinessRequestError';
    this.retryable = retryable;
  }
}

export function isRetryableReadinessError(error: unknown) {
  return !(error instanceof ReadinessRequestError) || error.retryable;
}

export function readinessRetryDelay(failedAttempts: number, random = Math.random) {
  const baseDelay = Math.min(Math.max(failedAttempts, 1), 5) * 1_000;
  const jitteredDelay = baseDelay * (0.9 + random() * 0.2);
  return Math.min(Math.round(jitteredDelay), appReadinessPolicy.maxRetryDelayMs);
}

export async function fetchReadinessSettings(
  signal: AbortSignal,
  timeoutMs: number = appReadinessPolicy.requestTimeoutMs,
): Promise<PublicSettings> {
  const requestController = new AbortController();
  const abortRequest = () => requestController.abort(signal.reason);
  signal.addEventListener('abort', abortRequest, { once: true });

  const timeout = window.setTimeout(() => {
    requestController.abort(new DOMException('Readiness request timed out.', 'TimeoutError'));
  }, timeoutMs);

  try {
    const response = await fetch('/api/public/settings', {
      cache: 'no-store',
      credentials: 'include',
      headers: { Accept: 'application/json' },
      signal: requestController.signal,
    });

    if (!response.ok) {
      throw new ReadinessRequestError(
        `Readiness request failed with status ${response.status}.`,
        isRetryableStatus(response.status),
      );
    }

    const mediaType = response.headers.get('content-type')
      ?.split(';', 1)[0]
      .trim()
      .toLowerCase();
    if (mediaType !== 'application/json') {
      throw new ReadinessRequestError('Readiness response was not JSON.', true);
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new ReadinessRequestError('Readiness response could not be parsed.', true);
    }

    if (!isPublicSettingsShape(body)) {
      throw new ReadinessRequestError('Readiness response had an unexpected shape.', true);
    }

    return body;
  } catch (error) {
    if (error instanceof ReadinessRequestError) {
      throw error;
    }
    throw new ReadinessRequestError('Readiness request could not be completed.', true);
  } finally {
    window.clearTimeout(timeout);
    signal.removeEventListener('abort', abortRequest);
  }
}

function isRetryableStatus(status: number) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function isPublicSettingsShape(value: unknown): value is PublicSettings {
  return typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
    && typeof (value as Record<string, unknown>).organizationName === 'string';
}
