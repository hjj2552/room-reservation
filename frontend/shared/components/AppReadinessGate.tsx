import { useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  appReadinessPolicy,
  fetchReadinessSettings,
  isRetryableReadinessError,
  readinessRetryDelay,
} from '../api/readiness';
import { publicReservationKeys } from '../hooks/usePublicReservation';

const loadingMessage = '데이터를 불러오는 중입니다. 잠시만 기다려주세요...';
const failureMessage = '데이터를 불러오지 못했습니다. 새로고침하거나 잠시 후 다시 시도해주세요.';

type ReadinessState = 'checking' | 'recovering' | 'ready' | 'failed';

export function AppReadinessGate({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [readinessState, setReadinessState] = useState<ReadinessState>('checking');
  const [showLoading, setShowLoading] = useState(false);

  useEffect(() => {
    const lifecycleController = new AbortController();
    let active = true;
    const loadingTimer = window.setTimeout(() => {
      if (active) setShowLoading(true);
    }, appReadinessPolicy.loadingDelayMs);

    const transitionTo = (state: Exclude<ReadinessState, 'checking'>) => {
      if (!active) return;
      window.clearTimeout(loadingTimer);
      setShowLoading(false);
      setReadinessState(state);
    };

    const finishReady = (settings: Awaited<ReturnType<typeof fetchReadinessSettings>>) => {
      if (!active || lifecycleController.signal.aborted) return;
      queryClient.setQueryData(publicReservationKeys.settings, settings);
      transitionTo('ready');
    };

    const recoverReadiness = async () => {
      transitionTo('recovering');

      while (active && !lifecycleController.signal.aborted) {
        await waitForRetry(
          appReadinessPolicy.recoveryIntervalMs,
          lifecycleController.signal,
        );
        if (!active || lifecycleController.signal.aborted) return;

        try {
          const settings = await fetchReadinessSettings(lifecycleController.signal);
          finishReady(settings);
          return;
        } catch (error) {
          if (!active || lifecycleController.signal.aborted) return;
          if (!isRetryableReadinessError(error)) {
            transitionTo('failed');
            return;
          }
        }
      }
    };

    const checkReadiness = async () => {
      const deadline = Date.now() + appReadinessPolicy.maxWaitMs;
      let failedAttempts = 0;

      while (active && !lifecycleController.signal.aborted) {
        const remainingMs = deadline - Date.now();
        if (remainingMs <= 0) {
          await recoverReadiness();
          return;
        }

        try {
          const settings = await fetchReadinessSettings(
            lifecycleController.signal,
            Math.min(appReadinessPolicy.requestTimeoutMs, remainingMs),
          );
          if (!active || lifecycleController.signal.aborted) return;
          finishReady(settings);
          return;
        } catch (error) {
          if (!active || lifecycleController.signal.aborted) return;
          if (!isRetryableReadinessError(error)) {
            transitionTo('failed');
            return;
          }
        }

        failedAttempts += 1;
        const waitMs = Math.min(
          readinessRetryDelay(failedAttempts),
          Math.max(deadline - Date.now(), 0),
        );
        if (waitMs <= 0) {
          await recoverReadiness();
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
      window.clearTimeout(loadingTimer);
      lifecycleController.abort();
    };
  }, [queryClient]);

  if (readinessState === 'ready') {
    return children;
  }

  if (readinessState === 'recovering' || readinessState === 'failed') {
    return (
      <main
        className="app-readiness-page"
        role="alert"
        aria-busy={readinessState === 'recovering'}
      >
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
