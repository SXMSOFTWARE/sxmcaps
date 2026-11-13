import React, { useState } from 'react';
import { AudioInspectResult, StudioKeyMapping, StudioPackSpec } from '../types';
import {
  AudioWaveform,
  FileAudio,
  Play,
  Plus,
  Save,
  Scissors,
  Trash2,
} from 'lucide-react';

interface StudioSectionProps {
  onPickAudio: () => Promise<AudioInspectResult | null>;
  onPreviewSlice: (
    path: string,
    startMs: number,
    durationMs: number
  ) => Promise<void>;
  onSavePack: (spec: StudioPackSpec) => Promise<void>;
}

interface DraftRow {
  id: string;
  webCode: string;
  downAudio: AudioInspectResult | null;
  downStartMs: number;
  downDurationMs: number;
  upAudio: AudioInspectResult | null;
  upStartMs: number;
  upDurationMs: number;
}

const KEY_TARGETS = [
  { code: 'Default', label: 'Varsayılan (Tüm Tuşlar)' },
  { code: 'Space', label: 'Spacebar' },
  { code: 'Enter', label: 'Enter' },
  { code: 'Backspace', label: 'Backspace' },
  { code: 'ShiftLeft', label: 'Shift (Sol)' },
  { code: 'ShiftRight', label: 'Shift (Sağ)' },
  { code: 'Escape', label: 'Escape' },
  { code: 'Tab', label: 'Tab' },
  { code: 'KeyA', label: 'KeyA' },
];

