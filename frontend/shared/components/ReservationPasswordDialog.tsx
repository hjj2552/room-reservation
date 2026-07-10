import type { FormEvent } from 'react';
import { useEffect, useId, useRef } from 'react';

interface ReservationPasswordDialogProps {
  open: boolean;
  password: string;
  isPending: boolean;
  errorMessage?: string;
  inputTestId: string;
  submitTestId: string;
  onPasswordChange: (password: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}

export function ReservationPasswordDialog({
  open,
  password,
  isPending,
  errorMessage,
  inputTestId,
  submitTestId,
  onPasswordChange,
  onClose,
  onSubmit,
}: ReservationPasswordDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const errorId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  if (!open) return null;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit();
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        className="modal-panel reservation-password-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && !isPending) onClose();
        }}
      >
        <div className="modal-header">
          <h2 id={titleId}>예약 비밀번호 확인</h2>
        </div>
        <p id={descriptionId} className="muted">
          예약할 때 설정한 비밀번호를 입력해 주세요.
        </p>
        <form className="form-stack" onSubmit={handleSubmit}>
          <label>
            예약 비밀번호
            <input
              ref={inputRef}
              type="password"
              autoComplete="current-password"
              minLength={4}
              placeholder="4자리 이상"
              value={password}
              onChange={(event) => onPasswordChange(event.target.value)}
              aria-invalid={Boolean(errorMessage)}
              aria-describedby={errorMessage ? errorId : descriptionId}
              data-testid={inputTestId}
              required
            />
          </label>
          {errorMessage ? <div id={errorId} className="inline-error" role="alert">{errorMessage}</div> : null}
          <div className="modal-actions">
            <button type="button" className="ghost-button" onClick={onClose} disabled={isPending}>
              돌아가기
            </button>
            <button
              type="submit"
              className="primary-button"
              disabled={isPending || password.length < 4}
              data-testid={submitTestId}
            >
              {isPending ? '확인 중...' : '예약 비밀번호 확인'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
