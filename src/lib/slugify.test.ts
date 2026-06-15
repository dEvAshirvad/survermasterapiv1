import { describe, expect, it } from 'vitest';

import { slugify } from './slugify';

describe('slugify', () => {
  it('normalizes diacritics and lowercases output', () => {
    expect(slugify('Café Déjà Vu')).toBe('cafe-deja-vu');
  });

  it('supports custom separators with regex chars', () => {
    expect(slugify('A/B/C', { separator: '.' })).toBe('a.b.c');
  });
});
