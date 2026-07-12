import { X } from 'lucide-react';
import {
  useEffect,
  useId,
  useRef,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';

interface ModalDialogProps {
  title: ReactNode;
  children: ReactNode;
  onClose: () => void;
  className?: string;
  titleId?: string;
  ariaDescribedBy?: string;
  testId?: string;
  backdropTestId?: string;
  showCloseButton?: boolean;
  closeButtonLabel?: string;
  closeOnBackdrop?: boolean;
  closeDisabled?: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
}

export function ModalDialog({
  title,
  children,
  onClose,
  className = '',
  titleId,
  ariaDescribedBy,
  testId,
  backdropTestId,
  showCloseButton = false,
  closeButtonLabel = '닫기',
  closeOnBackdrop = false,
  closeDisabled = false,
  initialFocusRef,
}: ModalDialogProps) {
  const generatedTitleId = useId();
  const resolvedTitleId = titleId || generatedTitleId;
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );

  useEffect(() => {
    const initialFocus = initialFocusRef?.current
      || (showCloseButton ? closeButtonRef.current : null)
      || dialogRef.current?.querySelector<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
    initialFocus?.focus();

    return () => {
      if (returnFocusRef.current?.isConnected) returnFocusRef.current.focus();
    };
  }, [initialFocusRef, showCloseButton]);

  function handleDialogKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape' && !closeDisabled) {
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key !== 'Tab') return;
    const focusable = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'),
    );
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (closeOnBackdrop && !closeDisabled && event.target === event.currentTarget) onClose();
      }}
      data-testid={backdropTestId}
    >
      <section
        ref={dialogRef}
        className={`modal-panel${className ? ` ${className}` : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={resolvedTitleId}
        aria-describedby={ariaDescribedBy}
        onKeyDown={handleDialogKeyDown}
        data-testid={testId}
      >
        <div className="modal-header">
          <h2 id={resolvedTitleId}>{title}</h2>
          {showCloseButton ? (
            <button
              ref={closeButtonRef}
              type="button"
              className="modal-close-button"
              onClick={onClose}
              disabled={closeDisabled}
              aria-label={closeButtonLabel}
              title="닫기"
            >
              <X size={18} aria-hidden="true" />
            </button>
          ) : null}
        </div>
        {children}
      </section>
    </div>
  );
}
