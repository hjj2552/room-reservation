export class AppError extends Error {
  constructor(
    readonly status: number,
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
    400,
    "VALIDATION_ERROR",
    message,
    {},
    field ? [{ field, message }] : [],
  );
}

export function notFound(resource: string): never {
  throw new AppError(404, "NOT_FOUND", `${resource} not found.`);
}

export function conflict(code: string, message: string, details: Record<string, unknown> = {}): never {
  throw new AppError(409, code, message, details);
}

export function policy(code: string, message: string): never {
  throw new AppError(code === "VALIDATION_ERROR" ? 400 : 422, code, message);
}
