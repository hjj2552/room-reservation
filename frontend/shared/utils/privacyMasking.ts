export function maskName(value?: string | null) {
  if (!value) return value;
  if (value.includes('*')) return value;

  const chars = Array.from(value);
  if (chars.length === 1) return '*';
  if (chars.length === 2) return `${chars[0]}*`;
  return `${chars[0]}*${chars[chars.length - 1]}`;
}

export function maskEmail(value?: string | null) {
  if (!value) return value;
  if (value.includes('*')) return value;

  const atIndex = value.indexOf('@');
  if (atIndex <= 0) return maskName(value);

  const localPart = value.slice(0, atIndex);
  const domain = value.slice(atIndex);
  if (localPart.length === 1) return `*${domain}`;
  return `${localPart.slice(0, 2)}${'*'.repeat(Math.max(1, localPart.length - 2))}${domain}`;
}

export function maskPhone(value?: string | null) {
  if (!value) return value;
  if (value.includes('*')) return value;

  const digits = value.replace(/\D/g, '');
  if (digits.length <= 1) return '*';
  if (digits.length <= 5) {
    return `${digits[0]}${'*'.repeat(Math.max(1, digits.length - 2))}${digits.at(-1)}`;
  }
  return `${digits.slice(0, 4)}${'*'.repeat(digits.length - 5)}${digits.at(-1)}`;
}
