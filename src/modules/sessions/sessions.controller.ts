import type { NextFunction, Request, Response } from 'express';

import type {
  CreateSessionInput,
  UpdateSessionInput,
} from '@/modules/sessions/sessions.schema';

import APIError from '@/configs/errors/APIError';
import { CORE_ERRORS } from '@/configs/errors/CORE_ERRORS';
import { parsePagination } from '@/lib/paginator';
import { paramStr } from '@/lib/param';
import Respond, { RespondWithPagination } from '@/lib/respond';
import { sessionsService } from '@/modules/sessions/sessions.service';

export async function createSession(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const body = req.body as CreateSessionInput;
    const result = await sessionsService.create(body);
    return Respond(res, result, 201);
  }
  catch (error) {
    return next(error);
  }
}

export async function listSessions(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { page, limit } = parsePagination(req);
    const result = await sessionsService.list(page, limit);
    return RespondWithPagination(res, result, 200);
  }
  catch (error) {
    return next(error);
  }
}

export async function getSessionDetail(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const sessionId = paramStr(req.params.id);
    const detail = await sessionsService.getDetail(sessionId);

    if (!detail) {
      return next(
        new APIError({
          ...CORE_ERRORS.NOT_FOUND,
          META: { resource: 'session', id: sessionId },
        }),
      );
    }

    return Respond(res, detail, 200);
  }
  catch (error) {
    return next(error);
  }
}

export async function updateSession(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const sessionId = paramStr(req.params.id);
    const body = req.body as UpdateSessionInput;
    const updated = await sessionsService.update(sessionId, body);

    if (!updated) {
      return next(
        new APIError({
          ...CORE_ERRORS.NOT_FOUND,
          META: { resource: 'session', id: sessionId },
        }),
      );
    }

    return Respond(res, updated, 200);
  }
  catch (error) {
    return next(error);
  }
}

export async function deleteSession(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const sessionId = paramStr(req.params.id);
    const deleted = await sessionsService.deleteCascade(sessionId);

    if (!deleted) {
      return next(
        new APIError({
          ...CORE_ERRORS.NOT_FOUND,
          META: { resource: 'session', id: sessionId },
        }),
      );
    }

    return Respond(res, deleted, 200);
  }
  catch (error) {
    return next(error);
  }
}

export async function getSessionFormsSummary(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const sessionId = paramStr(req.params.id);
    const summary = await sessionsService.getFormsSummary(sessionId);

    if (!summary) {
      return next(
        new APIError({
          ...CORE_ERRORS.NOT_FOUND,
          META: { resource: 'session', id: sessionId },
        }),
      );
    }

    return Respond(res, summary, 200);
  }
  catch (error) {
    return next(error);
  }
}

export async function listSessionDistrictOptions(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const options = await sessionsService.listDistrictOptions();
    return Respond(res, options, 200);
  }
  catch (error) {
    return next(error);
  }
}

export async function listSessionBlockOptions(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const district = String(req.query.district ?? '');
    const options = await sessionsService.listBlockOptions(district);
    return Respond(res, options, 200);
  }
  catch (error) {
    return next(error);
  }
}

export async function listSessionGramPanchayatOptions(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const district = String(req.query.district ?? '');
    const block = String(req.query.block ?? '');
    const options = await sessionsService.listGramPanchayatOptions(district, block);
    return Respond(res, options, 200);
  }
  catch (error) {
    return next(error);
  }
}

export async function searchSessions(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const result = await sessionsService.search({
      district: typeof req.query.district === 'string' ? req.query.district : undefined,
      block: typeof req.query.block === 'string' ? req.query.block : undefined,
      gramPanchayat:
        typeof req.query.gramPanchayat === 'string'
          ? req.query.gramPanchayat
          : undefined,
    });
    return Respond(res, result, 200);
  }
  catch (error) {
    return next(error);
  }
}
