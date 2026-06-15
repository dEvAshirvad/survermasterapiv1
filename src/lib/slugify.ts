export interface SlugifyOptions {
  separator?: string;
  lower?: boolean;
}

export function slugify(input: string, options: SlugifyOptions = {}): string {
  const separator = options.separator ?? '-';
  const lower = options.lower ?? true;
  const escapedSeparator = separator.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  let value = input.normalize('NFKD');

  // Remove diacritics
  value = value.replace(/[\u0300-\u036F]/g, '');

  // Replace non-alphanumeric characters with separator
  value = value.replace(/[^a-z0-9]+/gi, separator);

  // Trim separators from ends
  const pattern = new RegExp(`^${escapedSeparator}+|${escapedSeparator}+$`, 'g');
  value = value.replace(pattern, '');

  return lower ? value.toLowerCase() : value;
}
