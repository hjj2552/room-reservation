import type { ApplicationErrorKind } from "../core/errors";
import { AppError } from "../core/errors";

type ApplicationErrorStatus = 400 | 403 | 404 | 409 | 422;
type HttpErrorStatus = 400 | 401 | 403 | 413 | 429 | 503;

const applicationStatusByKind: Record<ApplicationErrorKind, ApplicationErrorStatus> = {
  VALIDATION: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
  POLICY_VIOLATION: 422,
  CREDENTIAL_MISMATCH: 403,
};

export interface ErrorBody {
  code: string;
  message: string;
  details: Record<string, unknown>;
  fieldErrors: Array<{ field: string; message: string }>;
}

export class HttpError extends Error {
  constructor(
    readonly status: HttpErrorStatus,
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown> = {},
    readonly fieldErrors: Array<{ field: string; message: string }> = [],
  ) {
    super(message);
  }
}

export function mapApplicationError(error: AppError): {
  status: ApplicationErrorStatus;
  body: ErrorBody;
} {
  return {
    status: applicationStatusByKind[error.kind],
    body: {
      code: error.code,
      message: error.message,
      details: error.details,
      fieldErrors: error.fieldErrors,
    },
  };
}

export function mapHttpError(error: HttpError): {
  status: HttpErrorStatus;
  body: ErrorBody;
} {
  return {
    status: error.status,
    body: {
      code: error.code,
      message: error.message,
      details: error.details,
      fieldErrors: error.fieldErrors,
    },
  };
}
