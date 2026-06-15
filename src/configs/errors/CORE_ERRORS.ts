import type { IErrorData } from '@/types/errors/errors.types';

import { HttpErrorStatusCode } from '@/types/errors/errors.types';

export const CORE_ERRORS = {
  NOT_FOUND: {
    STATUS: HttpErrorStatusCode.NOT_FOUND,
    CODE: 'NOT_FOUND',
    TITLE: 'NOT_FOUND',
    MESSAGE: 'The requested resource was not found.',
  },
  INTERNAL_SERVER_ERROR: {
    STATUS: HttpErrorStatusCode.INTERNAL_SERVER,
    CODE: 'INTERNAL_SERVER_ERROR',
    TITLE: 'INTERNAL_SERVER_ERROR',
    MESSAGE: 'Something went wrong. Please try again later.',
  },
  CORS_FORBIDDEN: {
    STATUS: HttpErrorStatusCode.FORBIDDEN,
    CODE: 'CORS_FORBIDDEN',
    TITLE: 'CORS_FORBIDDEN',
    MESSAGE: 'You are not allowed to access this resource.',
  },
} satisfies IErrorData;
