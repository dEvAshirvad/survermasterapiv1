import type {
  CreateSessionEntryInput,
  PatchSessionEntryInput,
} from '@/modules/session-entries/session-entries.schema';

import APIError from '@/configs/errors/APIError';
import { CORE_ERRORS } from '@/configs/errors/CORE_ERRORS';
import { sessionEntriesRepository } from '@/modules/session-entries/session-entries.repository';
import { sessionsRepository } from '@/modules/sessions/sessions.repository';
import { HttpErrorStatusCode } from '@/types/errors/errors.types';

function mapConflict(message: string, meta: Record<string, unknown>) {
  return new APIError({
    STATUS: HttpErrorStatusCode.CONFLICT,
    CODE: 'VERSION_CONFLICT',
    TITLE: 'VERSION_CONFLICT',
    MESSAGE: message,
    META: meta,
  });
}

function mapNotFound(resource: string, meta: Record<string, unknown>) {
  return new APIError({
    ...CORE_ERRORS.NOT_FOUND,
    META: { resource, ...meta },
  });
}

export class SessionEntriesService {
  private async getSessionOrThrow(sessionId: string) {
    const session = await sessionsRepository.findById(sessionId);
    if (!session) {
      throw mapNotFound('session', { sessionId });
    }
    return session;
  }

  private isDuplicateKeyError(error: unknown) {
    if (!error || typeof error !== 'object')
      return false;
    return 'code' in error && error.code === 11000;
  }

  private async assertSessionExists(sessionId: string) {
    await this.getSessionOrThrow(sessionId);
  }

  async getOrCreateByForm(sessionId: string, formCode: string) {
    const session = await this.getSessionOrThrow(sessionId);
    const existing = await sessionEntriesRepository.findLatestBySessionAndForm(sessionId, formCode);
    if (existing) {
      return existing;
    }

    try {
      return await sessionEntriesRepository.createDraft(
        sessionId,
        formCode,
        session.context,
      );
    }
    catch (error) {
      if (!this.isDuplicateKeyError(error)) {
        throw error;
      }
      const raced = await sessionEntriesRepository.findLatestBySessionAndForm(sessionId, formCode);
      if (!raced) {
        throw error;
      }
      return raced;
    }
  }

  async createDraft(sessionId: string, input: CreateSessionEntryInput) {
    const session = await this.getSessionOrThrow(sessionId);
    const created = await sessionEntriesRepository.createDraft(
      sessionId,
      input.formCode,
      session.context,
    );
    return { id: String(created._id) };
  }

  async list(sessionId: string, formCode: string | undefined, page: number, limit: number) {
    await this.assertSessionExists(sessionId);
    return sessionEntriesRepository.listBySession(sessionId, {
      formCode,
      page,
      limit,
    });
  }

  async getById(sessionId: string, entryId: string) {
    await this.assertSessionExists(sessionId);
    const entry = await sessionEntriesRepository.findById(sessionId, entryId);
    if (!entry) {
      throw mapNotFound('session_entry', { sessionId, entryId });
    }
    return entry;
  }

  async patch(sessionId: string, entryId: string, body: PatchSessionEntryInput) {
    await this.assertSessionExists(sessionId);
    const updated = await sessionEntriesRepository.patchDraft(sessionId, entryId, body);
    if (!updated) {
      const existing = await sessionEntriesRepository.findById(sessionId, entryId);
      if (!existing) {
        throw mapNotFound('session_entry', { sessionId, entryId });
      }
      throw mapConflict('Entry was updated by another operation. Refresh and retry.', {
        sessionId,
        entryId,
        expectedVersion: body.expectedVersion,
        actualVersion: existing.version,
      });
    }
    return updated;
  }

  async softDelete(sessionId: string, entryId: string) {
    await this.assertSessionExists(sessionId);
    const deleted = await sessionEntriesRepository.softDelete(sessionId, entryId);
    if (!deleted) {
      throw mapNotFound('session_entry', { sessionId, entryId });
    }
    return deleted;
  }
}

export const sessionEntriesService = new SessionEntriesService();
