import React, { useState } from 'react';
import {
  ModTapRule,
  SocdMode,
  SxPerformanceConfig,
  SxPerformanceDiagnostics,
  TapDanceRule,
} from '../types';
import { useI18n } from '../i18n';
import {
  Activity,
  CheckCircle2,
  Plus,
  ShieldAlert,
  Trash2,
  Zap,
} from 'lucide-react';

interface SxPerformancePanelProps {
  config: SxPerformanceConfig;
  diagnostics: SxPerformanceDiagnostics;
  onUpdateConfig: (next: SxPerformanceConfig) => void;
  onEmergencyBypass: () => void;
  onInstallRules: () => void;
}

const KEY_CANDIDATES = [
  'KeyA',
  'KeyD',
  'KeyW',
  'KeyS',
  'Space',
  'CapsLock',
  'Escape',
  'Tab',
  'ShiftLeft',
  'ShiftRight',
  'ControlLeft',
  'ControlRight',
  'AltLeft',
  'AltRight',
  'MetaLeft',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Pause',
];

export const SxPerformancePanel: React.FC<SxPerformancePanelProps> = ({
  config,
  diagnostics,
  onUpdateConfig,
  onEmergencyBypass,
  onInstallRules,
}) => {
  const { t } = useI18n();
  const [remapFrom, setRemapFrom] = useState('CapsLock');
  const [remapTo, setRemapTo] = useState('Escape');

  const setSocdMode = (mode: SocdMode) => {
    onUpdateConfig({ ...config, socd_mode: mode });
  };

  const addSocdPair = () => {
    onUpdateConfig({
      ...config,
      socd_pairs: [...config.socd_pairs, { key_a: 'ArrowLeft', key_b: 'ArrowRight' }],
    });
  };

  const removeSocdPair = (idx: number) => {
    onUpdateConfig({
      ...config,
      socd_pairs: config.socd_pairs.filter((_, i) => i !== idx),
    });
  };

  const addModTap = () => {
    const rule: ModTapRule = {
      trigger_key: 'Space',
      tap_key: 'Space',
      hold_key: 'ShiftLeft',
      threshold_ms: 175,
      enabled: true,
    };
    onUpdateConfig({ ...config, mod_taps: [...config.mod_taps, rule] });
  };

  const addTapDance = () => {
    const rule: TapDanceRule = {
      trigger_key: 'ShiftRight',
      single_key: 'ShiftRight',
      double_key: 'CapsLock',
      window_ms: 240,
      enabled: true,
    };
    onUpdateConfig({ ...config, tap_dances: [...config.tap_dances, rule] });
  };

  const addRemap = () => {
    if (!remapFrom || !remapTo || remapFrom === remapTo) return;
    onUpdateConfig({
      ...config,
      key_remaps: { ...config.key_remaps, [remapFrom]: remapTo },
    });
  };

  const toggleOneShot = (modKey: string) => {
    const exists = config.one_shot_mods.includes(modKey);
    const next = exists
      ? config.one_shot_mods.filter((k) => k !== modKey)
      : [...config.one_shot_mods, modKey];
    onUpdateConfig({ ...config, one_shot_mods: next });
  };

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto pr-1">
      {/* Top Opt-In Pipeline Control + Emergency Bypass Header */}
      <div className="sxm-card-elevated flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex items-start gap-3.5">
          <div
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
              config.enabled ? 'bg-white text-black' : 'border border-white/12 bg-white/5 text-zinc-300'
            }`}
          >
            <Zap className="h-5 w-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-bold text-white">{t.sxperf.optInLabel}</h2>
              {diagnostics.uinput_ready ? (
                <span className="flex items-center gap-1 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-300">
                  <CheckCircle2 className="h-3 w-3" />
                  {t.sxperf.uinputReady}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={onInstallRules}
                  className="cursor-pointer rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-0.5 text-[10px] font-semibold text-amber-200 hover:bg-amber-400/20"
                >
                  {t.sxperf.uinputMissing}
                </button>
              )}
            </div>
            <p className="mt-1 max-w-2xl text-xs text-zinc-400">{t.sxperf.optInDesc}</p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onEmergencyBypass}
            className="flex cursor-pointer items-center gap-1.5 rounded-full border border-amber-400/35 bg-amber-400/10 px-4 py-2 text-xs font-bold text-amber-200 transition hover:bg-amber-400/20"
          >
            <ShieldAlert className="h-4 w-4" />
            {t.sxperf.emergencyBypass}
          </button>

          <button
            type="button"
            disabled={!diagnostics.uinput_ready && !config.enabled}
            onClick={() => onUpdateConfig({ ...config, enabled: !config.enabled })}
            className={`cursor-pointer rounded-full px-5 py-2 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-40 ${
              config.enabled
                ? 'bg-white text-black hover:bg-zinc-200'
                : 'border border-white/20 bg-white/8 text-white hover:bg-white hover:text-black'
            }`}
          >
            {config.enabled ? t.onBadge : t.offBadge}
          </button>
        </div>
      </div>

      {diagnostics.last_error && (
        <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-2.5 text-xs text-rose-200">
          {diagnostics.last_error}
        </div>
      )}

      {/* Bento 2x2 Matrix */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Card 1: SOCD Resolution */}
        <div className="sxm-card flex flex-col gap-3.5 p-5 lg:col-span-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white">{t.sxperf.socdTitle}</h3>
            <button
              type="button"
              onClick={addSocdPair}
              className="flex cursor-pointer items-center gap-1 rounded-full border border-white/12 px-3 py-1 text-[11px] font-semibold text-zinc-200 hover:bg-white hover:text-black"
            >
              <Plus className="h-3 w-3" />
              {t.sxperf.addPair}
            </button>
          </div>

          <div className="grid grid-cols-4 gap-1.5 rounded-xl border border-white/8 bg-[#0b0b0d] p-1">
            {(['off', 'last_input', 'first_input', 'neutral'] as SocdMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setSocdMode(m)}
                className={`cursor-pointer rounded-lg py-2 text-[11px] font-bold uppercase transition ${
                  config.socd_mode === m
                    ? 'bg-white text-black'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                {m.replace('_', ' ')}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-2">
            {config.socd_pairs.map((pair, idx) => (
              <div
                key={idx}
                className="sxm-well flex items-center justify-between gap-2 px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <select
                    value={pair.key_a}
                    onChange={(e) => {
                      const next = [...config.socd_pairs];
                      next[idx] = { ...pair, key_a: e.target.value };
                      onUpdateConfig({ ...config, socd_pairs: next });
                    }}
                    className="rounded-lg border border-white/10 bg-[#141418] px-2 py-1 font-mono text-xs text-white outline-none"
                  >
                    {KEY_CANDIDATES.map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                  </select>
                  <span className="text-xs text-zinc-500">↔</span>
                  <select
                    value={pair.key_b}
                    onChange={(e) => {
                      const next = [...config.socd_pairs];
                      next[idx] = { ...pair, key_b: e.target.value };
                      onUpdateConfig({ ...config, socd_pairs: next });
                    }}
                    className="rounded-lg border border-white/10 bg-[#141418] px-2 py-1 font-mono text-xs text-white outline-none"
                  >
                    {KEY_CANDIDATES.map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="button"
                  onClick={() => removeSocdPair(idx)}
                  className="cursor-pointer rounded-full p-1 text-zinc-500 hover:bg-white/10 hover:text-white"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Card 2: Software Pipeline Latency & Input Analyzer */}
        <div className="sxm-card flex flex-col justify-between gap-3.5 p-5 lg:col-span-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-white" />
              <h3 className="text-sm font-bold text-white">{t.sxperf.telemetryTitle}</h3>
            </div>
            <span
              className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                diagnostics.virtual_pipeline_active
                  ? 'bg-white text-black'
                  : 'border border-white/12 text-zinc-500'
              }`}
            >
              {diagnostics.virtual_pipeline_active ? 'LIVE' : 'STANDBY'}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2.5 font-mono tabular-nums">
            <div className="sxm-well p-3">
              <div className="text-[10px] text-zinc-500 uppercase">{t.sxperf.avgLatency}</div>
              <div className="mt-1 text-xl font-bold text-white">
                {Math.round(diagnostics.avg_proc_us)} <span className="text-xs text-zinc-400">µs</span>
              </div>
            </div>
            <div className="sxm-well p-3">
              <div className="text-[10px] text-zinc-500 uppercase">{t.sxperf.p95Latency}</div>
              <div className="mt-1 text-xl font-bold text-white">
                {diagnostics.p95_proc_us} <span className="text-xs text-zinc-400">µs</span>
              </div>
            </div>
            <div className="sxm-well p-3">
              <div className="text-[10px] text-zinc-500 uppercase">{t.sxperf.maxLatency}</div>
              <div className="mt-1 text-xl font-bold text-white">
                {diagnostics.max_proc_us} <span className="text-xs text-zinc-400">µs</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2.5 font-mono text-xs tabular-nums">
            <div className="sxm-well px-3 py-2">
              <span className="text-zinc-500">{t.sxperf.processed}: </span>
              <strong className="text-white">{diagnostics.events_processed}</strong>
            </div>
            <div className="sxm-well px-3 py-2">
              <span className="text-zinc-500">{t.sxperf.resolutions}: </span>
              <strong className="text-white">{diagnostics.socd_resolutions}</strong>
            </div>
            <div className="sxm-well px-3 py-2">
              <span className="text-zinc-500">{t.sxperf.eventsSec}: </span>
              <strong className="text-white">{diagnostics.events_per_sec.toFixed(1)}</strong>
            </div>
          </div>

          <p className="text-[11px] leading-relaxed text-zinc-500">
            {diagnostics.latency_disclaimer}
          </p>
        </div>

        {/* Card 3: Mod-Tap & Tap-Dance */}
        <div className="sxm-card flex flex-col gap-3 p-5 lg:col-span-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white">{t.sxperf.modTapTitle}</h3>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={addModTap}
                className="cursor-pointer rounded-full border border-white/12 px-2.5 py-1 text-[11px] font-semibold text-zinc-200 hover:bg-white hover:text-black"
              >
                + Mod-Tap
              </button>
              <button
                type="button"
                onClick={addTapDance}
                className="cursor-pointer rounded-full border border-white/12 px-2.5 py-1 text-[11px] font-semibold text-zinc-200 hover:bg-white hover:text-black"
              >
                + Tap-Dance
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            {config.mod_taps.map((rule, idx) => (
              <div
                key={`mt-${idx}`}
                className="sxm-well flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs"
              >
                <div className="flex flex-wrap items-center gap-1.5 font-mono">
                  <span className="text-[10px] text-zinc-500 uppercase">MOD-TAP</span>
                  <select
                    value={rule.trigger_key}
                    onChange={(e) => {
                      const next = [...config.mod_taps];
                      next[idx] = { ...rule, trigger_key: e.target.value };
                      onUpdateConfig({ ...config, mod_taps: next });
                    }}
                    className="rounded border border-white/10 bg-[#141418] px-1.5 py-0.5 text-white"
                  >
                    {KEY_CANDIDATES.map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                  </select>
                  <span className="text-zinc-500">→ tap</span>
                  <select
                    value={rule.tap_key}
                    onChange={(e) => {
                      const next = [...config.mod_taps];
                      next[idx] = { ...rule, tap_key: e.target.value };
                      onUpdateConfig({ ...config, mod_taps: next });
                    }}
                    className="rounded border border-white/10 bg-[#141418] px-1.5 py-0.5 text-white"
                  >
                    {KEY_CANDIDATES.map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                  </select>
                  <span className="text-zinc-500">/ hold</span>
                  <select
                    value={rule.hold_key}
                    onChange={(e) => {
                      const next = [...config.mod_taps];
                      next[idx] = { ...rule, hold_key: e.target.value };
                      onUpdateConfig({ ...config, mod_taps: next });
                    }}
                    className="rounded border border-white/10 bg-[#141418] px-1.5 py-0.5 text-white"
                  >
                    {KEY_CANDIDATES.map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      const next = [...config.mod_taps];
                      next[idx] = { ...rule, enabled: !rule.enabled };
                      onUpdateConfig({ ...config, mod_taps: next });
                    }}
                    className={`cursor-pointer rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                      rule.enabled ? 'bg-white text-black' : 'bg-white/5 text-zinc-400'
                    }`}
                  >
                    {rule.enabled ? t.onBadge : t.offBadge}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateConfig({
                        ...config,
                        mod_taps: config.mod_taps.filter((_, i) => i !== idx),
                      })
                    }
                    className="cursor-pointer p-1 text-zinc-500 hover:text-white"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}

            {config.tap_dances.map((td, idx) => (
              <div
                key={`td-${idx}`}
                className="sxm-well flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs"
              >
                <div className="flex flex-wrap items-center gap-1.5 font-mono">
                  <span className="text-[10px] text-zinc-500 uppercase">TAP-DANCE</span>
                  <span className="rounded bg-white/10 px-1.5 py-0.5 text-white">
                    {td.trigger_key}
                  </span>
                  <span className="text-zinc-500">1× {td.single_key}</span>
                  <span className="text-zinc-500">2× {td.double_key}</span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateConfig({
                      ...config,
                      tap_dances: config.tap_dances.filter((_, i) => i !== idx),
                    })
                  }
                  className="cursor-pointer p-1 text-zinc-500 hover:text-white"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Card 4: One-Shot Modifiers & Software Remaps */}
        <div className="sxm-card flex flex-col gap-3 p-5 lg:col-span-6">
          <h3 className="text-sm font-bold text-white">{t.sxperf.oneShotTitle}</h3>

          <div className="flex flex-wrap gap-1.5">
            {['ShiftLeft', 'ControlLeft', 'AltLeft', 'MetaLeft'].map((modKey) => {
              const active = config.one_shot_mods.includes(modKey);
              return (
                <button
                  key={modKey}
                  type="button"
                  onClick={() => toggleOneShot(modKey)}
                  className={`cursor-pointer rounded-full px-3 py-1 font-mono text-[11px] font-semibold transition ${
                    active
                      ? 'bg-white text-black'
                      : 'border border-white/10 bg-[#0b0b0d] text-zinc-400 hover:text-white'
                  }`}
                >
                  One-Shot {modKey}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-white/8 pt-3">
            <select
              value={remapFrom}
              onChange={(e) => setRemapFrom(e.target.value)}
              className="rounded-xl border border-white/10 bg-[#0b0b0d] px-2.5 py-1.5 font-mono text-xs text-white"
            >
              {KEY_CANDIDATES.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
            <span className="text-xs text-zinc-500">→</span>
            <select
              value={remapTo}
              onChange={(e) => setRemapTo(e.target.value)}
              className="rounded-xl border border-white/10 bg-[#0b0b0d] px-2.5 py-1.5 font-mono text-xs text-white"
            >
              {KEY_CANDIDATES.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={addRemap}
              className="cursor-pointer rounded-full bg-white px-3 py-1.5 text-[11px] font-bold text-black hover:bg-zinc-200"
            >
              <Plus className="inline h-3 w-3" /> Remap
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {Object.entries(config.key_remaps).map(([fromKey, toKey]) => (
              <div
                key={fromKey}
                className="flex items-center gap-2 rounded-full border border-white/12 bg-[#0b0b0d] px-3 py-1 font-mono text-[11px] text-white"
              >
                <span>
                  {fromKey} → {toKey}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const next = { ...config.key_remaps };
                    delete next[fromKey];
                    onUpdateConfig({ ...config, key_remaps: next });
                  }}
                  className="cursor-pointer text-zinc-400 hover:text-white"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
