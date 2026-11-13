import React, { useEffect, useMemo, useState } from 'react';
import { HubPackEntry, SoundpackInfo } from '../types';
import {
  Check,
  CloudDownload,
  Download,
  Globe,
  Link,
  Package,
  Play,
  Search,
  Trash2,
} from 'lucide-react';

interface SoundpackGridProps {
  soundpacks: SoundpackInfo[];
  activeKeyboardPack: string;
  hubCatalog: HubPackEntry[];
  onLoadHubCatalog: () => Promise<void>;
  onInstallHubPack: (url: string) => Promise<void>;
  onSelectKeyboard: (id: string) => void;
  onPreview: (id: string) => void;
  onDeleteCustom: (id: string) => void;
  onExportZip: (id: string) => void;
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
  hubCatalog,
  onLoadHubCatalog,
  onInstallHubPack,
  onSelectKeyboard,
  onPreview,
  onDeleteCustom,
  onExportZip,
}) => {
  const [viewMode, setViewMode] = useState<'local' | 'hub'>('local');
  const [category, setCategory] = useState<CategoryId>('all');
  const [search, setSearch] = useState('');
  const [customUrl, setCustomUrl] = useState('');
  const [installingId, setInstallingId] = useState<string | null>(null);

  useEffect(() => {
    if (viewMode === 'hub' && hubCatalog.length === 0) {
      onLoadHubCatalog().catch(() => {});
    }
  }, [viewMode, hubCatalog.length, onLoadHubCatalog]);

  const installedIds = useMemo(
    () => new Set(soundpacks.map((p) => p.id)),
    [soundpacks]
  );

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

  const handleInstall = async (id: string, url: string) => {
    setInstallingId(id);
    try {
      await onInstallHubPack(url);
    } finally {
      setInstallingId(null);
    }
  };

  return (
    <div className="flex h-full flex-col rounded-2xl border border-white/10 bg-[#0b0b0e] p-4 shadow-xl">
      {/* Top Toolbar: Local vs Pack Hub + Search */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-[#050506] p-1">
          <button
            type="button"
            onClick={() => setViewMode('local')}
            className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition ${
              viewMode === 'local'
                ? 'bg-white text-black'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Package className="h-3.5 w-3.5" />
            Kütüphane
          </button>
          <button
            type="button"
            onClick={() => setViewMode('hub')}
            className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition ${
              viewMode === 'hub'
                ? 'bg-white text-black'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Globe className="h-3.5 w-3.5" />
            Pack Hub
          </button>
        </div>

        {viewMode === 'local' && (
          <div className="flex flex-wrap items-center gap-1">
            {CATEGORIES.map((c) => {
              const active = category === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategory(c.id)}
                  className={`cursor-pointer rounded-md border px-2 py-1 text-[11px] font-medium transition ${
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
        )}

        <div className="flex w-full items-center gap-2 rounded-lg border border-white/10 bg-[#050506] px-2.5 py-1.5 sm:w-52">
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

      {viewMode === 'local' ? (
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

                  <div className="flex items-center gap-1">
                    {!pack.is_builtin && (
                      <>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onExportZip(pack.id);
                          }}
                          title="ZIP olarak dışa aktar"
                          className="cursor-pointer rounded p-1 text-zinc-400 transition hover:bg-white/10 hover:text-white"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </button>
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
                      </>
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
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
          {/* Custom URL Zip Installer */}
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-[#060608] p-2.5">
            <Link className="h-4 w-4 shrink-0 text-zinc-400" />
            <input
              type="text"
              value={customUrl}
              onChange={(e) => setCustomUrl(e.target.value)}
              placeholder="Doğrudan .zip ses paketi URL'si yapıştırın (https://.../pack.zip)"
              className="min-w-48 flex-1 bg-transparent text-xs text-white placeholder-zinc-600 outline-none"
            />
            <button
              type="button"
              disabled={!customUrl.trim() || installingId === 'custom-url'}
              onClick={() => handleInstall('custom-url', customUrl.trim())}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-black transition hover:bg-zinc-200 disabled:opacity-40"
            >
              <CloudDownload className="h-3.5 w-3.5" />
              {installingId === 'custom-url' ? 'İndiriliyor...' : 'URL’den Kur'}
            </button>
          </div>

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {hubCatalog
              .filter(
                (p) =>
                  !search.trim() ||
                  p.name.toLowerCase().includes(search.toLowerCase()) ||
                  p.tag.toLowerCase().includes(search.toLowerCase())
              )
              .map((entry) => {
                const isInstalled = installedIds.has(entry.id);
                const busy = installingId === entry.id;
                return (
                  <div
                    key={entry.id}
                    className="flex flex-col justify-between rounded-xl border border-white/10 bg-[#111115] p-3.5"
                  >
                    <div>
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-white">
                          {entry.name}
                        </span>
                        <span className="rounded border border-white/15 bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-medium text-zinc-300 uppercase">
                          {entry.tag}
                        </span>
                      </div>
                      <p className="text-[11px] leading-relaxed text-zinc-400">
                        {entry.description}
                      </p>
                    </div>

                    <div className="mt-3 flex items-center justify-between border-t border-white/[0.06] pt-2.5">
                      <span className="font-mono text-[10px] text-zinc-500">
                        {entry.size_kb} KB • {entry.author}
                      </span>

                      {isInstalled ? (
                        <button
                          type="button"
                          onClick={() => {
                            onSelectKeyboard(entry.id);
                            setViewMode('local');
                          }}
                          className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-white bg-white px-2.5 py-1 text-[11px] font-semibold text-black"
                        >
                          <Check className="h-3 w-3" />
                          Kurulu • Seç
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleInstall(entry.id, entry.download_url)}
                          className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-white/25 bg-white/[0.06] px-2.5 py-1 text-[11px] font-medium text-white transition hover:border-white hover:bg-white hover:text-black disabled:opacity-50"
                        >
                          <CloudDownload className="h-3.5 w-3.5" />
                          {busy ? 'Kuruluyor...' : 'İndir & Kur'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
};
