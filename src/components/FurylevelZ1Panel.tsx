import React, { useEffect, useState } from 'react';
import {
  HardwareDeviceInfo,
  MouseConfigUpdate,
  MouseHardwareState,
} from '../types';
import { useI18n } from '../i18n';
import {
  Activity,
  Battery,
  BatteryCharging,
  Check,
  Cpu,
  Gauge,
  Mouse,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  Sliders,
  Sun,
  Timer,
  Zap,
} from 'lucide-react';

interface FurylevelZ1PanelProps {
  device: HardwareDeviceInfo;
  mouseState: MouseHardwareState | null;
  busy: boolean;
  onRefresh: () => Promise<void>;
  onApplyConfig: (patch: MouseConfigUpdate) => Promise<void>;
  onFactoryReset: () => Promise<void>;
  onInstallPermissions: () => Promise<void>;
}

const POLLING_RATES_1K = [125, 250, 500, 1000];
const POLLING_RATES_4K = [125, 250, 500, 1000, 2000, 4000];
const SLEEP_PRESETS = [1, 3, 5, 10, 15, 30];
const DEBOUNCE_PRESETS = [0, 2, 4, 8, 12, 16, 20];

function rgbToHex(rgb: [number, number, number]): string {
  return (
    '#' +
    rgb
      .map((c) => Math.max(0, Math.min(255, c)).toString(16).padStart(2, '0'))
      .join('')
  );
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return [255, 255, 255];
  const r = parseInt(clean.slice(0, 2), 16) || 0;
  const g = parseInt(clean.slice(2, 4), 16) || 0;
  const b = parseInt(clean.slice(4, 6), 16) || 0;
  return [r, g, b];
}

