import type { NextFunction, Request, Response } from 'express';
import type { Buffer } from 'node:buffer';

import { paramStr } from '@/lib/param';
import { exportsService } from '@/modules/exports/exports.service';

function sendBinary(
  res: Response,
  payload: { fileName: string; contentType: string; data: Buffer },
) {
  res.setHeader('Content-Type', payload.contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${payload.fileName}"`);
  res.setHeader('Content-Length', String(payload.data.byteLength));
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).send(payload.data);
}

export async function downloadSessionArchive(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const sessionId = paramStr(req.params.sessionId);
    const payload = await exportsService.buildSessionArchive(sessionId);
    return sendBinary(res, payload);
  }
  catch (error) {
    return next(error);
  }
}

export async function downloadSessionFormPdf(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const sessionId = paramStr(req.params.sessionId);
    const formCode = paramStr(req.params.formCode).toUpperCase();
    const payload = await exportsService.buildFormExport(sessionId, formCode, 'pdf');
    return sendBinary(res, payload);
  }
  catch (error) {
    return next(error);
  }
}

export async function downloadSessionFormCsv(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const sessionId = paramStr(req.params.sessionId);
    const formCode = paramStr(req.params.formCode).toUpperCase();
    const payload = await exportsService.buildFormExport(sessionId, formCode, 'csv');
    return sendBinary(res, payload);
  }
  catch (error) {
    return next(error);
  }
}

export async function downloadSessionFormXlsx(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const sessionId = paramStr(req.params.sessionId);
    const formCode = paramStr(req.params.formCode).toUpperCase();
    const payload = await exportsService.buildFormExport(sessionId, formCode, 'xlsx');
    return sendBinary(res, payload);
  }
  catch (error) {
    return next(error);
  }
}
