export interface OrganizablePage {
  id: string;
  originalIndex: number;
  rotation: number;
}

export function reorderPageItems<T extends { id: string }>(
  pages: T[],
  sourceId: string,
  targetId: string,
): T[] {
  const from = pages.findIndex(page => page.id === sourceId);
  const to = pages.findIndex(page => page.id === targetId);
  if (from < 0 || to < 0 || from === to) return pages;
  const next = [...pages];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

export function removePageById<T extends { id: string }>(
  pages: T[],
  id: string,
): { nextPages: T[]; removed: T; removedIndex: number } | null {
  if (pages.length <= 1) return null;
  const index = pages.findIndex(page => page.id === id);
  if (index < 0) return null;
  const nextPages = [...pages];
  const [removed] = nextPages.splice(index, 1);
  return { nextPages, removed, removedIndex: index };
}

export function restorePageAtIndex<T extends { id: string }>(
  pages: T[],
  removed: T,
  index: number,
): T[] {
  if (pages.some(page => page.id === removed.id)) return pages;
  const clamped = Math.max(0, Math.min(index, pages.length));
  const next = [...pages];
  next.splice(clamped, 0, removed);
  return next;
}