export const FurylevelZ1Panel: React.FC<FurylevelZ1PanelProps> = ({
  device,
  mouseState,
  busy,
  onRefresh,
  onApplyConfig,
  onFactoryReset,
  onInstallPermissions,
}) => {
  const { t, lang } = useI18n();
  const md = t.mouseDriver;

  const [dpiDraft, setDpiDraft] = useState<number[]>(
    mouseState?.dpi_stages ?? [400, 800, 1600, 3200, 6400, 12800]
  );
  const [colorsDraft, setColorsDraft] = useState<[number, number, number][]>(
    mouseState?.dpi_colors ?? [
      [255, 0, 0],
      [0, 120, 255],
      [0, 220, 90],
      [255, 200, 0],
      [255, 255, 255],
      [255, 110, 0],
    ]
  );
  const [debounceDraft, setDebounceDraft] = useState<number>(
    mouseState?.debounce_ms ?? 8
  );

  useEffect(() => {
    if (!mouseState) return;
    setDpiDraft(mouseState.dpi_stages);
    setColorsDraft(mouseState.dpi_colors);
    setDebounceDraft(mouseState.debounce_ms);
  }, [mouseState]);

  const maxPolling = mouseState?.max_polling_rate ?? 1000;
  const pollingOptions =
    maxPolling >= 4000 ? POLLING_RATES_4K : POLLING_RATES_1K;

  const buttonLabels = [
    md.btnLeft,
    md.btnRight,
    md.btnMiddle,
    md.btnForward,
    md.btnBack,
    md.btnDpi,
  ];

  const ledModes = [
    { id: 0, label: md.ledOff },
    { id: 1, label: md.ledSteady },
    { id: 2, label: md.ledBreathing },
    { id: 3, label: md.ledNeon },
  ];

  const handleStageDpiCommit = (idx: number, val: number) => {
    const clamped = Math.max(50, Math.min(26000, Math.round(val / 50) * 50));
    const next = [...dpiDraft];
    next[idx] = clamped;
    setDpiDraft(next);
    onApplyConfig({ dpi_stages: next });
  };

  const handleColorCommit = (idx: number, hex: string) => {
    const next = [...colorsDraft];
    next[idx] = hexToRgb(hex);
    setColorsDraft(next);
    onApplyConfig({ dpi_colors: next });
  };

  return (
    <div className="space-y-4">
      {/* Top Hero Card */}
      <div className="sxm-card flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex items-center gap-3.5">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/15 bg-white text-black shadow-sm">
            <Mouse className="h-6 w-6" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-extrabold tracking-tight text-white">
                {device.display_name}
              </h2>
              <span className="rounded-full bg-white px-2.5 py-0.5 font-mono text-[10px] font-bold tracking-wider text-black uppercase">
                PAW3395 · BK3633
              </span>
              <span
                className={`rounded-full border px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase ${
                  device.online
                    ? 'border-emerald-400/35 bg-emerald-400/10 text-emerald-300'
                    : 'border-zinc-700 bg-zinc-800/60 text-zinc-400'
                }`}
              >
                {device.online ? t.sxb.online : t.sxb.standby}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-zinc-400">{md.subtitle}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {mouseState && (
            <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-[#0b0b0d] px-3.5 py-2">
              <div>
                <div className="text-[10px] font-semibold tracking-wider text-zinc-500 uppercase">
                  {md.activeDpi}
                </div>
                <div className="font-mono text-xs font-extrabold text-white tabular-nums">
                  {mouseState.dpi_stages[mouseState.active_stage] ??
                    mouseState.dpi_stages[0] ??
                    800}{' '}
                  DPI · {mouseState.polling_rate} Hz
                </div>
              </div>
              <div className="h-6 w-px bg-white/10" />
              {mouseState.is_charging ? (
                <BatteryCharging className="h-4 w-4 text-emerald-400" />
              ) : (
                <Battery className="h-4 w-4 text-white" />
              )}
              <div>
                <div className="text-[10px] font-semibold tracking-wider text-zinc-500 uppercase">
                  {mouseState.is_charging ? md.charging : md.battery}
                </div>
                <div className="font-mono text-xs font-bold text-white tabular-nums">
                  {mouseState.battery_pct}% · {mouseState.voltage_mv} mV
                </div>
              </div>
              <div className="h-6 w-px bg-white/10" />
              <div>
                <div className="text-[10px] font-semibold tracking-wider text-zinc-500 uppercase">
                  {md.firmware}
                </div>
                <div className="font-mono text-xs font-bold text-zinc-200 tabular-nums">
                  v{mouseState.firmware_version} · {mouseState.link_label}
                </div>
              </div>
            </div>
          )}

          {device.permission_ok && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={onRefresh}
                className="flex cursor-pointer items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-white/12 disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} />
                {md.syncRead}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={onFactoryReset}
                className="flex cursor-pointer items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3.5 py-2 text-xs font-semibold text-zinc-300 transition hover:border-white/30 hover:text-white disabled:opacity-50"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {md.factoryReset}
              </button>
            </>
          )}
        </div>
      </div>

      {/* HID Permission Gate if udev not applied */}
      {!device.permission_ok && (
        <div className="sxm-card flex flex-wrap items-center justify-between gap-4 border-amber-400/25 p-5">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
            <div>
              <h3 className="text-sm font-bold text-white">{md.grantHidPerm}</h3>
              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-zinc-400">
                {md.unlockHint}
              </p>
              <div className="mt-2 font-mono text-[11px] text-zinc-500">
                VID:PID {device.vid_pid} · IF#{device.interface_number} ·
                UP 0x{device.usage_page.toString(16).padStart(4, '0')}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onInstallPermissions}
            className="cursor-pointer rounded-full bg-white px-4 py-2 text-xs font-bold text-black transition hover:bg-zinc-200"
          >
            {md.grantHidPerm}
          </button>
        </div>
      )}

      {/* Main Bento Grid */}
      {device.permission_ok && mouseState && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          {/* DPI Stages Bento (7 cols) */}
          <div className="sxm-card space-y-4 p-5 xl:col-span-7">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Gauge className="h-4 w-4 text-white" />
                <h3 className="text-sm font-bold tracking-tight text-white">
                  {md.dpiStages}
                </h3>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold text-zinc-400">
                  {md.stageCount}:
                </span>
                <div className="flex rounded-full border border-white/10 bg-[#0b0b0d] p-0.5">
                  {[1, 2, 3, 4, 5, 6].map((cnt) => (
                    <button
                      key={cnt}
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        onApplyConfig({
                          stage_count: cnt,
                          active_stage: Math.min(mouseState.active_stage, cnt - 1),
                        })
                      }
                      className={`h-6 w-7 cursor-pointer rounded-full font-mono text-[11px] font-bold transition ${
                        mouseState.stage_count === cnt
                          ? 'bg-white text-black'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      {cnt}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-2.5">
              {Array.from({ length: 6 }, (_, idx) => {
                const enabled = idx < mouseState.stage_count;
                const isActive = mouseState.active_stage === idx;
                const val = dpiDraft[idx] ?? 800;
                const color = colorsDraft[idx] ?? [255, 255, 255];

                return (
                  <div
                    key={idx}
                    className={`rounded-2xl border p-3 transition ${
                      !enabled
                        ? 'border-white/5 bg-[#0b0b0d]/40 opacity-45'
                        : isActive
                          ? 'border-white/30 bg-[#141418]'
                          : 'border-white/10 bg-[#0b0b0d]'
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        disabled={!enabled || busy}
                        onClick={() => onApplyConfig({ active_stage: idx })}
                        className={`flex h-7 min-w-[82px] cursor-pointer items-center justify-center gap-1.5 rounded-full px-3 text-[11px] font-bold transition ${
                          isActive
                            ? 'bg-white text-black'
                            : 'border border-white/15 bg-white/5 text-zinc-300 hover:bg-white/12'
                        }`}
                      >
                        {isActive && <Check className="h-3 w-3" />}
                        DPI {idx + 1}
                      </button>

                      <input
                        type="range"
                        min={50}
                        max={26000}
                        step={50}
                        disabled={!enabled || busy}
                        value={val}
                        onChange={(e) => {
                          const v = parseInt(e.target.value, 10);
                          const next = [...dpiDraft];
                          next[idx] = v;
                          setDpiDraft(next);
                        }}
                        onMouseUp={() => handleStageDpiCommit(idx, val)}
                        onTouchEnd={() => handleStageDpiCommit(idx, val)}
                        className="sxm-slider min-w-[140px] flex-1"
                      />

                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={50}
                          max={26000}
                          step={50}
                          disabled={!enabled || busy}
                          value={val}
                          onChange={(e) => {
                            const v = parseInt(e.target.value, 10) || 50;
                            const next = [...dpiDraft];
                            next[idx] = v;
                            setDpiDraft(next);
                          }}
                          onBlur={() => handleStageDpiCommit(idx, val)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleStageDpiCommit(idx, val);
                          }}
                          className="w-20 rounded-xl border border-white/12 bg-black/50 px-2.5 py-1 text-right font-mono text-xs font-bold text-white outline-none focus:border-white/40 tabular-nums"
                        />
                        <label
                          className="relative flex h-7 w-7 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-white/25"
                          title={md.dpiColors}
                          style={{ backgroundColor: rgbToHex(color) }}
                        >
                          <input
                            type="color"
                            disabled={!enabled || busy}
                            value={rgbToHex(color)}
                            onChange={(e) => handleColorCommit(idx, e.target.value)}
                            className="absolute inset-0 cursor-pointer opacity-0"
                          />
                        </label>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Polling, LOD, Debounce & PAW3395 Sensor Tuning (5 cols) */}
          <div className="space-y-4 xl:col-span-5">
            {/* Polling Rate + LOD + Debounce */}
            <div className="sxm-card space-y-4 p-5">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-white" />
                <h3 className="text-sm font-bold tracking-tight text-white">
                  {md.pollingRate}
                </h3>
              </div>

              <div className="grid grid-cols-4 gap-2">
                {pollingOptions.map((hz) => (
                  <button
                    key={hz}
                    type="button"
                    disabled={busy}
                    onClick={() => onApplyConfig({ polling_rate: hz })}
                    className={`cursor-pointer rounded-xl py-2 font-mono text-xs font-bold transition ${
                      mouseState.polling_rate === hz
                        ? 'bg-white text-black'
                        : 'border border-white/10 bg-[#0b0b0d] text-zinc-300 hover:border-white/25 hover:text-white'
                    }`}
                  >
                    {hz >= 1000 ? `${hz / 1000}kHz` : `${hz}Hz`}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 gap-3 pt-1 sm:grid-cols-2">
                {/* LOD */}
                <div className="sxm-well space-y-2 p-3">
                  <div className="text-[11px] font-semibold text-zinc-400">
                    {md.lod}
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {[1, 2].map((mm) => (
                      <button
                        key={mm}
                        type="button"
                        disabled={busy}
                        onClick={() => onApplyConfig({ lod_mm: mm })}
                        className={`cursor-pointer rounded-lg py-1.5 font-mono text-xs font-bold transition ${
                          mouseState.lod_mm === mm
                            ? 'bg-white text-black'
                            : 'border border-white/10 bg-black/40 text-zinc-400 hover:text-white'
                        }`}
                      >
                        {mm} mm
                      </button>
                    ))}
                  </div>
                </div>

                {/* Debounce */}
                <div className="sxm-well space-y-2 p-3">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-zinc-400">
                    <span>{md.debounce}</span>
                    <span className="font-mono text-white tabular-nums">
                      {debounceDraft} {md.msUnit}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={30}
                    step={1}
                    disabled={busy}
                    value={debounceDraft}
                    onChange={(e) => setDebounceDraft(parseInt(e.target.value, 10))}
                    onMouseUp={() => onApplyConfig({ debounce_ms: debounceDraft })}
                    onTouchEnd={() => onApplyConfig({ debounce_ms: debounceDraft })}
                    className="sxm-slider w-full"
                  />
                  <div className="flex flex-wrap gap-1">
                    {DEBOUNCE_PRESETS.map((ms) => (
                      <button
                        key={ms}
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setDebounceDraft(ms);
                          onApplyConfig({ debounce_ms: ms });
                        }}
                        className={`cursor-pointer rounded-md px-1.5 py-0.5 font-mono text-[10px] font-semibold transition ${
                          debounceDraft === ms
                            ? 'bg-white text-black'
                            : 'bg-black/40 text-zinc-400 hover:text-white'
                        }`}
                      >
                        {ms}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* PAW3395 Sensor Features */}
            <div className="sxm-card space-y-3 p-5">
              <div className="flex items-center gap-2">
                <Cpu className="h-4 w-4 text-white" />
                <h3 className="text-sm font-bold tracking-tight text-white">
                  {md.sensorTuning}
                </h3>
              </div>

              {(
                [
                  {
                    key: 'motion_sync',
                    title: md.motionSync,
                    desc: md.motionSyncDesc,
                    active: mouseState.motion_sync,
                  },
                  {
                    key: 'ripple_control',
                    title: md.rippleControl,
                    desc: md.rippleControlDesc,
                    active: mouseState.ripple_control,
                  },
                  {
                    key: 'angle_snap',
                    title: md.angleSnap,
                    desc: md.angleSnapDesc,
                    active: mouseState.angle_snap,
                  },
                ] as const
              ).map((item) => (
                <div
                  key={item.key}
                  className="sxm-well flex items-center justify-between gap-3 p-3"
                >
                  <div>
                    <div className="text-xs font-bold text-white">{item.title}</div>
                    <div className="text-[11px] text-zinc-400">{item.desc}</div>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onApplyConfig({ [item.key]: !item.active })}
                    className={`shrink-0 cursor-pointer rounded-full px-3.5 py-1 text-[11px] font-bold transition ${
                      item.active
                        ? 'bg-white text-black'
                        : 'border border-white/15 bg-white/5 text-zinc-400 hover:text-white'
                    }`}
                  >
                    {item.active ? t.onBadge : t.offBadge}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Power & Lighting (6 cols) */}
          <div className="sxm-card space-y-4 p-5 xl:col-span-6">
            <div className="flex items-center gap-2">
              <Sun className="h-4 w-4 text-white" />
              <h3 className="text-sm font-bold tracking-tight text-white">
                {md.powerLighting}
              </h3>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="sxm-well space-y-2 p-3">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-400">
                  <Timer className="h-3.5 w-3.5" />
                  <span>{md.sleepTimer}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {SLEEP_PRESETS.map((min) => (
                    <button
                      key={min}
                      type="button"
                      disabled={busy}
                      onClick={() => onApplyConfig({ sleep_timeout_min: min })}
                      className={`cursor-pointer rounded-lg px-2.5 py-1 font-mono text-xs font-bold transition ${
                        mouseState.sleep_timeout_min === min
                          ? 'bg-white text-black'
                          : 'border border-white/10 bg-black/40 text-zinc-400 hover:text-white'
                      }`}
                    >
                      {min}
                      {md.minUnit}
                    </button>
                  ))}
                </div>
              </div>

              <div className="sxm-well flex items-center justify-between gap-3 p-3">
                <div>
                  <div className="text-xs font-bold text-white">
                    {md.moveLightOff}
                  </div>
                  <div className="text-[11px] text-zinc-400">
                    {md.moveLightOffDesc}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    onApplyConfig({ move_light_off: !mouseState.move_light_off })
                  }
                  className={`shrink-0 cursor-pointer rounded-full px-3.5 py-1 text-[11px] font-bold transition ${
                    mouseState.move_light_off
                      ? 'bg-white text-black'
                      : 'border border-white/15 bg-white/5 text-zinc-400 hover:text-white'
                  }`}
                >
                  {mouseState.move_light_off ? t.onBadge : t.offBadge}
                </button>
              </div>
            </div>

            <div className="sxm-well space-y-3 p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold text-white">{md.ledEffect}</span>
                <div className="flex flex-wrap gap-1.5">
                  {ledModes.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      disabled={busy}
                      onClick={() => onApplyConfig({ lighting_mode: m.id })}
                      className={`cursor-pointer rounded-full px-3 py-1 text-[11px] font-bold transition ${
                        mouseState.lighting_mode === m.id
                          ? 'bg-white text-black'
                          : 'border border-white/10 bg-black/40 text-zinc-400 hover:text-white'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <div className="mb-1 flex justify-between text-[11px] text-zinc-400">
                    <span>{md.ledBrightness}</span>
                    <span className="font-mono text-white">
                      {mouseState.lighting_brightness}/4
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-1">
                    {[1, 2, 3, 4].map((lv) => (
                      <button
                        key={lv}
                        type="button"
                        disabled={busy}
                        onClick={() => onApplyConfig({ lighting_brightness: lv })}
                        className={`cursor-pointer rounded-lg py-1 font-mono text-xs font-bold transition ${
                          mouseState.lighting_brightness === lv
                            ? 'bg-white text-black'
                            : 'border border-white/10 bg-black/40 text-zinc-400 hover:text-white'
                        }`}
                      >
                        {lv}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="mb-1 flex justify-between text-[11px] text-zinc-400">
                    <span>{md.ledSpeed}</span>
                    <span className="font-mono text-white">
                      {mouseState.lighting_speed}/4
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-1">
                    {[1, 2, 3, 4].map((sp) => (
                      <button
                        key={sp}
                        type="button"
                        disabled={busy}
                        onClick={() => onApplyConfig({ lighting_speed: sp })}
                        className={`cursor-pointer rounded-lg py-1 font-mono text-xs font-bold transition ${
                          mouseState.lighting_speed === sp
                            ? 'bg-white text-black'
                            : 'border border-white/10 bg-black/40 text-zinc-400 hover:text-white'
                        }`}
                      >
                        {sp}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 6-Button Remapping (6 cols) */}
          <div className="sxm-card space-y-4 p-5 xl:col-span-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sliders className="h-4 w-4 text-white" />
                <h3 className="text-sm font-bold tracking-tight text-white">
                  {md.buttonMapping}
                </h3>
              </div>
              <span className="flex items-center gap-1 font-mono text-[10px] text-zinc-500">
                <Activity className="h-3 w-3" /> 6 CHANNELS
              </span>
            </div>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {buttonLabels.map((btnLabel, idx) => {
                const current = mouseState.button_mappings[idx] ?? 'left';
                return (
                  <div
                    key={btnLabel}
                    className="sxm-well flex items-center justify-between gap-2 p-3"
                  >
                    <div>
                      <div className="text-[10px] font-semibold text-zinc-500 uppercase">
                        CH {idx + 1}
                      </div>
                      <div className="text-xs font-bold text-white">{btnLabel}</div>
                    </div>
                    <select
                      disabled={busy}
                      value={current}
                      onChange={(e) => {
                        const next = [...mouseState.button_mappings];
                        next[idx] = e.target.value;
                        onApplyConfig({ button_mappings: next });
                      }}
                      className="max-w-[160px] cursor-pointer rounded-xl border border-white/12 bg-[#0b0b0d] px-2.5 py-1.5 text-xs font-semibold text-white outline-none focus:border-white/35"
                    >
                      {mouseState.available_button_actions.map((opt) => (
                        <option key={opt.id} value={opt.id}>
                          {lang === 'tr' ? opt.label_tr : opt.label_en}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
