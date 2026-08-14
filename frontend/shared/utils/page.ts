export function parsePageParam(value: string | null) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

export function lastPageIndex(totalPages: number) {
  return Math.max(totalPages - 1, 0);
}
