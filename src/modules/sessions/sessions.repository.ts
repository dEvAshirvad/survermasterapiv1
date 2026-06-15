import type {
  CreateSessionInput,
  SessionDocument,
  SessionLean,
  SessionSearchFilters,
  UpdateSessionInput,
} from '@/modules/sessions/sessions.schema';

import {
  calculateSkip,
  createPaginationResult,
  createSortObject,
} from '@/lib/paginator';
import { SessionModel } from '@/modules/sessions/sessions.schema';

export class SessionsRepository {
  async create(input: CreateSessionInput): Promise<SessionDocument> {
    const doc = await SessionModel.create(input);
    return doc.toObject() as SessionDocument;
  }

  async findById(id: string): Promise<SessionLean | null> {
    return SessionModel.findById(id).lean<SessionLean>().exec();
  }

  async findByDistrictBlockGramPanchayat(
    district: string,
    block: string,
    gramPanchayat: string,
    excludeId?: string,
  ): Promise<SessionLean | null> {
    const query: Record<string, unknown> = {
      'context.district': district,
      'context.block': block,
      'context.gramPanchayat': gramPanchayat,
    };

    if (excludeId) {
      query._id = { $ne: excludeId };
    }

    return SessionModel.findOne(query).lean<SessionLean>().exec();
  }

  async updateById(id: string, input: UpdateSessionInput): Promise<SessionLean | null> {
    return SessionModel.findByIdAndUpdate(
      id,
      { $set: input },
      { returnDocument: 'after' },
    )
      .lean<SessionLean>()
      .exec();
  }

  async list(page: number, limit: number) {
    const skip = calculateSkip(page, limit);
    const sort = createSortObject(undefined, 'desc');

    const [docs, total] = await Promise.all([
      SessionModel.find()
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean<SessionLean[]>()
        .exec(),
      SessionModel.countDocuments().exec(),
    ]);

    return createPaginationResult(docs, total, page, limit);
  }

  async listDistinctDistricts(): Promise<string[]> {
    return SessionModel.distinct('context.district', {})
      .then(items =>
        items
          .filter(item => typeof item === 'string')
          .sort((a, b) => a.localeCompare(b)),
      );
  }

  async listDistinctBlocks(district: string): Promise<string[]> {
    return SessionModel.distinct('context.block', { 'context.district': district })
      .then(items =>
        items
          .filter(item => typeof item === 'string')
          .sort((a, b) => a.localeCompare(b)),
      );
  }

  async listDistinctGramPanchayats(district: string, block: string): Promise<string[]> {
    return SessionModel.distinct('context.gramPanchayat', {
      'context.district': district,
      'context.block': block,
    })
      .then(items =>
        items
          .filter(item => typeof item === 'string')
          .sort((a, b) => a.localeCompare(b)),
      );
  }

  async searchByContext(filters: SessionSearchFilters): Promise<SessionLean[]> {
    const query: Record<string, unknown> = {};
    if (filters.district)
      query['context.district'] = filters.district;
    if (filters.block)
      query['context.block'] = filters.block;
    if (filters.gramPanchayat)
      query['context.gramPanchayat'] = filters.gramPanchayat;

    return SessionModel.find(query)
      .sort({ updatedAt: -1, createdAt: -1 })
      .lean<SessionLean[]>()
      .exec();
  }
}

export const sessionsRepository = new SessionsRepository();
