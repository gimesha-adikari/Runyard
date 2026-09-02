import test from 'node:test';
import assert from 'node:assert/strict';

interface PaletteTestItem {
  id: string;
  category: string;
  title: string;
  subtitle?: string;
}

function filterPaletteItems(items: PaletteTestItem[], query: string): PaletteTestItem[] {
  if (!query.trim()) return items;
  const q = query.toLowerCase();
  return items.filter(
    (item) =>
      item.title.toLowerCase().includes(q) ||
      (item.subtitle && item.subtitle.toLowerCase().includes(q)) ||
      item.category.toLowerCase().includes(q)
  );
}

test('filterPaletteItems matches title, subtitle, and category', () => {
  const items: PaletteTestItem[] = [
    { id: '1', category: 'Navigation', title: 'Go to Overview', subtitle: 'Command center' },
    { id: '2', category: 'Actions', title: 'Rescan Projects', subtitle: 'Search directories' },
    { id: '3', category: 'Projects', title: 'runyard-desktop', subtitle: '/home/user/runyard' },
    { id: '4', category: 'Projects', title: 'api-backend', subtitle: '/home/user/backend' },
  ];

  assert.equal(filterPaletteItems(items, '').length, 4);
  
  const navMatches = filterPaletteItems(items, 'nav');
  assert.equal(navMatches.length, 1);
  assert.equal(navMatches[0]?.id, '1');

  const scanMatches = filterPaletteItems(items, 'rescan');
  assert.equal(scanMatches.length, 1);
  assert.equal(scanMatches[0]?.id, '2');

  const projMatches = filterPaletteItems(items, 'runyard');
  assert.equal(projMatches.length, 1);
  assert.equal(projMatches[0]?.id, '3');
});
