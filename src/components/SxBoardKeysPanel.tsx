import React, { useMemo, useState } from 'react';
import {
  HardwareDeviceInfo,
  KeymapEntryDto,
  RemapTargetDto,
} from '../types';
import { useI18n } from '../i18n';
import { AulaF75BoardStage, F75VisualKey } from './AulaF75BoardStage';
import {
  ChevronDown,
  ChevronUp,
  Keyboard,
  RotateCcw,
  Search,
  ShieldAlert,
  X,
} from 'lucide-react';

interface SxBoardKeysPanelProps {
  device: HardwareDeviceInfo | null;
  keymapLayer0: KeymapEntryDto[];
  keymapLayer1: KeymapEntryDto[];
  activeLayer: 0 | 1;
  pressedKeys: Set<string>;
  targets: RemapTargetDto[];
  loading: boolean;
  onChangeLayer: (layer: 0 | 1) => void;
  onWriteEntry: (
    layer: 0 | 1,
    matrixIndex: number,
    code: [number, number, number, number]
  ) => Promise<void>;
  onRestoreLayer0: () => Promise<void>;
  onRefreshKeymap: (layer: 0 | 1) => Promise<void>;
}

export const SxBoardKeysPanel: React.FC<SxBoardKeysPanelProps> = ({
  device,
  keymapLayer0,
  keymapLayer1,
  activeLayer,
  pressedKeys,
  targets,
  loading,
  onChangeLayer,
  onWriteEntry,
  onRestoreLayer0,
  onRefreshKeymap,
}) => {
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const [reassignedOpen, setReassignedOpen] = useState(true);
  const [selectedIdx, setSelectedIdx] = useState<number>(0);
  const [targetFilter, setTargetFilter] = useState('');
  const [macroPickIdx, setMacroPickIdx] = useState(0);

  const entries = activeLayer === 0 ? keymapLayer0 : keymapLayer1;

  const reassigned = useMemo(() => entries.filter((e) => e.is_modified), [entries]);

  const filteredEntries = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((e) => {
      if (!q) return true;
      return (
        e.key_label.toLowerCase().includes(q) ||
        e.assigned_label.toLowerCase().includes(q) ||
        e.web_code.toLowerCase().includes(q)
      );
    });
  }, [entries, search]);

  const selectedEntry = useMemo(
    () => entries.find((e) => e.matrix_index === selectedIdx) ?? entries[0] ?? null,
    [entries, selectedIdx]
  );

  const filteredTargets = useMemo(() => {
    const q = targetFilter.trim().toLowerCase();
    if (!q) return targets;
    return targets.filter(
      (tg) => tg.label.toLowerCase().includes(q) || tg.category.toLowerCase().includes(q)
    );
  }, [targets, targetFilter]);

  const canWrite = Boolean(device?.capabilities.key_remapping && device.capabilities.writable);

  if (device && device.device_kind !== 'keyboard') {
    return (
      <div className="sxm-card flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <ShieldAlert className="h-8 w-8 text-amber-300" />
        <h3 className="text-sm font-bold text-white">{device.display_name}</h3>
        <p className="max-w-md text-xs text-zinc-400">{t.sxb.readOnlyNotice}</p>
      </div>
    );
  }

  const handleSelectVisualKey = (key: F75VisualKey) => {
    setSelectedIdx(key.matrixIndex);
  };

  const handleResetKey = async (matrixIndex: number) => {
    const entry = keymapLayer0.find((e) => e.matrix_index === matrixIndex);
    if (!entry) return;
    const match = targets.find(
      (tg) => tg.label.toLowerCase() === entry.key_label.toLowerCase()
    );
    if (match) {
      await onWriteEntry(0, matrixIndex, match.code);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 lg:flex-row">
      {/* Left Control Drawer */}
      <aside className="sxm-card flex w-full shrink-0 flex-col overflow-hidden lg:w-[300px]">
        <div className="grid grid-cols-2 border-b border-white/8 px-3 pt-3">
          <button
            type="button"
            onClick={() => onChangeLayer(0)}
            className={`cursor-pointer border-b-2 pb-2.5 text-[11px] font-bold tracking-[0.12em] uppercase transition ${
              activeLayer === 0
                ? 'border-white text-white'
                : 'border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {t.sxb.keysTabBase}
          </button>
          <button
            type="button"
            onClick={() => onChangeLayer(1)}
            className={`cursor-pointer border-b-2 pb-2.5 text-[11px] font-bold tracking-[0.12em] uppercase transition ${
              activeLayer === 1
                ? 'border-white text-white'
                : 'border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {t.sxb.keysTabFn}
          </button>
        </div>

        <div className="p-3">
          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-[#0b0b0d] px-3 py-2">
            <Search className="h-3.5 w-3.5 text-zinc-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t.sxb.searchKeys}
              className="w-full bg-transparent text-xs text-white placeholder-zinc-500 outline-none"
            />
          </div>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-3 pb-3">
          <div>
            <button
              type="button"
              onClick={() => setReassignedOpen((o) => !o)}
              className="mb-1.5 flex w-full cursor-pointer items-center justify-between text-[10px] font-bold tracking-[0.12em] text-zinc-400 uppercase hover:text-white"
            >
              <span>
                {t.sxb.reassigned} ({reassigned.length})
              </span>
              {reassignedOpen ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </button>

            {reassignedOpen && reassigned.length > 0 && (
              <div className="space-y-1.5">
                {reassigned.map((entry) => (
                  <div
                    key={entry.matrix_index}
                    onClick={() => setSelectedIdx(entry.matrix_index)}
                    className={`flex cursor-pointer items-center justify-between rounded-xl border px-2.5 py-2 transition ${
                      selectedIdx === entry.matrix_index
                        ? 'border-white bg-white text-black'
                        : 'border-white/15 bg-[#0b0b0d] text-white hover:border-white/35'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`flex h-6 min-w-[26px] items-center justify-center rounded border px-1.5 font-mono text-[10px] font-bold ${
                          selectedIdx === entry.matrix_index
                            ? 'border-black/25 bg-black text-white'
                            : 'border-white/20 bg-[#141418] text-white'
                        }`}
                      >
                        {entry.key_label}
                      </span>
                      <div className="leading-tight">
                        <div className="text-xs font-bold">{entry.assigned_label}</div>
                        <div className="text-[9px] tracking-wider opacity-60 uppercase">
                          #{entry.matrix_index}
                        </div>
                      </div>
                    </div>
                    {activeLayer === 0 && canWrite && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleResetKey(entry.matrix_index);
                        }}
                        className="rounded-full p-1 hover:bg-black/15"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between text-[10px] font-bold tracking-[0.12em] text-zinc-500 uppercase">
              <span>{t.sxb.others}</span>
              <button
                type="button"
                onClick={() => onRefreshKeymap(activeLayer)}
                className="cursor-pointer text-[10px] text-zinc-300 hover:text-white"
              >
                {t.sxb.syncRead}
              </button>
            </div>
            <div className="space-y-1.5">
              {filteredEntries.map((entry) => {
                const selected = entry.matrix_index === selectedIdx;
                return (
                  <button
                    key={entry.matrix_index}
                    type="button"
                    onClick={() => setSelectedIdx(entry.matrix_index)}
                    className={`flex w-full cursor-pointer items-center justify-between rounded-xl border px-2.5 py-2 text-left transition ${
                      selected
                        ? 'border-white bg-white text-black'
                        : 'border-white/[0.06] bg-[#0b0b0d] text-zinc-100 hover:border-white/25'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`flex h-6 min-w-[26px] items-center justify-center rounded border px-1.5 font-mono text-[10px] font-bold ${
                          selected
                            ? 'border-black/20 bg-black text-white'
                            : 'border-white/15 bg-[#141418] text-zinc-200'
                        }`}
                      >
                        {entry.key_label}
                      </span>
                      <span className="text-xs font-semibold">{entry.assigned_label}</span>
                    </div>
                    <span className="font-mono text-[10px] opacity-60">
                      #{entry.matrix_index}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </aside>

      {/* Right Interactive F75 Keyboard Canvas + Key Remap Inspector */}
      <div className="flex min-w-0 flex-1 flex-col gap-3 overflow-y-auto">
        <AulaF75BoardStage
          mode="remap"
          pressedKeys={pressedKeys}
          selectedMatrixIndex={selectedIdx}
          onSelectKey={handleSelectVisualKey}
          reassignedEntries={reassigned}
          onResetKey={activeLayer === 0 && canWrite ? handleResetKey : undefined}
          deviceTitle={device?.display_name ?? 'AULA F75'}
          badgeText={activeLayer === 0 ? t.sxb.keysTabBase : t.sxb.keysTabFn}
        />

        <div className="sxm-card p-4">
          {!canWrite ? (
            <div className="flex items-center gap-2.5 text-xs text-zinc-300">
              <ShieldAlert className="h-4 w-4 text-amber-300" />
              <span>{t.sxb.readOnlyNotice}</span>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <Keyboard className="h-4 w-4 text-white" />
                  <span className="text-xs font-bold text-white uppercase">
                    {t.sxb.selectedKey}:{' '}
                    <span className="rounded bg-white px-2 py-0.5 font-mono text-black">
                      {selectedEntry?.key_label ?? 'Esc'}
                    </span>
                  </span>
                  <span className="text-xs text-zinc-400">
                    {t.sxb.currentAction}:{' '}
                    <strong className="text-white">
                      {selectedEntry?.assigned_label ?? '—'}
                    </strong>
                  </span>
                </div>

                {activeLayer === 0 && (
                  <button
                    type="button"
                    disabled={loading}
                    onClick={onRestoreLayer0}
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-white/15 bg-[#0b0b0d] px-3 py-1.5 text-[11px] font-semibold text-zinc-200 hover:border-white/40 hover:text-white disabled:opacity-50"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    {t.sxb.restoreBaseLayer}
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={targetFilter}
                  onChange={(e) => setTargetFilter(e.target.value)}
                  placeholder={t.sxb.remapTarget}
                  className="min-w-[200px] flex-1 rounded-xl border border-white/10 bg-[#0b0b0d] px-3 py-1.5 text-xs text-white placeholder-zinc-500 outline-none focus:border-white/35"
                />

                <div className="flex items-center gap-1.5 rounded-full border border-white/15 bg-[#0b0b0d] px-3 py-1">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase">
                    Macro
                  </span>
                  <select
                    value={macroPickIdx}
                    onChange={(e) => setMacroPickIdx(Number(e.target.value))}
                    className="bg-transparent text-xs text-white outline-none"
                  >
                    {[0, 1, 2, 3, 4, 5].map((m) => (
                      <option key={m} value={m} className="bg-[#111114]">
                        #{m + 1}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() =>
                      onWriteEntry(activeLayer, selectedIdx, [3, 1, 1, macroPickIdx])
                    }
                    className="cursor-pointer rounded-full bg-white px-2.5 py-0.5 text-[10px] font-bold text-black hover:bg-zinc-200"
                  >
                    Bind
                  </button>
                </div>
              </div>

              <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto pt-1">
                {filteredTargets.map((tg) => (
                  <button
                    key={`${tg.label}-${tg.code.join('-')}`}
                    type="button"
                    disabled={loading}
                    onClick={() => onWriteEntry(activeLayer, selectedIdx, tg.code)}
                    className="cursor-pointer rounded-full border border-white/10 bg-[#0b0b0d] px-3 py-1 text-[11px] font-semibold text-zinc-200 transition hover:border-white hover:bg-white hover:text-black disabled:opacity-50"
                  >
                    {tg.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
