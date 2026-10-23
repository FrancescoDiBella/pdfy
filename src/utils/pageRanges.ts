export function parsePageRange(value: string, pageCount: number): number[] {
  if (!value.trim()) return [];
  const pages = new Set<number>();
  for (const part of value.split(',')) {
    const match = /^\s*(\d+)\s*(?:-\s*(\d+)\s*)?$/.exec(part);
    if (!match) throw new Error('Use page numbers or ranges, such as 1-3, 5.');
    const start = Number(match[1]);
    const end = Number(match[2] ?? match[1]);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 1 || end < 1 || start > pageCount || end > pageCount) {
      throw new Error(`Choose pages between 1 and ${pageCount}.`);
    }
    for (let page = Math.min(start, end); page <= Math.max(start, end); page++) pages.add(page - 1);
  }
  return [...pages].sort((a, b) => a - b);
}
