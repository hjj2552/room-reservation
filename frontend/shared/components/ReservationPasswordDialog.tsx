import type { FormEvent } from 'react';
import { useId, useRef, useState } from 'react';
import { ModalDialog } from './ModalDialog';
import {
  acceptsPublicPasswordInput,
  publicPasswordBlockedMessage,
  publicPasswordHelp,
  publicPasswordPattern,
} from '../utils/publicPassword';

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
  const [inputError, setInputError] = useState<string>();

  if (!open) return null;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!publicPasswordPattern.test(password)) {
      setInputError(publicPasswordHelp);
      return;
    }
    onSubmit();
  }

  return (
    <ModalDialog
      title="예약 비밀번호 확인"
      titleId={titleId}
      ariaDescribedBy={descriptionId}
      className="reservation-password-modal"
      onClose={onClose}
      closeDisabled={isPending}
      initialFocusRef={inputRef}
    >
      <p id={descriptionId} className="muted">
        {publicPasswordHelp}
      </p>
      <form className="form-stack" onSubmit={handleSubmit}>
        <label>
          예약 비밀번호
          <input
            ref={inputRef}
            type="password"
            autoComplete="current-password"
            minLength={4}
            maxLength={64}
            pattern="[\x21-\x7E]{4,64}"
            placeholder="영문·숫자·특수문자 4~64자"
            value={password}
            onChange={(event) => {
              if (!acceptsPublicPasswordInput(event.target.value)) {
                setInputError(publicPasswordBlockedMessage);
                return;
              }
              setInputError(undefined);
              onPasswordChange(event.target.value);
            }}
            aria-invalid={Boolean(inputError || errorMessage)}
            aria-describedby={inputError || errorMessage ? errorId : descriptionId}
            data-testid={inputTestId}
            required
          />
        </label>
        {inputError || errorMessage ? <div id={errorId} className="inline-error" role="alert">{inputError || errorMessage}</div> : null}
        <div className="modal-actions">
          <button type="button" className="ghost-button" onClick={onClose} disabled={isPending}>
            돌아가기
          </button>
          <button
            type="submit"
            className="primary-button"
            disabled={isPending || !publicPasswordPattern.test(password)}
            data-testid={submitTestId}
          >
            {isPending ? '확인 중...' : '예약 비밀번호 확인'}
          </button>
        </div>
      </form>
    </ModalDialog>
  );
}
