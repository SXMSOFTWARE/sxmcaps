import React, { useMemo, useState } from 'react';
import {
  DeviceHardwareState,
  HardwareDeviceInfo,
} from '../types';
import { useI18n } from '../i18n';
import { AulaF75BoardStage, F75VisualKey } from './AulaF75BoardStage';
import {
  Cpu,
  Palette,
  RefreshCw,
  Sliders,
  Sparkles,
  Sun,
} from 'lucide-react';

interface SxBoardRgbPanelProps {
  device: HardwareDeviceInfo | null;
  hwState: DeviceHardwareState | null;
  pressedKeys: Set<string>;
  loading: boolean;
  onApplyEffect: (
    effectId: number,
    brightness: number,
    speed: number,
    colorIdx: number
  ) => Promise<void>;
  onApplyPerKey: (colors: [number, number, number][], brightness: number) => Promise<void>;
  onApplyFlags: (flags: {
    sideMode?: number;
    knobMode?: number;
    osMode?: number;
    winLock?: boolean;
    sleepSeconds?: number;
  }) => Promise<void>;
  onRefreshState: () => Promise<void>;
}

const COLOR_SWATCHES = [
  { idx: 0, label: 'Red', hex: '#ef4444' },
  { idx: 1, label: 'Green', hex: '#22c55e' },
  { idx: 2, label: 'Blue', hex: '#3b82f6' },
  { idx: 3, label: 'Yellow', hex: '#eab308' },
  { idx: 4, label: 'Purple', hex: '#a855f7' },
  { idx: 5, label: 'Cyan', hex: '#06b6d4' },
  { idx: 6, label: 'White', hex: '#f8fafc' },
  { idx: 7, label: 'Rainbow', hex: 'linear-gradient(135deg,#ef4444,#eab308,#22c55e,#06b6d4,#a855f7)' },
];

const BRUSH_SWATCHES: { hex: string; rgb: [number, number, number] }[] = [
  { hex: '#9333ea', rgb: [147, 51, 234] },
  { hex: '#c026d3', rgb: [192, 38, 211] },
  { hex: '#e11d48', rgb: [225, 29, 72] },
  { hex: '#06b6d4', rgb: [6, 182, 212] },
  { hex: '#22c55e', rgb: [34, 197, 94] },
  { hex: '#f59e0b', rgb: [245, 158, 11] },
  { hex: '#ffffff', rgb: [255, 255, 255] },
  { hex: '#000000', rgb: [0, 0, 0] },
];

const SLEEP_OPTIONS = [0, 60, 120, 180, 300, 600, 900, 1200];

