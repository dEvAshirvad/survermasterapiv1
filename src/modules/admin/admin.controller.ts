import type { NextFunction, Request, Response } from 'express';

import type { AdminFiltersInput } from '@/modules/admin/admin.schema';

import APIError from '@/configs/errors/APIError';
import { CORE_ERRORS } from '@/configs/errors/CORE_ERRORS';
import { parsePagination } from '@/lib/paginator';
import { paramStr } from '@/lib/param';
import Respond, { RespondWithPagination } from '@/lib/respond';
import { adminService } from '@/modules/admin/admin.service';

function pickFilters(req: Request): AdminFiltersInput {
  const query = req.query as AdminFiltersInput;
  return {
    district: query.district,
    block: query.block,
    gramPanchayat: query.gramPanchayat,
    formCode: query.formCode,
    from: query.from,
    to: query.to,
  };
}

export async function getAdminDashboard(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const data = await adminService.getDashboard(pickFilters(req));
    return Respond(res, data, 200);
  }
  catch (error) {
    return next(error);
  }
}

export async function listAdminSessions(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { page, limit } = parsePagination(req);
    const result = await adminService.listSessions(pickFilters(req), page, limit);
    return RespondWithPagination(res, result, 200);
  }
  catch (error) {
    return next(error);
  }
}

export async function getAdminSessionDetail(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const sessionId = paramStr(req.params.id);
    const detail = await adminService.getSessionDrillDown(sessionId);

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
