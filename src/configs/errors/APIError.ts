import { format } from 'date-fns';

import type {
  ErrorType,
  HttpErrorStatusCode,
  IAPIError,
  IHttpErrorResponse,
} from '@/types/errors/errors.types';

export default class APIError extends Error {
  statusCode: HttpErrorStatusCode;
  code: string;
  title: string;
  errors?: ErrorType;
  success: boolean;
  isOperational: boolean;
  meta?: Record<string, unknown>;

  constructor(option: IAPIError) {
    super(option?.MESSAGE);
    Object.setPrototypeOf(this, APIError.prototype);
    this.code = option.CODE || option.TITLE;
    this.title = option.TITLE;
    this.statusCode = option.STATUS;
    this.success = false;
    this.errors = option.ERRORS || [];
    this.meta = option.META || {};
    this.isOperational = true;
  }

  serializeError(requestId?: string) {
    return {
      code: this.code,
      title: this.title,
      message: this?.message,
      success: this.success,
      status: this.statusCode,
      errors: this.errors || [],
      meta: this.meta || {},
      timestamp: format(new Date(), 'PPP p'),
      requestId,
    } satisfies IHttpErrorResponse;
  }

  toString() {
    return (
      `APIError: ${
        this.statusCode
      } - ${
        this.title
      } - ${
        this.message
      }\n`
    );
  }
}