export const SxBoardRgbPanel: React.FC<SxBoardRgbPanelProps> = ({
  device,
  hwState,
  pressedKeys,
  loading,
  onApplyEffect,
  onApplyPerKey,
  onApplyFlags,
  onRefreshState,
}) => {
  const { t, lang } = useI18n();
  const [subTab, setSubTab] = useState<'effects' | 'perkey' | 'hardware'>('effects');

  const [effectId, setEffectId] = useState<number>(hwState?.effect_id ?? 3);
  const [brightness, setBrightness] = useState<number>(hwState?.brightness ?? 9);
  const [speed, setSpeed] = useState<number>(hwState?.speed ?? 4);
  const [colorIdx, setColorIdx] = useState<number>(hwState?.color_idx ?? 7);
  const [brushHex, setBrushHex] = useState<string>('#9333ea');
  const [perKey, setPerKey] = useState<[number, number, number][]>(() => {
    const arr: [number, number, number][] = Array.from({ length: 126 }, () => [139, 92, 246]);
    return hwState?.per_key_colors?.length === 126 ? hwState.per_key_colors : arr;
  });

  // Sync draft controls when fresh hardware read arrives
  React.useEffect(() => {
    if (!hwState) return;
    setEffectId(hwState.effect_id);
    setBrightness(hwState.brightness);
    setSpeed(hwState.speed);
    setColorIdx(hwState.color_idx);
    if (hwState.per_key_colors && hwState.per_key_colors.length >= 126) {
      setPerKey(hwState.per_key_colors.slice(0, 126));
    }
  }, [hwState]);

  const hexToRgb = (hex: string): [number, number, number] => {
    const clean = hex.replace('#', '');
    if (clean.length !== 6) return [147, 51, 234];
    return [
      parseInt(clean.slice(0, 2), 16),
      parseInt(clean.slice(2, 4), 16),
      parseInt(clean.slice(4, 6), 16),
    ];
  };

  const canWrite = Boolean(device?.capabilities.rgb_effects && device.capabilities.writable);
  const effects = useMemo(() => hwState?.supported_effects ?? [], [hwState]);
  const selectedEffectMeta = effects.find((e) => e.id === effectId);

  const handlePaintKey = (key: F75VisualKey) => {
    if (subTab !== 'perkey') return;
    const rgb = hexToRgb(brushHex);
    setPerKey((prev) => {
      const next = [...prev];
      if (key.matrixIndex < next.length) {
        next[key.matrixIndex] = rgb;
      }
      return next;
    });
  };

  const paintPreset = (mode: 'fill' | 'violet' | 'wasd') => {
    const rgb = hexToRgb(brushHex);
    setPerKey(() => {
      if (mode === 'fill') {
        return Array.from({ length: 126 }, () => rgb);
      }
      if (mode === 'violet') {
        return Array.from({ length: 126 }, (_, i) =>
          i % 6 === 0 ? [225, 29, 72] : i === 35 || i === 81 ? [255, 255, 255] : [139, 92, 246]
        );
      }
      // WASD + arrows
      const hot = new Set([14, 9, 15, 21, 82, 77, 83, 89, 0, 81]);
      return Array.from({ length: 126 }, (_, i) =>
        hot.has(i) ? [192, 38, 211] : [30, 27, 46]
      );
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 lg:flex-row">
      {/* Left SxBoard RGB & Hardware Drawer */}
      <aside className="flex w-full shrink-0 flex-col overflow-hidden rounded-2xl border border-purple-500/20 bg-[#100d1a] lg:w-[320px]">
        <div className="grid grid-cols-3 border-b border-purple-500/15 px-2 pt-3">
          {(
            [
              { id: 'effects', label: 'FX', icon: Sparkles },
              { id: 'perkey', label: 'PER-KEY', icon: Palette },
              { id: 'hardware', label: 'HW', icon: Cpu },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const active = subTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSubTab(tab.id)}
                className={`flex cursor-pointer items-center justify-center gap-1.5 border-b-2 pb-2.5 text-[10px] font-bold tracking-[0.1em] uppercase transition ${
                  active
                    ? 'border-purple-400 text-white'
                    : 'border-transparent text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-3.5">
          {/* FIRMWARE EFFECTS TAB */}
          {subTab === 'effects' && (
            <>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[10px] font-bold tracking-wider text-zinc-400 uppercase">
                  <span>{t.sxb.hwEffectsTab}</span>
                  <button
                    type="button"
                    onClick={onRefreshState}
                    className="inline-flex cursor-pointer items-center gap-1 text-purple-300 hover:text-white"
                  >
                    <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
                    {t.sxb.syncRead}
                  </button>
                </div>

                <div className="grid max-h-56 grid-cols-2 gap-1.5 overflow-y-auto pr-1">
                  {effects.map((eff) => {
                    const active = eff.id === effectId;
                    return (
                      <button
                        key={eff.id}
                        type="button"
                        onClick={() => setEffectId(eff.id)}
                        className={`cursor-pointer rounded-lg border px-2.5 py-2 text-left text-[11px] font-semibold transition ${
                          active
                            ? 'border-purple-400 bg-purple-600/25 text-white shadow-[0_0_12px_rgba(147,51,234,0.28)]'
                            : 'border-white/[0.06] bg-[#161224] text-zinc-300 hover:border-purple-500/35'
                        }`}
                      >
                        <div className="truncate">
                          {lang === 'tr' ? eff.name_tr : eff.name_en}
                        </div>
                        <div className="font-mono text-[9px] text-zinc-500">
                          ID #{eff.id}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Brightness Slider */}
              <div className="rounded-xl border border-purple-500/15 bg-[#151123] p-3">
                <div className="mb-1.5 flex items-center justify-between text-xs">
                  <span className="inline-flex items-center gap-1.5 text-zinc-300">
                    <Sun className="h-3.5 w-3.5 text-purple-400" />
                    {t.sxb.brightness}
                  </span>
                  <span className="font-mono text-xs font-bold text-purple-200">
                    {brightness} / 9
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={9}
                  value={brightness}
                  onChange={(e) => setBrightness(Number(e.target.value))}
                  className="sxm-slider w-full"
                />

                {/* Speed Slider */}
                {(!selectedEffectMeta || selectedEffectMeta.has_speed) && (
                  <>
                    <div className="mt-3 mb-1.5 flex items-center justify-between text-xs">
                      <span className="inline-flex items-center gap-1.5 text-zinc-300">
                        <Sliders className="h-3.5 w-3.5 text-purple-400" />
                        {t.sxb.speed}
                      </span>
                      <span className="font-mono text-xs font-bold text-purple-200">
                        {speed} / 4
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={4}
                      value={speed}
                      onChange={(e) => setSpeed(Number(e.target.value))}
                      className="sxm-slider w-full"
                    />
                  </>
                )}

                {/* Palette Color Swatches */}
                {(!selectedEffectMeta || selectedEffectMeta.has_color) && (
                  <div className="mt-3">
                    <div className="mb-2 text-[11px] text-zinc-400">
                      {t.sxb.paletteColor}
                    </div>
                    <div className="grid grid-cols-4 gap-1.5">
                      {COLOR_SWATCHES.map((sw) => (
                        <button
                          key={sw.idx}
                          type="button"
                          onClick={() => setColorIdx(sw.idx)}
                          className={`flex cursor-pointer items-center justify-center gap-1 rounded-lg border py-1.5 text-[10px] font-semibold transition ${
                            colorIdx === sw.idx
                              ? 'border-white bg-purple-500/20 text-white'
                              : 'border-white/10 bg-[#0d0b15] text-zinc-400 hover:border-purple-400/50'
                          }`}
                        >
                          <span
                            className="h-3 w-3 rounded-full border border-white/25"
                            style={{ background: sw.hex }}
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <button
                type="button"
                disabled={!canWrite || loading}
                onClick={() => onApplyEffect(effectId, brightness, speed, colorIdx)}
                className="w-full cursor-pointer rounded-xl bg-gradient-to-r from-purple-600 to-violet-600 py-2.5 text-xs font-bold tracking-wider text-white uppercase shadow-[0_0_24px_rgba(147,51,234,0.35)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {t.sxb.applyToBoard}
              </button>
            </>
          )}

          {/* PER-KEY RGB TAB */}
          {subTab === 'perkey' && (
            <>
              <p className="text-[11px] leading-relaxed text-zinc-400">
                {t.sxb.paintHint}
              </p>

              <div className="rounded-xl border border-purple-500/15 bg-[#151123] p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold text-white">Brush</span>
                  <input
                    type="color"
                    value={brushHex}
                    onChange={(e) => setBrushHex(e.target.value)}
                    className="h-7 w-10 cursor-pointer rounded border border-white/20 bg-transparent"
                  />
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {BRUSH_SWATCHES.map((sw) => (
                    <button
                      key={sw.hex}
                      type="button"
                      onClick={() => setBrushHex(sw.hex)}
                      className={`h-7 cursor-pointer rounded-lg border transition ${
                        brushHex.toLowerCase() === sw.hex
                          ? 'scale-105 border-white shadow-[0_0_10px_#fff]'
                          : 'border-white/20'
                      }`}
                      style={{ backgroundColor: sw.hex }}
                    />
                  ))}
                </div>

                <div className="mt-3 grid grid-cols-1 gap-1.5">
                  <button
                    type="button"
                    onClick={() => paintPreset('fill')}
                    className="cursor-pointer rounded-lg border border-purple-500/20 bg-[#0d0b15] px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:border-purple-400 hover:text-white"
                  >
                    {t.sxb.paintWhole}
                  </button>
                  <button
                    type="button"
                    onClick={() => paintPreset('violet')}
                    className="cursor-pointer rounded-lg border border-purple-500/20 bg-[#0d0b15] px-3 py-1.5 text-xs font-semibold text-purple-200 hover:border-purple-400 hover:text-white"
                  >
                    {t.sxb.paintViolet}
                  </button>
                  <button
                    type="button"
                    onClick={() => paintPreset('wasd')}
                    className="cursor-pointer rounded-lg border border-purple-500/20 bg-[#0d0b15] px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:border-purple-400 hover:text-white"
                  >
                    {t.sxb.paintWasd}
                  </button>
                </div>
              </div>

              <button
                type="button"
                disabled={!canWrite || loading}
                onClick={() => onApplyPerKey(perKey, brightness)}
                className="w-full cursor-pointer rounded-xl bg-gradient-to-r from-purple-600 to-violet-600 py-2.5 text-xs font-bold tracking-wider text-white uppercase shadow-[0_0_24px_rgba(147,51,234,0.35)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {t.sxb.applyToBoard}
              </button>
            </>
          )}

          {/* HARDWARE FLAGS TAB (Side Light, Knob Mode, OS Mode, Win Lock, Sleep Timer) */}
          {subTab === 'hardware' && hwState && (
            <div className="space-y-3">
              {/* Side Light Strip */}
              <div className="rounded-xl border border-purple-500/15 bg-[#151123] p-3">
                <div className="mb-2 text-[11px] font-bold text-zinc-300 uppercase">
                  {t.sxb.sideLight}
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {t.sxb.sideModes.map((label, idx) => (
                    <button
                      key={label}
                      type="button"
                      disabled={!canWrite || loading}
                      onClick={() => onApplyFlags({ sideMode: idx })}
                      className={`cursor-pointer rounded-lg border px-2 py-1.5 text-[11px] font-semibold transition ${
                        hwState.side_mode === idx
                          ? 'border-purple-400 bg-purple-600/30 text-white'
                          : 'border-white/10 bg-[#0d0b15] text-zinc-400 hover:text-white'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Rotary Knob Mode */}
              <div className="rounded-xl border border-purple-500/15 bg-[#151123] p-3">
                <div className="mb-2 text-[11px] font-bold text-zinc-300 uppercase">
                  {t.sxb.knobMode}
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {t.sxb.knobModes.map((label, idx) => (
                    <button
                      key={label}
                      type="button"
                      disabled={!canWrite || loading}
                      onClick={() => onApplyFlags({ knobMode: idx })}
                      className={`cursor-pointer rounded-lg border px-2 py-1.5 text-[11px] font-semibold transition ${
                        hwState.knob_mode === idx
                          ? 'border-purple-400 bg-purple-600/30 text-white'
                          : 'border-white/10 bg-[#0d0b15] text-zinc-400 hover:text-white'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* OS Mode */}
              <div className="rounded-xl border border-purple-500/15 bg-[#151123] p-3">
                <div className="mb-2 text-[11px] font-bold text-zinc-300 uppercase">
                  {t.sxb.osMode}
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {t.sxb.osModes.map((label, idx) => (
                    <button
                      key={label}
                      type="button"
                      disabled={!canWrite || loading}
                      onClick={() => onApplyFlags({ osMode: idx })}
                      className={`cursor-pointer rounded-lg border px-2 py-1.5 text-[11px] font-semibold transition ${
                        hwState.os_mode === idx
                          ? 'border-purple-400 bg-purple-600/30 text-white'
                          : 'border-white/10 bg-[#0d0b15] text-zinc-400 hover:text-white'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Win Lock + Sleep Timer */}
              <div className="rounded-xl border border-purple-500/15 bg-[#151123] p-3 space-y-2.5">
                <label className="flex cursor-pointer items-center justify-between text-xs text-zinc-200">
                  <span>{t.sxb.winLock}</span>
                  <input
                    type="checkbox"
                    disabled={!canWrite || loading}
                    checked={hwState.win_lock}
                    onChange={(e) => onApplyFlags({ winLock: e.target.checked })}
                    className="h-4 w-4 accent-purple-500"
                  />
                </label>

                <div className="border-t border-white/10 pt-2">
                  <div className="mb-1.5 text-[11px] font-semibold text-zinc-400">
                    {t.sxb.sleepTimer}
                  </div>
                  <div className="grid grid-cols-4 gap-1">
                    {SLEEP_OPTIONS.map((sec) => (
                      <button
                        key={sec}
                        type="button"
                        disabled={!canWrite || loading}
                        onClick={() => onApplyFlags({ sleepSeconds: sec })}
                        className={`cursor-pointer rounded border py-1 text-[10px] font-semibold ${
                          hwState.sleep_seconds === sec
                            ? 'border-purple-400 bg-purple-600/30 text-white'
                            : 'border-white/10 bg-[#0d0b15] text-zinc-400'
                        }`}
                      >
                        {sec === 0 ? t.sxb.sleepNever : `${sec / 60}m`}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Right Live Hardware Stage */}
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <AulaF75BoardStage
          mode="rgb"
          pressedKeys={pressedKeys}
          onSelectKey={handlePaintKey}
          effectId={subTab === 'perkey' ? 21 : effectId}
          brightness={brightness}
          speed={speed}
          colorIdx={colorIdx}
          sideMode={hwState?.side_mode ?? 1}
          perKeyColors={perKey}
          deviceTitle={device?.display_name ?? 'AULA F75'}
          badgeText={
            subTab === 'perkey'
              ? 'PER-KEY RGB'
              : selectedEffectMeta
              ? lang === 'tr'
                ? selectedEffectMeta.name_tr
                : selectedEffectMeta.name_en
              : hwState?.effect_name
          }
          showSandbox
        />
      </div>
    </div>
  );
};
