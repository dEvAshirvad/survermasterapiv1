import type { IErrorData } from '@/types/errors/errors.types';

import { HttpErrorStatusCode } from '@/types/errors/errors.types';

export const AUTHORIZATION_ERRORS = {
  AUTHORIZATION_ERROR: {
    STATUS: HttpErrorStatusCode.UNAUTHORIZED,
    CODE: 'AUTHORIZATION_ERROR',
    TITLE: 'AUTHORIZATION_ERROR',
    MESSAGE: 'The user is not authorized to perform this action.',
  },
  SESSION_INVALIDATED: {
    STATUS: HttpErrorStatusCode.NOT_FOUND,
    CODE: 'SESSION_INVALIDATED',
    TITLE: 'SESSION_INVALIDATED',
    MESSAGE: 'The session was invalidated. Please login again.',
  },
  VALIDATION_ERROR: {
    STATUS: HttpErrorStatusCode.BAD_REQUEST,
    CODE: 'VALIDATION_ERROR',
    TITLE: 'VALIDATION_ERROR',
    MESSAGE: 'Invalid input data',
  },
} satisfies IErrorData;
