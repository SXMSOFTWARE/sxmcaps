import React, { useEffect, useRef, useState } from 'react';
import {
  HardwareDeviceInfo,
  MacroEventStep,
  SxBoardMacro,
} from '../types';
import { useI18n } from '../i18n';
import {
  Circle,
  Cpu,
  Plus,
  Search,
  Square,
  Trash2,
  Zap,
} from 'lucide-react';

interface SxBoardMacrosPanelProps {
  device: HardwareDeviceInfo | null;
  macros: SxBoardMacro[];
  onSaveMacros: (macros: SxBoardMacro[]) => Promise<void>;
  onFlashToDevice: (macros: SxBoardMacro[]) => Promise<void>;
  onPreviewStepSound: (webCode: string, isDown: boolean) => void;
}

export const SxBoardMacrosPanel: React.FC<SxBoardMacrosPanelProps> = ({
  device,
  macros,
  onSaveMacros,
  onFlashToDevice,
  onPreviewStepSound,
}) => {
  const { t } = useI18n();
  const [drawerTab, setDrawerTab] = useState<'macros' | 'commands'>('macros');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string>(macros[0]?.id ?? '');
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const lastEventTsRef = useRef<number>(Date.now());

  const activeMacro = macros.find((m) => m.id === selectedId) ?? macros[0] ?? null;

  useEffect(() => {
    if (!recording || !activeMacro) return;
    lastEventTsRef.current = Date.now();

    const pushStep = (e: KeyboardEvent, isDown: boolean) => {
      if (e.repeat) return;
      e.preventDefault();
      e.stopPropagation();
      const now = Date.now();
      const delta = Math.min(2500, Math.max(5, now - lastEventTsRef.current));
      lastEventTsRef.current = now;

      const step: MacroEventStep = {
        web_code: e.code || 'KeyA',
        key_label: e.key.length === 1 ? e.key.toUpperCase() : e.code,
        is_down: isDown,
        delay_ms: delta,
      };
      onSaveMacros(
        macros.map((m) =>
          m.id === activeMacro.id ? { ...m, steps: [...m.steps, step] } : m
        )
      );
      onPreviewStepSound(step.web_code, isDown);
    };

    const down = (e: KeyboardEvent) => pushStep(e, true);
    const up = (e: KeyboardEvent) => pushStep(e, false);
    window.addEventListener('keydown', down, true);
    window.addEventListener('keyup', up, true);
    return () => {
      window.removeEventListener('keydown', down, true);
      window.removeEventListener('keyup', up, true);
    };
  }, [recording, activeMacro, macros, onSaveMacros, onPreviewStepSound]);

  const handleAddMacro = () => {
    const id = `macro-${Date.now().toString(36)}`;
    const next: SxBoardMacro = {
      id,
      name: `Macro ${macros.length + 1}`,
      category: 'Custom',
      steps: [
        { web_code: 'KeyA', key_label: 'A', is_down: true, delay_ms: 25 },
        { web_code: 'KeyA', key_label: 'A', is_down: false, delay_ms: 20 },
      ],
    };
    onSaveMacros([...macros, next]);
    setSelectedId(id);
  };

  const handleDeleteMacro = (id: string) => {
    const next = macros.filter((m) => m.id !== id);
    onSaveMacros(next);
    if (selectedId === id) setSelectedId(next[0]?.id ?? '');
  };

  const canWrite = Boolean(device?.capabilities.macros && device.capabilities.writable);

  const filtered = macros.filter((m) =>
    !search.trim()
      ? true
      : m.name.toLowerCase().includes(search.trim().toLowerCase())
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 lg:flex-row">
      {/* Left Macros & Commands Drawer (Reference Bottom-Left Window Style) */}
      <aside className="flex w-full shrink-0 flex-col overflow-hidden rounded-2xl border border-purple-500/20 bg-[#100d1a] lg:w-[300px]">
        <div className="grid grid-cols-2 border-b border-purple-500/15 px-3 pt-3">
          <button
            type="button"
            onClick={() => setDrawerTab('macros')}
            className={`cursor-pointer border-b-2 pb-2.5 text-[11px] font-bold tracking-[0.12em] uppercase transition ${
              drawerTab === 'macros'
                ? 'border-purple-400 text-white'
                : 'border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {t.sxb.macrosTitle}
          </button>
          <button
            type="button"
            onClick={() => setDrawerTab('commands')}
            className={`cursor-pointer border-b-2 pb-2.5 text-[11px] font-bold tracking-[0.12em] uppercase transition ${
              drawerTab === 'commands'
                ? 'border-purple-400 text-white'
                : 'border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {t.sxb.commandsTitle}
          </button>
        </div>

        <div className="flex items-center gap-2 p-3">
          <div className="flex flex-1 items-center gap-2 rounded-lg border border-purple-500/20 bg-[#0b0913] px-3 py-1.5">
            <Search className="h-3.5 w-3.5 text-zinc-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t.sxb.searchKeys}
              className="w-full bg-transparent text-xs text-white placeholder-zinc-500 outline-none"
            />
          </div>
          <button
            type="button"
            onClick={handleAddMacro}
            title={t.sxb.addMacro}
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg bg-purple-600 text-white hover:bg-purple-500"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-1.5 overflow-y-auto px-3 pb-3">
          {drawerTab === 'macros' ? (
            filtered.map((m, idx) => (
              <div
                key={m.id}
                onClick={() => setSelectedId(m.id)}
                className={`flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2.5 transition ${
                  m.id === activeMacro?.id
                    ? 'border-purple-400 bg-purple-600/20 shadow-[0_0_16px_rgba(147,51,234,0.2)]'
                    : 'border-white/[0.06] bg-[#151221] hover:border-purple-500/35'
                }`}
              >
                <div className="min-w-0">
                  <div className="truncate text-xs font-bold text-white">
                    {m.name}
                  </div>
                  <div className="font-mono text-[10px] text-purple-300">
                    Macro #{idx + 1} · {m.steps.length} steps
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteMacro(m.id);
                  }}
                  className="rounded p-1 text-zinc-500 hover:bg-white/10 hover:text-rose-400"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          ) : (
            <div className="space-y-1.5 text-xs text-zinc-300">
              {['Volume Mute', 'Play / Pause', 'Next Track', 'Calculator', 'Browser Home'].map(
                (cmd) => (
                  <div
                    key={cmd}
                    className="rounded-lg border border-white/[0.06] bg-[#151221] px-3 py-2.5 font-semibold"
                  >
                    {cmd}
                  </div>
                )
              )}
            </div>
          )}
        </div>
      </aside>

      {/* Right Macro Timeline & Hardware Flash Stage */}
      <div className="flex min-w-0 flex-1 flex-col gap-3 rounded-2xl border border-purple-500/20 bg-[#100d1a] p-5">
        {activeMacro ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-purple-500/15 pb-3">
              <div className="flex items-center gap-2.5">
                <Zap className="h-4 w-4 text-purple-400" />
                <input
                  type="text"
                  value={activeMacro.name}
                  onChange={(e) =>
                    onSaveMacros(
                      macros.map((m) =>
                        m.id === activeMacro.id ? { ...m, name: e.target.value } : m
                      )
                    )
                  }
                  className="rounded-lg border border-purple-500/25 bg-[#0b0913] px-3 py-1.5 text-sm font-bold text-white outline-none focus:border-purple-400"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setRecording((r) => !r)}
                  className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition ${
                    recording
                      ? 'animate-pulse border-rose-400 bg-rose-500/20 text-rose-200'
                      : 'border-purple-500/35 bg-[#171326] text-purple-200 hover:border-purple-400'
                  }`}
                >
                  {recording ? (
                    <>
                      <Square className="h-3.5 w-3.5" />
                      {t.sxb.stopRecord}
                    </>
                  ) : (
                    <>
                      <Circle className="h-3.5 w-3.5 fill-rose-500 text-rose-500" />
                      {t.sxb.recordMacro}
                    </>
                  )}
                </button>

                <button
                  type="button"
                  disabled={!canWrite || busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await onFlashToDevice(macros);
                    } finally {
                      setBusy(false);
                    }
                  }}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-violet-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-[0_0_20px_rgba(147,51,234,0.35)] hover:brightness-110 disabled:opacity-45"
                >
                  <Cpu className="h-3.5 w-3.5" />
                  {t.sxb.flashMacros}
                </button>
              </div>
            </div>

            <p className="text-xs text-zinc-400">{t.sxb.macroHint}</p>

            {/* Macro Timeline Events */}
            <div className="flex-1 space-y-1.5 overflow-y-auto pr-1">
              {activeMacro.steps.map((step, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-xl border border-purple-500/15 bg-[#161224] px-3.5 py-2"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-[10px] text-zinc-500">
                      #{i + 1}
                    </span>
                    <span
                      className={`rounded px-2 py-0.5 font-mono text-[10px] font-bold uppercase ${
                        step.is_down
                          ? 'bg-purple-500/25 text-purple-200'
                          : 'bg-zinc-800 text-zinc-400'
                      }`}
                    >
                      {step.is_down ? 'DOWN' : 'UP'}
                    </span>
                    <span className="rounded border border-white/15 bg-[#0c0a14] px-2 py-0.5 font-mono text-xs font-bold text-white">
                      {step.key_label}
                    </span>
                    <span className="font-mono text-[11px] text-zinc-400">
                      +{step.delay_ms} ms
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      onSaveMacros(
                        macros.map((m) =>
                          m.id === activeMacro.id
                            ? {
                                ...m,
                                steps: m.steps.filter((_, idx) => idx !== i),
                              }
                            : m
                        )
                      )
                    }
                    className="cursor-pointer rounded p-1 text-zinc-500 hover:bg-white/10 hover:text-rose-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-xs text-zinc-500">
            Select or create a macro.
          </div>
        )}
      </div>
    </div>
  );
};
