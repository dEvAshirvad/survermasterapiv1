import type { SessionLean } from '@/modules/sessions/sessions.schema';

export interface SessionListItem {
  id: string;
  title: string;
  context: SessionLean['context'];
  createdAt: Date;
  updatedAt: Date;
}

export interface SessionDetail extends SessionListItem {
  forms: [];
  summary: {
    formCount: number;
    entryCount: number;
  };
}

export function toSessionListItem(session: SessionLean): SessionListItem {
  return {
    id: String(session._id),
    title: session.title,
    context: session.context,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
}

export function toSessionDetail(session: SessionLean): SessionDetail {
  return {
    ...toSessionListItem(session),
    forms: [],
    summary: {
      formCount: 0,
      entryCount: 0,
    },
  };
}
