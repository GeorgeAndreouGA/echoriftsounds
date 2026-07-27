'use client';

import type { Category } from '@echorift/shared';

export const ALL_CATEGORIES = '__all__';

interface Props {
  categories: Category[];
  active: string;
  onChange: (category: string) => void;
  /** Track count per category id, plus ALL_CATEGORIES — rendered next to each label. */
  counts: Record<string, number>;
}

export function CategoryTabs({ categories, active, onChange, counts }: Props) {
  // Nothing to switch between until the admin creates a category.
  if (categories.length === 0) return null;

  const tabs = [
    { id: ALL_CATEGORIES, name: 'ALL' },
    ...categories.map((c) => ({ id: c.id, name: c.name.toUpperCase() })),
  ];

  return (
    <div className="crt-tabs" role="tablist" aria-label="Track categories">
      {tabs.map((tab) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            role="tab"
            type="button"
            aria-selected={selected}
            className={`crt-tab${selected ? ' active' : ''}`}
            onClick={() => onChange(tab.id)}
          >
            {selected ? `[ ${tab.name} ]` : tab.name}
            <span className="crt-tab-count">{counts[tab.id] ?? 0}</span>
          </button>
        );
      })}
    </div>
  );
}
