export type CommandCategory = 'Tools' | 'Appearance' | 'Quick actions';

export interface CommandItem {
  id: string;
  label: string;
  subtitle: string;
  category: CommandCategory;
  keywords: readonly string[];
  badge?: string;
}

const CATEGORY_ORDER: readonly CommandCategory[] = ['Tools', 'Quick actions', 'Appearance'];

export function isCommandPaletteShortcut(event: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}): boolean {
  return (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'k';
}

export function filterCommands<T extends CommandItem>(items: ReadonlyArray<T>, rawQuery: string): T[] {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return [...items];
  const tokens = query.split(/\s+/).filter(Boolean);

  const scored: Array<{ item: T; score: number; index: number }> = [];

  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    const label = item.label.toLowerCase();
    const subtitle = item.subtitle.toLowerCase();
    const category = item.category.toLowerCase();
    const keywords = item.keywords.map(word => word.toLowerCase());
    const haystack = `${label} ${subtitle} ${category} ${keywords.join(' ')}`;

    if (!tokens.every(token => haystack.includes(token))) continue;

    let score = 0;
    if (label === query) score += 120;
    else if (label.startsWith(query)) score += 75;
    else if (label.includes(query)) score += 45;

    for (const token of tokens) {
      if (label.startsWith(token)) score += 25;
      else if (label.includes(token)) score += 15;
      if (keywords.some(keyword => keyword === token)) score += 35;
      else if (keywords.some(keyword => keyword.startsWith(token))) score += 22;
      else if (keywords.some(keyword => keyword.includes(token))) score += 12;
      if (subtitle.includes(token)) score += 8;
      if (category.includes(token)) score += 5;
    }

    scored.push({ item, score, index });
  }

  scored.sort((a, b) => (b.score - a.score) || (a.index - b.index));
  return scored.map(entry => entry.item);
}

export function groupCommands<T extends CommandItem>(items: ReadonlyArray<T>): Array<{ category: CommandCategory; items: T[] }> {
  const grouped = new Map<CommandCategory, T[]>();
  for (const item of items) {
    const bucket = grouped.get(item.category);
    if (bucket) {
      bucket.push(item);
    } else {
      grouped.set(item.category, [item]);
    }
  }
  return CATEGORY_ORDER
    .filter(category => grouped.has(category))
    .map(category => ({ category, items: grouped.get(category)! }));
}
