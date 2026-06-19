import type { NextFunction, Request, Response } from 'express';

import type {
  CreateSessionEntryInput,
  PatchSessionEntryInput,
} from '@/modules/session-entries/session-entries.schema';

import { parsePagination } from '@/lib/paginator';
import { paramStr } from '@/lib/param';
import Respond, { RespondWithPagination } from '@/lib/respond';
import { sessionEntriesService } from '@/modules/session-entries/session-entries.service';

export async function listSessionEntries(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const sessionId = paramStr(req.params.id);
    const formCode = typeof req.query.formCode === 'string'
      ? req.query.formCode
      : undefined;
    const { page, limit } = parsePagination(req);
    const result = await sessionEntriesService.list(sessionId, formCode, page, limit);
    return RespondWithPagination(res, result, 200);
  }
  catch (error) {
    return next(error);
  }
}

export async function createSessionEntry(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const sessionId = paramStr(req.params.id);
    const body = req.body as CreateSessionEntryInput;
    const created = await sessionEntriesService.createDraft(sessionId, body);
    return Respond(res, created, 201);
  }
  catch (error) {
    return next(error);
  }
}

export async function getOrCreateSessionFormEntry(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const sessionId = paramStr(req.params.id);
    const formCode = paramStr(req.params.formCode).toUpperCase();
    const entry = await sessionEntriesService.getOrCreateByForm(sessionId, formCode);
    return Respond(res, entry, 200);
  }
  catch (error) {
    return next(error);
  }
}

export async function getSessionEntry(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const sessionId = paramStr(req.params.id);
    const entryId = paramStr(req.params.entryId);
    const entry = await sessionEntriesService.getById(sessionId, entryId);
    return Respond(res, entry, 200);
  }
  catch (error) {
    return next(error);
  }
}

export async function patchSessionEntry(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const sessionId = paramStr(req.params.id);
    const entryId = paramStr(req.params.entryId);
    const body = req.body as PatchSessionEntryInput;
    const updated = await sessionEntriesService.patch(sessionId, entryId, body);
    return Respond(res, updated, 200);
  }
  catch (error) {
    return next(error);
  }
}

export async function deleteSessionEntry(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const sessionId = paramStr(req.params.id);
    const entryId = paramStr(req.params.entryId);
    const deleted = await sessionEntriesService.softDelete(sessionId, entryId);
    return Respond(res, deleted, 200);
  }
  catch (error) {
    return next(error);
  }
}
