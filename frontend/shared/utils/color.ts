export function hexToTint(hex: string, amount = 0.12) {
  const normalized = hex.trim();
  const match = /^#?([0-9a-fA-F]{6})$/.exec(normalized);
  if (!match) {
    return undefined;
  }

  const value = match[1];
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);
  const blend = (foreground: number, background: number) => (
    Math.round(foreground * amount + background * (1 - amount))
  );
  return `rgb(${blend(red, 248)}, ${blend(green, 251)}, ${blend(blue, 253)})`;
}
