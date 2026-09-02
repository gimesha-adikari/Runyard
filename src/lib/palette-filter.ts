export interface PaletteItemBase {
  id: string;
  category: string;
  title: string;
  subtitle?: string;
  badge?: string;
}

export function filterPaletteItems<T extends PaletteItemBase>(items: T[], query: string): T[] {
  if (!query.trim()) return items;
  const q = query.toLowerCase();
  return items.filter(
    (item) =>
      item.title.toLowerCase().includes(q) ||
      (item.subtitle && item.subtitle.toLowerCase().includes(q)) ||
      (item.badge && item.badge.toLowerCase().includes(q)) ||
      item.category.toLowerCase().includes(q)
  );
}
