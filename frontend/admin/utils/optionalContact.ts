export function optionalContact(value: string): string | null {
  const normalized = value.trim();
  return normalized || null;
}
