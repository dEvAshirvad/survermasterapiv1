import type { Express, NextFunction, Request, Response } from 'express';

import { apiReference } from '@scalar/express-api-reference';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import hpp from 'hpp';
import swaggerUi from 'swagger-ui-express';

import { getMongoStatus } from '@/configs/db/mongodb';
import { checkRedisReadiness, getRedisStatus } from '@/configs/db/redis';
import env from '@/configs/env';
import { CORE_ERRORS } from '@/configs/errors/CORE_ERRORS';
import { getMetricsSnapshot } from '@/configs/metrics';
import origins from '@/configs/origins';
import swaggerSpec from '@/configs/swagger';
import Respond from '@/lib/respond';
import auditTrail from '@/middlewares/audit-trail';
import { errorHandler } from '@/middlewares/error-handler';
import idempotencyMiddleware from '@/middlewares/idempotency';
import metricsMiddleware from '@/middlewares/metrics';
import mongoSanitizeExpress5 from '@/middlewares/mongo-sanitize-express5';
import { requestLogger } from '@/middlewares/requestLogger';
import serveEmojiFavicon from '@/middlewares/serveEmojiFavicon';
import router from '@/modules';

import APIError from './errors/APIError';

export function createRouter(): Express {
  return express();
}

function hasInternalAccess(req: express.Request): boolean {
  const internalToken = env.INTERNAL_API_TOKEN?.trim();
  if (!internalToken)
    return true;
  const providedToken = req.header('x-internal-token')?.trim();
  return Boolean(providedToken && providedToken === internalToken);
}

export default function createApp(): Express {
  const app = createRouter();

  // Prefer a numeric hop count over `true`. Trusting all proxies (`true`) trips
  // express-rate-limit (ERR_ERL_PERMISSIVE_TRUST_PROXY) and weakens IP limits.
  app.set(
    'trust proxy',
    env.TRUST_PROXY_HOPS > 0 ? env.TRUST_PROXY_HOPS : false,
  );

  const mutationLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    skip: req =>
      ['GET', 'HEAD', 'OPTIONS'].includes(req.method.toUpperCase()),
  });

  app.use(
    cors({
      credentials: true,
      origin(origin, callback) {
        if (!origin || origins.includes(origin)) {
          callback(null, true);
        }
        else {
          callback(
            new APIError({
              ...CORE_ERRORS.CORS_FORBIDDEN,
            }),
          );
        }
      },
    }),
  );

  app.use(requestLogger);

  app.use(helmet());
  app.use(hpp());
  app.use(mongoSanitizeExpress5());

  app.use(cookieParser());

  // Request ID and correlation
  app.use((req, res, next) => {
    const requestId
      = (req.headers['x-request-id'] as string) || crypto.randomUUID();
    req.id = requestId;
    res.setHeader('x-request-id', requestId);
    next();
  });

  // Payload compression
  app.use(compression({ threshold: 1024 }));
  // Sane body limits; expand only when justified per-route
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  app.use(metricsMiddleware);

  app.use(serveEmojiFavicon('🔥'));

  app.get('/', (req, res) => {
    Respond(
      res,
      {
        requestId: req.id,
        message: 'DMFT Survey API services are running.',
      },
      200,
    );
  });

  // Liveness probe
  app.get('/health', (_req, res) => {
    Respond(res, { status: 'ok', uptime: process.uptime() }, 200);
  });

  // Readiness probe
  app.get('/ready', async (req, res) => {
    if (!hasInternalAccess(req)) {
      return Respond(
        res,
        { status: 'forbidden', message: 'Internal token required.' },
        403,
      );
    }
    const mongo = getMongoStatus();
    const redis = getRedisStatus();
    const redisReadiness = await checkRedisReadiness();
    const isReady
      = mongo.mongooseConnected
        && mongo.nativeConnected
        && redis.isReady
        && redisReadiness.isReady;

    Respond(
      res,
      {
        status: isReady ? 'ready' : 'not_ready',
        dependencies: {
          mongo,
          redis: {
            ...redis,
            ping: redisReadiness,
          },
        },
      },
      isReady ? 200 : 503,
    );
  });

  app.get('/docs/openapi.json', (req, res) => {
    if (!hasInternalAccess(req)) {
      return Respond(
        res,
        { status: 'forbidden', message: 'Internal token required.' },
        403,
      );
    }
    res.setHeader('Cache-Control', 'no-store');
    return res.json(swaggerSpec);
  });

  app.use(
    '/docs/swagger',
    (req: Request, res: Response, next: NextFunction) => {
      if (!hasInternalAccess(req)) {
        return Respond(
          res,
          { status: 'forbidden', message: 'Internal token required.' },
          403,
        );
      }
      return next();
    },
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, { explorer: true }),
  );

  app.use(
    '/docs/scalar',
    (_req: Request, res: Response, next: NextFunction) => {
      res.setHeader('Cache-Control', 'no-store');
      return next();
    },
    (req: Request, res: Response, next: NextFunction) => {
      if (!hasInternalAccess(req)) {
        return Respond(
          res,
          { status: 'forbidden', message: 'Internal token required.' },
          403,
        );
      }
      return next();
    },
    apiReference({
      url: '/docs/openapi.json',
      theme: 'purple',
      pageTitle: 'DMFT Survey API Reference',
    }),
  );

  app.get('/metrics', (req, res) => {
    if (!hasInternalAccess(req)) {
      return Respond(
        res,
        { status: 'forbidden', message: 'Internal token required.' },
        403,
      );
    }
    return Respond(res, getMetricsSnapshot(), 200);
  });

  app.use(
    '/api/v1',
    mutationLimiter,
    auditTrail,
    idempotencyMiddleware,
    router,
  );

  app.use((req, _res, next) => {
    next(
      new APIError({
        ...CORE_ERRORS.NOT_FOUND,
        META: {
          path: req.originalUrl,
          method: req.method,
        },
      }),
    );
  });

  app.use(errorHandler);
  return app;
}
