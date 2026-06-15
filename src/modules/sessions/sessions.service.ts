import type {
  CreateSessionInput,
  SessionSearchFilters,
  UpdateSessionInput,
} from '@/modules/sessions/sessions.schema';

import APIError from '@/configs/errors/APIError';
import { sessionEntriesRepository } from '@/modules/session-entries/session-entries.repository';
import {
  toSessionDetail,
  toSessionListItem,
} from '@/modules/sessions/sessions.mapper';
import { sessionsRepository } from '@/modules/sessions/sessions.repository';
import { HttpErrorStatusCode } from '@/types/errors/errors.types';

export class SessionsService {
  private isDuplicateKeyError(error: unknown) {
    return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 11000);
  }

  private duplicateContextError(input: CreateSessionInput | UpdateSessionInput) {
    return new APIError({
      STATUS: HttpErrorStatusCode.CONFLICT,
      CODE: 'SESSION_CONTEXT_CONFLICT',
      TITLE: 'SESSION_CONTEXT_CONFLICT',
      MESSAGE: 'A session with the same district, block, and gram panchayat already exists.',
      META: {
        district: input.context.district,
        block: input.context.block,
        gramPanchayat: input.context.gramPanchayat,
      },
    });
  }

  async create(input: CreateSessionInput) {
    const duplicateExisting = await sessionsRepository.findByDistrictBlockGramPanchayat(
      input.context.district,
      input.context.block,
      input.context.gramPanchayat,
    );
    if (duplicateExisting) {
      throw this.duplicateContextError(input);
    }

    let session;
    try {
      session = await sessionsRepository.create(input);
    }
    catch (error) {
      if (this.isDuplicateKeyError(error)) {
        throw this.duplicateContextError(input);
      }
      throw error;
    }

    return {
      id: String(session._id),
    };
  }

  async list(page: number, limit: number) {
    const result = await sessionsRepository.list(page, limit);
    return {
      ...result,
      data: result.data.map(toSessionListItem),
    };
  }

  async getDetail(sessionId: string) {
    const session = await sessionsRepository.findById(sessionId);
    if (!session) {
      return null;
    }
    return toSessionDetail(session);
  }

  async update(sessionId: string, input: UpdateSessionInput) {
    const duplicateExisting = await sessionsRepository.findByDistrictBlockGramPanchayat(
      input.context.district,
      input.context.block,
      input.context.gramPanchayat,
      sessionId,
    );
    if (duplicateExisting) {
      throw this.duplicateContextError(input);
    }

    let session;
    try {
      session = await sessionsRepository.updateById(sessionId, input);
    }
    catch (error) {
      if (this.isDuplicateKeyError(error)) {
        throw this.duplicateContextError(input);
      }
      throw error;
    }

    if (!session) {
      return null;
    }
    return toSessionDetail(session);
  }

  async getFormsSummary(sessionId: string) {
    const session = await sessionsRepository.findById(sessionId);
    if (!session) {
      return null;
    }

    const forms = await sessionEntriesRepository.getFormStatsBySession(sessionId);
    return {
      sessionId: String(session._id),
      forms,
    };
  }

  async listDistrictOptions() {
    return sessionsRepository.listDistinctDistricts();
  }

  async listBlockOptions(district: string) {
    return sessionsRepository.listDistinctBlocks(district);
  }

  async listGramPanchayatOptions(district: string, block: string) {
    return sessionsRepository.listDistinctGramPanchayats(district, block);
  }

  async search(filters: SessionSearchFilters) {
    const sessions = await sessionsRepository.searchByContext(filters);
    return sessions.map(toSessionListItem);
  }
}

export const sessionsService = new SessionsService();
