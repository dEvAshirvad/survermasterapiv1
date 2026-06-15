import { describe, expect, it } from 'vitest';

import { calculateSkip, createPaginationResult, createSortObject } from './paginator';

describe('paginator utilities', () => {
  it('creates default sort when no sort field provided', () => {
    expect(createSortObject()).toEqual({ createdAt: -1 });
  });

  it('calculates skip value correctly', () => {
    expect(calculateSkip(3, 20)).toBe(40);
  });

  it('builds pagination metadata', () => {
    const result = createPaginationResult([{ id: 1 }], 45, 2, 10);
    expect(result.pagination.totalPages).toBe(5);
    expect(result.pagination.hasNext).toBe(true);
    expect(result.pagination.hasPrev).toBe(true);
  });
});
