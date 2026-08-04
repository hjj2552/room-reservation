const silentReturnFocusAttribute = 'data-overlay-return-focus';

export function restoreOverlayTriggerFocus(
  target: HTMLElement | null,
  wasFocusVisible: boolean,
) {
  if (!target?.isConnected) return;

  if (!wasFocusVisible) {
    target.setAttribute(silentReturnFocusAttribute, 'silent');
  }
  target.focus({ preventScroll: true });

  if (wasFocusVisible) return;

  const clearSilentReturnFocus = () => {
    target.removeAttribute(silentReturnFocusAttribute);
    target.removeEventListener('blur', clearSilentReturnFocus);
    target.removeEventListener('keydown', clearSilentReturnFocus);
    target.removeEventListener('pointerdown', clearSilentReturnFocus);
  };
  target.addEventListener('blur', clearSilentReturnFocus);
  target.addEventListener('keydown', clearSilentReturnFocus);
  target.addEventListener('pointerdown', clearSilentReturnFocus);
}
