const NULL_RE = /\u0000/g;

export function sanitizeDbText(value, {
  path = 'value',
  operation = 'db-write',
  batchId = null,
  logger = console
} = {}) {
  if (typeof value !== 'string') return value;
  const matches = value.match(NULL_RE);
  if (!matches) return value;
  logger.warn(
    `[db-sanitize] ${operation}: removed ${matches.length} NULL byte(s) from ${path}${batchId ? ` (batch ${batchId})` : ''}`
  );
  return value.replace(NULL_RE, '');
}

export function sanitizeDbData(value, options = {}) {
  const path = options.path || 'data';
  if (typeof value === 'string') return sanitizeDbText(value, { ...options, path });
  if (Array.isArray(value)) {
    return value.map((entry, index) => sanitizeDbData(entry, { ...options, path: `${path}[${index}]` }));
  }
  if (value && typeof value === 'object' && !(value instanceof Date) && !Buffer.isBuffer(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, sanitizeDbData(entry, { ...options, path: `${path}.${key}` })])
    );
  }
  return value;
}
