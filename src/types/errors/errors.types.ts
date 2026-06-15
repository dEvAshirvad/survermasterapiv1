import type { ZodError, ZodIssue } from 'zod';

export type ErrorType
  = | ZodError
    | Record<string, unknown>[]
    | ZodIssue[]
    | Record<string, unknown>;

export interface IAPIError {
  STATUS: HttpErrorStatusCode;
  CODE?: string;
  TITLE: string;
  MESSAGE?: string;
  ERRORS?: ErrorType;
  META?: Record<string, unknown>;
}

export interface IErrorData {
  [key: string]: IAPIError;
}

export interface IHttpErrorResponse {
  code: string;
  title: string;
  message?: string;
  success: boolean;
  status: number;
  meta?: Record<string, unknown>;
  errors: ErrorType;
  timestamp: string;
  requestId?: string;
}

export enum HttpErrorStatusCode {
  BAD_REQUEST = 400,
  EXPIRED = 410,
  INVALID_IDENTIFIER_FORMAT = 422,
  FILE_TOO_LARGE = 413,
  FORBIDDEN = 403,
  CONFLICT = 409,
  UNAUTHORIZED = 401,
  NOT_FOUND = 404,
  INTERNAL_SERVER = 500,
  TOO_MANY_REQUEST = 429,
}
