import { X } from 'lucide-react';
import {
  useEffect,
  useId,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
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

interface DocumentScrollLock {
  count: number;
  root: HTMLElement;
  body: HTMLElement;
  scrollX: number;
  scrollY: number;
  previousRootOverflow: string;
  previousBodyOverflow: string;
  previousBodyPosition: string;
  previousBodyTop: string;
  previousBodyLeft: string;
  previousBodyWidth: string;
  previousBodyPaddingRight: string;
}

let documentScrollLock: DocumentScrollLock | null = null;

function acquireDocumentScrollLock() {
  if (documentScrollLock) {
    documentScrollLock.count += 1;
    return releaseDocumentScrollLock;
  }

  const root = document.documentElement;
  const body = document.body;
  const scrollbarWidth = Math.max(0, window.innerWidth - root.clientWidth);
  const computedBodyPaddingRight = Number.parseFloat(getComputedStyle(body).paddingRight) || 0;

  documentScrollLock = {
    count: 1,
    root,
    body,
    scrollX: window.scrollX,
    scrollY: window.scrollY,
    previousRootOverflow: root.style.overflow,
    previousBodyOverflow: body.style.overflow,
    previousBodyPosition: body.style.position,
    previousBodyTop: body.style.top,
    previousBodyLeft: body.style.left,
    previousBodyWidth: body.style.width,
    previousBodyPaddingRight: body.style.paddingRight,
  };

  root.style.overflow = 'hidden';
  body.style.overflow = 'hidden';
  body.style.position = 'fixed';
  body.style.top = `-${documentScrollLock.scrollY}px`;
  body.style.left = `-${documentScrollLock.scrollX}px`;
  body.style.width = '100%';
  if (scrollbarWidth > 0) {
    body.style.paddingRight = `${computedBodyPaddingRight + scrollbarWidth}px`;
  }

  return releaseDocumentScrollLock;
}

function releaseDocumentScrollLock() {
  const lock = documentScrollLock;
  if (!lock) return;

  lock.count -= 1;
  if (lock.count > 0) return;
  documentScrollLock = null;

  lock.root.style.overflow = lock.previousRootOverflow;
  lock.body.style.overflow = lock.previousBodyOverflow;
  lock.body.style.position = lock.previousBodyPosition;
  lock.body.style.top = lock.previousBodyTop;
  lock.body.style.left = lock.previousBodyLeft;
  lock.body.style.width = lock.previousBodyWidth;
  lock.body.style.paddingRight = lock.previousBodyPaddingRight;
  window.scrollTo(lock.scrollX, lock.scrollY);
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
  const onCloseRef = useRef(onClose);
  const returnFocusRef = useRef<HTMLElement | null>(
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );
  onCloseRef.current = onClose;

  useEffect(() => {
    const releaseScrollLock = acquireDocumentScrollLock();
    const handleDocumentKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onCloseRef.current();
    };

    document.addEventListener('keydown', handleDocumentKeyDown);
    closeButtonRef.current?.focus();

    return () => {
      document.removeEventListener('keydown', handleDocumentKeyDown);
      releaseScrollLock();
      if (returnFocusRef.current?.isConnected) returnFocusRef.current.focus();
    };
  }, []);

  function handleKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
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
