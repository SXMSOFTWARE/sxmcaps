import React, { useMemo, useState } from 'react';
import { SoundpackInfo } from '../types';
import { Check, Package, Play, Search, Trash2 } from 'lucide-react';

interface SoundpackGridProps {
  soundpacks: SoundpackInfo[];
  activeKeyboardPack: string;
  onSelectKeyboard: (id: string) => void;
  onPreview: (id: string) => void;
  onDeleteCustom: (id: string) => void;
}

const CATEGORIES = [
  { id: 'all', label: 'Tümü' },
  { id: 'tactile', label: 'Tactile' },
  { id: 'linear', label: 'Linear' },
  { id: 'clicky', label: 'Clicky' },
  { id: 'thocky', label: 'Thocky' },
  { id: 'other', label: 'Klasik / Özel' },
] as const;

type CategoryId = (typeof CATEGORIES)[number]['id'];

function matchesCategory(pack: SoundpackInfo, cat: CategoryId): boolean {
  if (cat === 'all') return true;
  const t = pack.tag.toLowerCase();
  if (cat === 'tactile') return t.includes('tactile');
  if (cat === 'linear') return t.includes('linear');
  if (cat === 'clicky') return t.includes('clicky') || t.includes('buckling');
  if (cat === 'thocky') return t.includes('thock') || t.includes('capacitive');
  if (cat === 'other') {
    return (
      !pack.is_builtin ||
      t.includes('capacitive') ||
      t.includes('buckling') ||
      t.includes('custom')
    );
  }
  return true;
}

export const SoundpackGrid: React.FC<SoundpackGridProps> = ({
  soundpacks,
  activeKeyboardPack,
  onSelectKeyboard,
  onPreview,
  onDeleteCustom,
}) => {
  const [category, setCategory] = useState<CategoryId>('all');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return soundpacks.filter((p) => {
      if (p.device_type === 'mouse') return false;
      if (!matchesCategory(p, category)) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.tag.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q)
      );
    });
  }, [soundpacks, category, search]);

  return (
    <div className="flex h-full flex-col rounded-2xl border border-white/10 bg-[#0b0b0e] p-4 shadow-xl">
      {/* Category Pills & Search */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {CATEGORIES.map((c) => {
            const active = category === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategory(c.id)}
                className={`cursor-pointer rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                  active
                    ? 'border-white bg-white text-black'
                    : 'border-white/10 bg-[#121216] text-zinc-400 hover:border-white/25 hover:text-white'
                }`}
              >
                {c.label}
              </button>
            );
          })}
        </div>

        <div className="flex w-full items-center gap-2 rounded-lg border border-white/10 bg-[#050506] px-2.5 py-1.5 sm:w-60">
          <Search className="h-3.5 w-3.5 text-zinc-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Switch ara..."
            className="w-full bg-transparent text-xs text-white placeholder-zinc-600 outline-none"
          />
        </div>
      </div>

      {/* Cards Grid */}
      <div className="grid flex-1 grid-cols-1 gap-2.5 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((pack) => {
          const isActive = pack.id === activeKeyboardPack;
          return (
            <div
              key={pack.id}
              onClick={() => onSelectKeyboard(pack.id)}
              className={`group flex cursor-pointer flex-col justify-between rounded-xl border p-3.5 transition ${
                isActive
                  ? 'border-white bg-white/[0.08] shadow-[0_0_24px_rgba(255,255,255,0.08)]'
                  : 'border-white/10 bg-[#111115] hover:border-white/30 hover:bg-[#16161b]'
              }`}
            >
              <div>
                <div className="mb-1.5 flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                        isActive
                          ? 'border-white bg-white text-black'
                          : 'border-white/25 bg-black/50'
                      }`}
                    >
                      {isActive && <Check className="h-3 w-3 stroke-[3]" />}
                    </span>
                    <span className="text-sm font-semibold text-white">
                      {pack.name}
                    </span>
                  </div>

                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${
                      isActive
                        ? 'bg-white text-black'
                        : 'border border-white/15 bg-white/[0.04] text-zinc-300'
                    }`}
                  >
                    {pack.tag}
                  </span>
                </div>

                <p className="line-clamp-2 text-[11px] leading-relaxed text-zinc-400">
                  {pack.description}
                </p>
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-white/[0.06] pt-2.5">
                <span className="flex items-center gap-1 text-[10px] text-zinc-500">
                  <Package className="h-3 w-3" />
                  {pack.is_builtin ? 'Dahili' : pack.format}
                </span>

                <div className="flex items-center gap-1.5">
                  {!pack.is_builtin && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteCustom(pack.id);
                      }}
                      title="Özel paketi sil"
                      className="cursor-pointer rounded p-1 text-zinc-500 transition hover:bg-white/10 hover:text-white"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onPreview(pack.id);
                    }}
                    className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-white/15 bg-white/[0.06] px-2.5 py-1 text-[11px] font-medium text-zinc-100 transition hover:border-white hover:bg-white hover:text-black"
                  >
                    <Play className="h-3 w-3 fill-current" />
                    Test
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="col-span-full flex items-center justify-center py-12 text-xs text-zinc-500">
            Bu kategoride veya aramada eşleşen switch paketi bulunamadı.
          </div>
        )}
      </div>
    </div>
  );
};
