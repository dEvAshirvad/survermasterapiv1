import { Types } from 'mongoose';

import type {
  PatchSessionEntryInput,
  SessionEntryDocument,
  SessionEntryLean,
} from '@/modules/session-entries/session-entries.schema';
import type { SessionDocument } from '@/modules/sessions/sessions.schema';

import {
  calculateSkip,
  createPaginationResult,
  createSortObject,
} from '@/lib/paginator';
import { SessionEntryModel } from '@/modules/session-entries/session-entries.schema';

export interface SessionEntriesListOptions {
  formCode?: string;
  page: number;
  limit: number;
}

export interface SessionFormStats {
  formCode: string;
  total: number;
  draft: number;
  submitted: number;
}

export class SessionEntriesRepository {
  async createDraft(
    sessionId: string,
    formCode: string,
    contextSnapshot: SessionDocument['context'],
  ): Promise<SessionEntryDocument> {
    const doc = await SessionEntryModel.create({
      sessionId,
      formCode,
      contextSnapshot,
    });
    return doc.toObject() as SessionEntryDocument;
  }

  async findLatestBySessionAndForm(
    sessionId: string,
    formCode: string,
  ): Promise<SessionEntryLean | null> {
    return SessionEntryModel.findOne({
      sessionId,
      formCode,
      deletedAt: null,
    })
      .sort({ updatedAt: -1, createdAt: -1 })
      .lean<SessionEntryLean>()
      .exec();
  }

  async listBySession(
    sessionId: string,
    options: SessionEntriesListOptions,
  ) {
    const { formCode, page, limit } = options;
    const skip = calculateSkip(page, limit);
    const sort = createSortObject(undefined, 'desc');

    const filter: Record<string, unknown> = {
      sessionId,
      deletedAt: null,
    };
    if (formCode) {
      filter.formCode = formCode;
    }

    const [docs, total] = await Promise.all([
      SessionEntryModel.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean<SessionEntryLean[]>()
        .exec(),
      SessionEntryModel.countDocuments(filter).exec(),
    ]);

    return createPaginationResult(docs, total, page, limit);
  }

  async findById(sessionId: string, entryId: string): Promise<SessionEntryLean | null> {
    return SessionEntryModel.findOne({
      _id: entryId,
      sessionId,
      deletedAt: null,
    })
      .lean<SessionEntryLean>()
      .exec();
  }

  async patchDraft(
    sessionId: string,
    entryId: string,
    body: PatchSessionEntryInput,
  ): Promise<SessionEntryLean | null> {
    const updates: Record<string, unknown> = {
      version: body.expectedVersion + 1,
    };
    if (body.answers !== undefined) {
      updates.answers = body.answers;
    }
    if (body.progress !== undefined) {
      updates.progress = body.progress;
    }
    if (body.contextSnapshot !== undefined) {
      for (const [field, value] of Object.entries(body.contextSnapshot)) {
        updates[`contextSnapshot.${field}`] = value;
      }
    }

    return SessionEntryModel.findOneAndUpdate(
      {
        _id: entryId,
        sessionId,
        deletedAt: null,
        version: body.expectedVersion,
      },
      { $set: updates },
      { returnDocument: 'after' },
    )
      .lean<SessionEntryLean>()
      .exec();
  }

  async submit(
    sessionId: string,
    entryId: string,
    expectedVersion: number,
  ): Promise<SessionEntryLean | null> {
    return SessionEntryModel.findOneAndUpdate(
      {
        _id: entryId,
        sessionId,
        deletedAt: null,
        status: 'draft',
        version: expectedVersion,
      },
      {
        $set: {
          status: 'submitted',
          submittedAt: new Date(),
          version: expectedVersion + 1,
        },
      },
      { returnDocument: 'after' },
    )
      .lean<SessionEntryLean>()
      .exec();
  }

  async softDelete(sessionId: string, entryId: string): Promise<SessionEntryLean | null> {
    return SessionEntryModel.findOneAndUpdate(
      {
        _id: entryId,
        sessionId,
        deletedAt: null,
      },
      {
        $set: {
          deletedAt: new Date(),
        },
      },
      { returnDocument: 'after' },
    )
      .lean<SessionEntryLean>()
      .exec();
  }

  async getFormStatsBySession(sessionId: string): Promise<SessionFormStats[]> {
    const [stats] = await SessionEntryModel.aggregate<{
      forms: SessionFormStats[];
    }>([
      {
        $match: {
          sessionId: new Types.ObjectId(sessionId),
          deletedAt: null,
        },
      },
      {
        $group: {
          _id: '$formCode',
          total: { $sum: 1 },
          draft: {
            $sum: {
              $cond: [{ $eq: ['$status', 'draft'] }, 1, 0],
            },
          },
          submitted: {
            $sum: {
              $cond: [{ $eq: ['$status', 'submitted'] }, 1, 0],
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          formCode: '$_id',
          total: 1,
          draft: 1,
          submitted: 1,
        },
      },
      { $sort: { formCode: 1 } },
      {
        $group: {
          _id: null,
          forms: {
            $push: {
              formCode: '$formCode',
              total: '$total',
              draft: '$draft',
              submitted: '$submitted',
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          forms: 1,
        },
      },
    ]);

    return stats?.forms ?? [];
  }
}

export const sessionEntriesRepository = new SessionEntriesRepository();
