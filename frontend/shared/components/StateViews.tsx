import { errorMessage } from '../api/http';

export function LoadingState({ message = '불러오는 중입니다.' }: { message?: string }) {
  return (
    <div className="state-box" role="status" aria-live="polite">
      {message}
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return <div className="state-box empty">{message}</div>;
}

export function ErrorState({ error }: { error: unknown }) {
  return (
    <div className="state-box error" role="alert">
      {errorMessage(error)}
    </div>
  );
}
