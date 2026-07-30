import { X } from 'lucide-react';
import {
  useEffect,
  useId,
  useRef,
  type KeyboardEvent,
  type ReactNode,
} from 'react';

interface SidePanelProps {
  title: ReactNode;
  children: ReactNode;
  onClose: () => void;
  description?: ReactNode;
  className?: string;
  titleId?: string;
  testId?: string;
  backdropTestId?: string;
  closeTestId?: string;
  closeButtonLabel?: string;
}

export function SidePanel({
  title,
  children,
  onClose,
  description,
  className = '',
  titleId,
  testId,
  backdropTestId,
  closeTestId,
  closeButtonLabel = '패널 닫기',
}: SidePanelProps) {
  const generatedTitleId = useId();
  const resolvedTitleId = titleId || generatedTitleId;
  const panelRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );

  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    const previousRootOverflow = root.style.overflow;
    const previousBodyOverflow = body.style.overflow;
    const previousBodyPosition = body.style.position;
    const previousBodyTop = body.style.top;
    const previousBodyLeft = body.style.left;
    const previousBodyWidth = body.style.width;

    root.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.left = `-${scrollX}px`;
    body.style.width = '100%';
    closeButtonRef.current?.focus();

    return () => {
      root.style.overflow = previousRootOverflow;
      body.style.overflow = previousBodyOverflow;
      body.style.position = previousBodyPosition;
      body.style.top = previousBodyTop;
      body.style.left = previousBodyLeft;
      body.style.width = previousBodyWidth;
      window.scrollTo(scrollX, scrollY);
      if (returnFocusRef.current?.isConnected) returnFocusRef.current.focus();
    };
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key !== 'Tab') return;
    const focusable = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
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
      className="side-panel-backdrop"
      role="presentation"
      data-testid={backdropTestId}
    >
      <aside
        ref={panelRef}
        className={`side-panel${className ? ` ${className}` : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={resolvedTitleId}
        onKeyDown={handleKeyDown}
        data-testid={testId}
      >
        <div className="side-panel-header">
          <div>
            <h2 id={resolvedTitleId}>{title}</h2>
            {description ? <p className="muted">{description}</p> : null}
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className="ghost-button icon-button side-panel-close"
            onClick={onClose}
            aria-label={closeButtonLabel}
            data-testid={closeTestId}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        <div className="side-panel-body">{children}</div>
      </aside>
    </div>
  );
}
