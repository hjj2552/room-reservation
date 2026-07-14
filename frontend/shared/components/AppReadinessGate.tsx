import { useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  appReadinessPolicy,
  fetchReadinessSettings,
  isRetryableReadinessError,
  readinessRetryDelay,
} from '../api/readiness';
import { publicReservationKeys } from '../hooks/usePublicReservation';

const loadingMessage = '데이터를 불러오는 중입니다. 최대 3분 정도 걸릴 수 있습니다.';
const failureMessage = '데이터를 불러오지 못했습니다. 새로고침하거나 잠시 후 다시 시도해주세요.';

type ReadinessState = 'checking' | 'ready' | 'failed';

export function AppReadinessGate({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [readinessState, setReadinessState] = useState<ReadinessState>('checking');
  const [showLoading, setShowLoading] = useState(false);

  useEffect(() => {
    const lifecycleController = new AbortController();
    const deadline = Date.now() + appReadinessPolicy.maxWaitMs;
    let active = true;
    let loadingTimer: number | undefined;
    let deadlineTimer: number | undefined;

    const clearTimers = () => {
      if (loadingTimer !== undefined) window.clearTimeout(loadingTimer);
      if (deadlineTimer !== undefined) window.clearTimeout(deadlineTimer);
    };

    const finish = (state: Exclude<ReadinessState, 'checking'>) => {
      if (!active || lifecycleController.signal.aborted) return;
      clearTimers();
      lifecycleController.abort();
      setShowLoading(false);
      setReadinessState(state);
    };

    loadingTimer = window.setTimeout(() => {
      if (active) setShowLoading(true);
    }, appReadinessPolicy.loadingDelayMs);
    deadlineTimer = window.setTimeout(() => finish('failed'), appReadinessPolicy.maxWaitMs);

    const finishReady = (settings: Awaited<ReturnType<typeof fetchReadinessSettings>>) => {
      if (!active || lifecycleController.signal.aborted) return;
      queryClient.setQueryData(publicReservationKeys.settings, settings);
      finish('ready');
    };

    const checkReadiness = async () => {
      let failedAttempts = 0;

      while (active && !lifecycleController.signal.aborted) {
        const remainingMs = deadline - Date.now();
        if (remainingMs <= 0) {
          finish('failed');
          return;
        }

        try {
          const settings = await fetchReadinessSettings(
            lifecycleController.signal,
            Math.min(appReadinessPolicy.requestTimeoutMs, remainingMs),
          );
          if (!active || lifecycleController.signal.aborted) return;
          if (Date.now() >= deadline) {
            finish('failed');
            return;
          }
          finishReady(settings);
          return;
        } catch (error) {
          if (!active || lifecycleController.signal.aborted) return;
          if (!isRetryableReadinessError(error)) {
            finish('failed');
            return;
          }
        }

        failedAttempts += 1;
        const waitMs = Math.min(
          readinessRetryDelay(failedAttempts),
          Math.max(deadline - Date.now(), 0),
        );
        if (waitMs <= 0) {
          finish('failed');
          return;
        }

        await waitForRetry(waitMs, lifecycleController.signal);
      }
    };

    queueMicrotask(() => {
      if (active) void checkReadiness();
    });

    return () => {
      active = false;
      clearTimers();
      lifecycleController.abort();
    };
  }, [queryClient]);

  if (readinessState === 'ready') {
    return children;
  }

  if (readinessState === 'failed') {
    return (
      <main className="app-readiness-page" role="alert">
        <p>{failureMessage}</p>
      </main>
    );
  }

  return (
    <main
      className="app-readiness-page"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      {showLoading ? <p>{loadingMessage}</p> : null}
    </main>
  );
}

function waitForRetry(delayMs: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const timer = window.setTimeout(() => {
      signal.removeEventListener('abort', handleAbort);
      resolve();
    }, delayMs);
    const handleAbort = () => {
      window.clearTimeout(timer);
      resolve();
    };
    signal.addEventListener('abort', handleAbort, { once: true });
  });
}
