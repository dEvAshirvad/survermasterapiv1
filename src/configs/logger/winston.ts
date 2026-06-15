import * as winston from 'winston';

import env from '@/configs/env';

const { combine, timestamp, json, colorize, printf, errors } = winston.format;

// Helper function to create level filter
function levelFilter(level: string) {
  return winston.format((info) => {
    return info.level === level ? info : false;
  })();
}

const customFormat = printf(({ level, message, timestamp }) => {
  return `${timestamp} ${level} ${message}`;
});

/** Must match `levels` below — default logform colorize only knows npm levels. */
const levelColors = {
  fatal: 'bold red',
  error: 'red',
  warn: 'yellow',
  info: 'green',
  request: 'cyan',
  debug: 'blue',
} as const;

// Console format for development (custom format with colors)
const consoleFormat = combine(
  timestamp({
    format: 'DD-MM-YYYY HH:mm:ss',
  }),
  errors({ stack: true }),
  colorize({ colors: levelColors }),
  customFormat,
);

// File format (JSON)
const fileFormat = combine(timestamp(), errors({ stack: true }), json());

// Higher numeric value = more verbose (Winston/npm style). `request` must be
// ≤ `debug` or HTTP access lines are dropped when LOG_LEVEL=debug (request was 5, debug 4).
const logger = winston.createLogger({
  level: env.LOG_LEVEL || 'debug',
  levels: {
    fatal: 0,
    error: 1,
    warn: 2,
    info: 3,
    request: 4,
    debug: 5,
  },
  transports: [
    new winston.transports.Console({
      format: consoleFormat,
    }),

    // Fatal logs
    new winston.transports.File({
      filename: 'logs/fatal.log',
      format: combine(levelFilter('fatal'), fileFormat),
    }),
    // Error logs
    new winston.transports.File({
      filename: 'logs/error.log',
      format: combine(levelFilter('error'), fileFormat),
    }),
    // Warn logs
    new winston.transports.File({
      filename: 'logs/warn.log',
      format: combine(levelFilter('warn'), fileFormat),
    }),
    // Info logs
    new winston.transports.File({
      filename: 'logs/info.log',
      format: combine(levelFilter('info'), fileFormat),
    }),
    // Debug logs
    new winston.transports.File({
      filename: 'logs/debug.log',
      format: combine(levelFilter('debug'), fileFormat),
    }),
    // Request logs (only in development)
    ...(env.NODE_ENV === 'development'
      ? [
          new winston.transports.File({
            filename: 'logs/request.log',
            format: combine(levelFilter('request'), fileFormat),
          }),
        ]
      : []),
  ],
  exceptionHandlers: [
    new winston.transports.File({
      filename: 'logs/exceptions.log',
      format: fileFormat,
    }),
  ],
  rejectionHandlers: [
    new winston.transports.File({
      filename: 'logs/rejections.log',
      format: fileFormat,
    }),
  ],
});

if (env.NODE_ENV === 'production') {
  logger.clear();
  logger.add(
    new winston.transports.Console({
      format: json(),
    }),
  );
}

export default logger;
