import crypto from 'node:crypto';

import redis, { isRedisReady } from '@/configs/db/redis';
import env from '@/configs/env';
import logger from '@/configs/logger/winston';

export interface IdempotencyResponseState {
  status: number;
  body: unknown;
}

export interface IdempotencyState {
  key: string;
  fingerprint: string;
  status: 'pending' | 'completed';
  response?: IdempotencyResponseState;
  requestId?: string;
  createdAt: string;
}

export const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';
const IDEMPOTENCY_KEY_PREFIX = 'idempotency';
const DEFAULT_IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;

function getIdempotencyTtlSeconds(): number {
  const raw = env.IDEMPOTENCY_TTL_SECONDS;
  const parsed = Number(raw);
  if (!raw || Number.isNaN(parsed) || parsed <= 0) {
    return DEFAULT_IDEMPOTENCY_TTL_SECONDS;
  }
  return parsed;
}

export function createFingerprint(payload: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export function buildIdempotencyRedisKey(scope: string, key: string): string {
  return `${IDEMPOTENCY_KEY_PREFIX}:${scope}:${key}`;
}

export async function getIdempotencyState(
  redisKey: string,
): Promise<IdempotencyState | null> {
  if (!isRedisReady()) {
    return null;
  }
  try {
    const raw = await redis.get(redisKey);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as IdempotencyState;
  }
  catch (error) {
    logger.error('Failed to read idempotency state', {
      redisKey,
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export async function startIdempotentRequest(
  redisKey: string,
  fingerprint: string,
  requestId?: string,
): Promise<{ started: true } | { started: false; existing: IdempotencyState | null }> {
  if (!isRedisReady()) {
    return { started: true };
  }

  const nextState: IdempotencyState = {
    key: redisKey,
    fingerprint,
    status: 'pending',
    requestId,
    createdAt: new Date().toISOString(),
  };

  try {
    const result = await redis.set(
      redisKey,
      JSON.stringify(nextState),
      'EX',
      getIdempotencyTtlSeconds(),
      'NX',
    );

    if (result === 'OK') {
      return { started: true };
    }

    const existing = await getIdempotencyState(redisKey);
    return { started: false, existing };
  }
  catch (error) {
    logger.error('Failed to reserve idempotency key', {
      redisKey,
      message: error instanceof Error ? error.message : String(error),
    });
    return { started: true };
  }
}

export async function completeIdempotentRequest(
  redisKey: string,
  fingerprint: string,
  response: IdempotencyResponseState,
  requestId?: string,
): Promise<void> {
  if (!isRedisReady()) {
    return;
  }

  const state: IdempotencyState = {
    key: redisKey,
    fingerprint,
    status: 'completed',
    response,
    requestId,
    createdAt: new Date().toISOString(),
  };

  try {
    await redis.set(
      redisKey,
      JSON.stringify(state),
      'EX',
      getIdempotencyTtlSeconds(),
    );
  }
  catch (error) {
    logger.error('Failed to store idempotency result', {
      redisKey,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
