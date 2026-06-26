export function hexToTint(hex: string, alpha = 0.12) {
  const normalized = hex.trim();
  const match = /^#?([0-9a-fA-F]{6})$/.exec(normalized);
  if (!match) {
    return undefined;
  }

  const value = match[1];
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}
