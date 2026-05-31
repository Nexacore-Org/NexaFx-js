import { Transform } from 'class-transformer';

const sanitizeText = (value: unknown): string => {
  if (value === null || value === undefined) {
    return '';
  }
  const text = String(value);
  return text
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .trim();
};

export function Sanitize() {
  return Transform(({ value }) => {
    if (typeof value !== 'string') {
      return value;
    }
    return sanitizeText(value);
  }, { toClassOnly: true });
}
