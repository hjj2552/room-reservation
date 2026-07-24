import type { ClientIpProvider } from "../core/rate-limit";

export const TRUSTED_CLIENT_IP_HEADER = "X-Room-Reservation-Client-IP";

function isIpv4(value: string): boolean {
  const parts = value.split(".");
  return parts.length === 4 && parts.every((part) => {
    if (!/^(0|[1-9][0-9]{0,2})$/.test(part)) return false;
    const octet = Number(part);
    return octet >= 0 && octet <= 255;
  });
}

function isIpv6(value: string): boolean {
  if (!value.includes(":") || !/^[0-9A-Fa-f:.]+$/.test(value)) return false;
  try {
    const parsed = new URL(`http://[${value}]/`);
    return parsed.hostname.startsWith("[") && parsed.hostname.endsWith("]");
  } catch {
    return false;
  }
}

export class TrustedProxyClientIpProvider implements ClientIpProvider {
  getClientIp(request: Request): string | null {
    const value = request.headers.get(TRUSTED_CLIENT_IP_HEADER)?.trim();
    if (!value || (!isIpv4(value) && !isIpv6(value))) return null;
    return value;
  }
}