export const StudioSection: React.FC<StudioSectionProps> = ({
  onPickAudio,
  onPreviewSlice,
  onSavePack,
}) => {
  const [name, setName] = useState('');
  const [tag, setTag] = useState('Custom');
  const [author, setAuthor] = useState('sxmcaps Studio');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<DraftRow[]>([
    {
      id: 'default-row',
      webCode: 'Default',
      downAudio: null,
      downStartMs: 0,
      downDurationMs: 120,
      upAudio: null,
      upStartMs: 0,
      upDurationMs: 90,
    },
  ]);

  const updateRow = (id: string, patch: Partial<DraftRow>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const handlePickForRow = async (id: string, kind: 'down' | 'up') => {
    const info = await onPickAudio();
    if (!info) return;
    if (kind === 'down') {
      updateRow(id, {
        downAudio: info,
        downStartMs: 0,
        downDurationMs: Math.min(info.duration_ms, 180),
      });
    } else {
      updateRow(id, {
        upAudio: info,
        upStartMs: 0,
        upDurationMs: Math.min(info.duration_ms, 140),
      });
    }
  };

  const addMappingRow = () => {
    const used = new Set(rows.map((r) => r.webCode));
    const next = KEY_TARGETS.find((k) => !used.has(k.code))?.code ?? 'KeyE';
    setRows((prev) => [
      ...prev,
      {
        id: `row-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        webCode: next,
        downAudio: null,
        downStartMs: 0,
        downDurationMs: 120,
        upAudio: null,
        upStartMs: 0,
        upDurationMs: 90,
      },
    ]);
  };

  const handleSave = async () => {
    const validRows = rows.filter((r) => r.downAudio !== null);
    if (!name.trim() || validRows.length === 0) return;
    setSaving(true);
    try {
      const mappings: StudioKeyMapping[] = validRows.map((r) => ({
        web_code: r.webCode,
        down_path: r.downAudio!.path,
        down_start_ms: r.downStartMs,
        down_duration_ms: r.downDurationMs,
        up_path: r.upAudio ? r.upAudio.path : null,
        up_start_ms: r.upStartMs,
        up_duration_ms: r.upDurationMs,
      }));
      await onSavePack({
        name: name.trim(),
        tag,
        author,
        description: description.trim() || `${name.trim()} özel stüdyo paketi`,
        mappings,
      });
      setName('');
      setDescription('');
    } finally {
      setSaving(false);
    }
  };

  const canSave =
    name.trim().length > 0 && rows.some((r) => r.downAudio !== null) && !saving;

  return (
    <div className="grid h-full grid-cols-1 gap-3.5 overflow-y-auto lg:grid-cols-12">
      {/* Left: Pack Metadata */}
      <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-[#0b0b0e] p-4 lg:col-span-4">
        <div className="flex items-center gap-2 border-b border-white/[0.07] pb-2.5 text-xs font-semibold tracking-wider text-zinc-300 uppercase">
          <Scissors className="h-3.5 w-3.5 text-white" />
          Ses Paketi Stüdyosu
        </div>

        <p className="text-[11px] leading-relaxed text-zinc-400">
          Kendi <code className="rounded bg-white/10 px-1 text-zinc-200">.wav/.ogg/.mp3</code>{' '}
          ses dosyalarınızı seçin, dalga formu üzerinden kırpın ve Mechvibes V2 uyumlu paket olarak kaydedin.
        </p>

        <div className="space-y-2.5">
          <div>
            <label className="mb-1 block text-[11px] text-zinc-400">
              Paket Adı *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Örn. Custom Alps Cream"
              className="w-full rounded-lg border border-white/15 bg-[#050506] px-3 py-2 text-xs text-white placeholder-zinc-600 outline-none focus:border-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-[11px] text-zinc-400">
                Kategori
              </label>
              <select
                value={tag}
                onChange={(e) => setTag(e.target.value)}
                className="w-full cursor-pointer rounded-lg border border-white/15 bg-[#050506] px-2.5 py-2 text-xs text-white outline-none focus:border-white"
              >
                <option value="Linear">Linear</option>
                <option value="Tactile">Tactile</option>
                <option value="Clicky">Clicky</option>
                <option value="Thocky">Thocky</option>
                <option value="Custom">Custom</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-zinc-400">
                Üretici / Yazar
              </label>
              <input
                type="text"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                className="w-full rounded-lg border border-white/15 bg-[#050506] px-2.5 py-2 text-xs text-white outline-none focus:border-white"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[11px] text-zinc-400">
              Açıklama
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Switch karakterini kısaca açıklayın..."
              className="w-full resize-none rounded-lg border border-white/15 bg-[#050506] px-3 py-2 text-xs text-white placeholder-zinc-600 outline-none focus:border-white"
            />
          </div>
        </div>

        <button
          type="button"
          disabled={!canSave}
          onClick={handleSave}
          className="mt-auto inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-bold text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Save className="h-4 w-4" />
          {saving ? 'Kaydediliyor...' : 'Paketi Oluştur & Aktifleştir'}
        </button>
      </div>

      {/* Right: Key Mappings & Waveform Trimmer */}
      <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-[#0b0b0e] p-4 lg:col-span-8">
        <div className="flex items-center justify-between border-b border-white/[0.07] pb-2.5">
          <div className="flex items-center gap-2 text-xs font-semibold tracking-wider text-zinc-300 uppercase">
            <AudioWaveform className="h-3.5 w-3.5 text-white" />
            Tuş Eşleştirmeleri & Dalga Formu Kırpıcı
          </div>

          <button
            type="button"
            onClick={addMappingRow}
            className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-white/20 bg-white/[0.06] px-2.5 py-1 text-xs font-medium text-white hover:bg-white hover:text-black"
          >
            <Plus className="h-3.5 w-3.5" />
            Tuş Ekle
          </button>
        </div>

        <div className="flex-1 space-y-2.5 overflow-y-auto pr-1">
          {rows.map((row) => (
            <div
              key={row.id}
              className="space-y-2.5 rounded-xl border border-white/10 bg-[#060608] p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <select
                  value={row.webCode}
                  onChange={(e) =>
                    updateRow(row.id, { webCode: e.target.value })
                  }
                  className="cursor-pointer rounded-lg border border-white/15 bg-[#121216] px-2.5 py-1.5 text-xs font-semibold text-white outline-none"
                >
                  {KEY_TARGETS.map((k) => (
                    <option key={k.code} value={k.code}>
                      {k.label}
                    </option>
                  ))}
                </select>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handlePickForRow(row.id, 'down')}
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/20 bg-white/[0.06] px-2.5 py-1 text-[11px] font-medium text-white hover:bg-white hover:text-black"
                  >
                    <FileAudio className="h-3.5 w-3.5" />
                    {row.downAudio ? row.downAudio.file_name : 'Basış Sesi Seç *'}
                  </button>

                  <button
                    type="button"
                    onClick={() => handlePickForRow(row.id, 'up')}
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/10 bg-[#121216] px-2.5 py-1 text-[11px] text-zinc-300 hover:border-white/30 hover:text-white"
                  >
                    <FileAudio className="h-3.5 w-3.5" />
                    {row.upAudio ? `Up: ${row.upAudio.file_name}` : 'Key-Up (Opsiyonel)'}
                  </button>

                  {rows.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        setRows((prev) => prev.filter((r) => r.id !== row.id))
                      }
                      className="cursor-pointer rounded p-1 text-zinc-500 hover:bg-white/10 hover:text-white"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {row.downAudio && (
                <div className="space-y-2 border-t border-white/[0.06] pt-2">
                  {/* Waveform Preview Bar */}
                  <div className="relative flex h-10 items-end gap-[2px] overflow-hidden rounded-lg border border-white/10 bg-black px-2 py-1">
                    {row.downAudio.waveform.map((amp, idx) => {
                      const pct = (idx / row.downAudio!.waveform.length) * 100;
                      const startPct =
                        (row.downStartMs / row.downAudio!.duration_ms) * 100;
                      const endPct =
                        ((row.downStartMs + row.downDurationMs) /
                          row.downAudio!.duration_ms) *
                        100;
                      const inside = pct >= startPct && pct <= endPct;
                      return (
                        <div
                          key={idx}
                          style={{ height: `${Math.max(10, amp * 100)}%` }}
                          className={`flex-1 rounded-t-xs transition-colors ${
                            inside ? 'bg-white' : 'bg-zinc-800'
                          }`}
                        />
                      );
                    })}
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-[11px]">
                    <div className="flex flex-1 items-center gap-2">
                      <span className="shrink-0 text-zinc-400">
                        Başlangıç ({row.downStartMs}ms)
                      </span>
                      <input
                        type="range"
                        min={0}
                        max={Math.max(0, row.downAudio.duration_ms - 10)}
                        step={5}
                        value={row.downStartMs}
                        onChange={(e) =>
                          updateRow(row.id, {
                            downStartMs: parseInt(e.target.value, 10),
                          })
                        }
                        className="sxm-slider w-full"
                      />
                    </div>

                    <div className="flex flex-1 items-center gap-2">
                      <span className="shrink-0 text-zinc-400">
                        Süre ({row.downDurationMs}ms)
                      </span>
                      <input
                        type="range"
                        min={15}
                        max={Math.min(1200, row.downAudio.duration_ms)}
                        step={5}
                        value={row.downDurationMs}
                        onChange={(e) =>
                          updateRow(row.id, {
                            downDurationMs: parseInt(e.target.value, 10),
                          })
                        }
                        className="sxm-slider w-full"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        onPreviewSlice(
                          row.downAudio!.path,
                          row.downStartMs,
                          row.downDurationMs
                        )
                      }
                      className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-white/20 bg-white/[0.08] px-2.5 py-1 text-[11px] font-medium text-white hover:bg-white hover:text-black"
                    >
                      <Play className="h-3 w-3 fill-current" />
                      Dinle
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
