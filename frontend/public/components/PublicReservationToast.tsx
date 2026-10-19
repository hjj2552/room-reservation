import { Check } from 'lucide-react';
import { useEffect } from 'react';

export function PublicReservationToast({ toast, onClose, testId = 'public-reservation-success-toast' }: {
  toast: { message: string } | null;
  onClose: (value: null) => void;
  testId?: string;
}) {
  useEffect(() => {
    if (!toast) return;
    const timeoutId = window.setTimeout(() => onClose(null), 6_000);
    return () => window.clearTimeout(timeoutId);
  }, [toast, onClose]);

  return toast ? (
    <div className="public-reservation-success-toast" role="status" aria-live="polite" aria-atomic="true" data-testid={testId}>
      <Check size={20} strokeWidth={2.5} aria-hidden="true" data-testid="public-reservation-success-icon" />
      <span>{toast.message}</span>
    </div>
  ) : null;
}
