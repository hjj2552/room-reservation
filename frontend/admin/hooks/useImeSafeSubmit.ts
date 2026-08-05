import { useRef, type FormEvent, type KeyboardEvent } from 'react';

export function useImeSafeSubmit(onSubmit: () => void) {
  const isComposingRef = useRef(false);
  const suppressNextSubmitRef = useRef(false);

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    const nativeEvent = event.nativeEvent;
    if (
      event.key === 'Enter'
      && (isComposingRef.current || nativeEvent.isComposing || nativeEvent.keyCode === 229)
    ) {
      suppressNextSubmitRef.current = true;
      queueMicrotask(() => {
        suppressNextSubmitRef.current = false;
      });
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isComposingRef.current || suppressNextSubmitRef.current) {
      suppressNextSubmitRef.current = false;
      return;
    }
    onSubmit();
  }

  return {
    handleSubmit,
    searchInputProps: {
      onCompositionStart: () => {
        isComposingRef.current = true;
      },
      onCompositionEnd: () => {
        isComposingRef.current = false;
      },
      onKeyDown: handleSearchKeyDown,
    },
  };
}
