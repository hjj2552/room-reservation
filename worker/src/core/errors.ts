export type ApplicationErrorKind =
  | "VALIDATION"
  | "NOT_FOUND"
  | "CONFLICT"
  | "POLICY_VIOLATION"
  | "CREDENTIAL_MISMATCH";

export class AppError extends Error {
  constructor(
    readonly kind: ApplicationErrorKind,
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown> = {},
    readonly fieldErrors: Array<{ field: string; message: string }> = [],
  ) {
    super(message);
  }
}

export function validation(message: string, field?: string): never {
  throw new AppError(
    "VALIDATION",
    "VALIDATION_ERROR",
    message,
    {},
    field ? [{ field, message }] : [],
  );
}

export function notFound(resource: string): never {
  throw new AppError("NOT_FOUND", "NOT_FOUND", `${resource} not found.`);
}

export function conflict(code: string, message: string, details: Record<string, unknown> = {}): never {
  throw new AppError("CONFLICT", code, message, details);
}

export function policy(code: string, message: string): never {
  throw new AppError(
    code === "VALIDATION_ERROR" ? "VALIDATION" : "POLICY_VIOLATION",
    code,
    message,
  );
}

export function credentialMismatch(code: string, message: string): never {
  throw new AppError("CREDENTIAL_MISMATCH", code, message);
}
