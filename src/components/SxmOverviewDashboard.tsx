import React, { useMemo } from 'react';
import {
  AppSettings,
  DeviceHardwareState,
  HardwareDeviceInfo,
  LightingPreviewFrame,
  MouseHardwareState,
  SoundpackInfo,
  StatsData,
  SxLightingPreset,
  SxLightingStatus,
  SxPerformanceConfig,
  SxPerformanceDiagnostics,
} from '../types';
import { useI18n } from '../i18n';
import { AulaF75BoardStage } from './AulaF75BoardStage';
import { DeviceSpecificNoticeCard } from './DeviceSpecificNoticeCard';
import {
  Activity,
  ArrowUpRight,
  Cpu,
  Headphones,
  Keyboard,
  Layers,
  Mouse,
  ShieldAlert,
  Sparkles,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react';

interface SxmOverviewDashboardProps {
  devices: HardwareDeviceInfo[];
  selectedDevice: HardwareDeviceInfo | null;
  hwState: DeviceHardwareState | null;
  mouseState?: MouseHardwareState | null;
  onSelectDevice: (id: string) => void;
  settings: AppSettings;
  soundpacks: SoundpackInfo[];
  audioDevices: string[];
  stats: StatsData;
  wpm: number;
  pressedKeys: Set<string>;
  pressedMouseButtons: Set<string>;
  lastKeyLabel: string | null;
  sxLightingStatus: SxLightingStatus;
  lightingFrame: LightingPreviewFrame | null;
  sxPerfConfig: SxPerformanceConfig;
  sxPerfDiag: SxPerformanceDiagnostics;
  onUpdateSettings: (next: AppSettings) => void;
  onSoundKeyPress: (code: string, isDown: boolean) => void;
  onTestMouseButton: (btn: string, isDown: boolean) => void;
  onApplyLighting: (preset: SxLightingPreset, active: boolean, streamHw: boolean) => void;
  onTogglePerfEnabled: (enabled: boolean) => void;
  onTriggerPerfBypass: () => void;
  onNavigateTab: (tab: string) => void;
}

export const SxmOverviewDashboard: React.FC<SxmOverviewDashboardProps> = ({
  devices,
  selectedDevice,
  hwState,
  mouseState = null,
  onSelectDevice,
  settings,
  soundpacks,
  audioDevices,
  stats,
  wpm,
  pressedKeys,
  pressedMouseButtons,
  lastKeyLabel,
  sxLightingStatus,
  lightingFrame,
  sxPerfConfig,
  sxPerfDiag,
  onUpdateSettings,
  onSoundKeyPress,
  onTestMouseButton,
  onApplyLighting,
  onTogglePerfEnabled,
  onTriggerPerfBypass,
  onNavigateTab,
}) => {
  const { t } = useI18n();

  const dailySeries = useMemo(() => {
    const entries = Object.entries(stats.daily || {})
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-10);
    if (entries.length === 0) {
      return [
        { date: '1', count: 120 },
        { date: '2', count: 340 },
        { date: '3', count: 290 },
        { date: '4', count: 520 },
        { date: '5', count: 440 },
        { date: '6', count: 610 },
        { date: '7', count: 480 },
      ];
    }
    return entries.map(([date, count]) => ({ date, count }));
  }, [stats.daily]);

  const sparkPath = useMemo(() => {
    const maxV = Math.max(...dailySeries.map((d) => d.count), 1);
    const w = 240;
    const h = 58;
    const pts = dailySeries.map((d, i) => {
      const x = dailySeries.length === 1 ? w : (i / (dailySeries.length - 1)) * w;
      const y = h - 6 - ((d.count / maxV) * (h - 14));
      return [x, y] as const;
    });
    const dLine = pts
      .map(([x, y], idx) => `${idx === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`)
      .join(' ');
    return { dLine, w, h };
  }, [dailySeries]);

  const activeKbPack = soundpacks.find((p) => p.id === settings.active_keyboard_pack);
  const activeMousePack = soundpacks.find((p) => p.id === settings.active_mouse_pack);

  // 7x16 dot-matrix intensity blocks inspired by the reference dashboard
  const dotColumns = useMemo(() => {
    const keys = Object.entries(stats.heatmap || {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, 14);
    const maxHit = Math.max(...keys.map((k) => k[1]), 1);
    return Array.from({ length: 14 }, (_, idx) => {
      const ratio = keys[idx] ? keys[idx][1] / maxHit : ((idx * 17) % 5) / 7;
      return Math.max(1, Math.min(6, Math.round(ratio * 6)));
    });
  }, [stats.heatmap]);

  const DeviceIcon =
    selectedDevice?.device_kind === 'mouse'
      ? Mouse
      : selectedDevice?.device_kind === 'headset' || selectedDevice?.device_kind === 'audio'
      ? Headphones
      : Keyboard;

  const isWritableKeyboard =
    selectedDevice?.device_kind === 'keyboard' &&
    Boolean(selectedDevice.capabilities.communication_supported);

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto pr-1">
      {/* Row 1: Hero Active Hardware Card (Left 8) + Live Activity Telemetry Card (Right 4) */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        {/* Left Hero Bento Card */}
        <div className="sxm-card-elevated flex flex-col justify-between gap-4 p-4 xl:col-span-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-black">
                <DeviceIcon className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold tracking-wider text-zinc-500 uppercase">
                    {t.overview.activeHardware}
                  </span>
                  {selectedDevice?.capabilities.communication_supported && (
                    <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
                      {t.overview.liveFnSync}
                    </span>
                  )}
                </div>
                <h2 className="text-base font-bold tracking-tight text-white">
                  {selectedDevice?.display_name || 'Standard Peripheral'}
                </h2>
              </div>
            </div>

            {/* Quick Peripheral Switcher Pills */}
            <div className="flex flex-wrap items-center gap-1.5">
              {devices.slice(0, 4).map((dev) => {
                const isSel = selectedDevice?.id === dev.id;
                const Ico =
                  dev.device_kind === 'mouse'
                    ? Mouse
                    : dev.device_kind === 'headset' || dev.device_kind === 'audio'
                    ? Headphones
                    : dev.device_kind === 'keyboard'
                    ? Keyboard
                    : Cpu;
                return (
                  <button
                    key={dev.id}
                    type="button"
                    onClick={() => onSelectDevice(dev.id)}
                    className={`flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold transition ${
                      isSel
                        ? 'bg-white text-black'
                        : 'border border-white/10 bg-white/[0.03] text-zinc-400 hover:border-white/25 hover:text-white'
                    }`}
                  >
                    <Ico className="h-3 w-3" />
                    <span className="max-w-[115px] truncate">{dev.model}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Device-Kind Specific Interactive Stage */}
          {isWritableKeyboard ? (
            <AulaF75BoardStage
              mode={sxLightingStatus.active ? 'rgb' : 'sound'}
              pressedKeys={pressedKeys}
              onSoundKeyPress={onSoundKeyPress}
              effectId={hwState?.effect_id ?? 3}
              brightness={hwState?.brightness ?? 8}
              speed={hwState?.speed ?? 3}
              colorIdx={hwState?.color_idx ?? 7}
              sideMode={hwState?.side_mode ?? 1}
              perKeyColors={hwState?.per_key_colors ?? []}
              liveFrame={sxLightingStatus.active ? lightingFrame?.matrix_rgb : null}
              liveSynced={Boolean(hwState?.raw_config_valid)}
              deviceTitle={selectedDevice?.display_name}
              badgeText={selectedDevice?.link.toUpperCase()}
              wpm={wpm}
              lastKeyLabel={lastKeyLabel}
              showSandbox={true}
            />
          ) : selectedDevice ? (
            <DeviceSpecificNoticeCard
              device={selectedDevice}
              mouseState={mouseState}
              settings={settings}
              soundpacks={soundpacks}
              audioDevices={audioDevices}
              pressedMouseButtons={pressedMouseButtons}
              onUpdateSettings={onUpdateSettings}
              onTestMouseButton={onTestMouseButton}
              onNavigateTab={onNavigateTab}
            />
          ) : (
            <div className="sxm-well flex h-48 items-center justify-center text-xs text-zinc-500">
              {t.sxb.noDevices}
            </div>
          )}
        </div>

        {/* Right Telemetry Bento Card (Sparkline + Dot-Matrix Cadence) */}
        <div className="flex flex-col gap-4 xl:col-span-4">
          <div className="sxm-card flex flex-1 flex-col justify-between p-5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold tracking-wider text-zinc-500 uppercase">
                {t.overview.liveActivity}
              </span>
              <button
                type="button"
                onClick={() => onNavigateTab('stats')}
                className="flex cursor-pointer items-center gap-1 rounded-full border border-white/10 px-2.5 py-1 text-[10px] font-semibold text-zinc-300 hover:border-white/30 hover:text-white"
              >
                {t.nav.stats}
                <ArrowUpRight className="h-3 w-3" />
              </button>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <div className="text-[11px] text-zinc-500">{t.stats.totalKeys}</div>
                <div className="mt-0.5 text-2xl font-bold tracking-tight text-white tabular-nums">
                  {stats.total_keystrokes.toLocaleString(t.locale)}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-zinc-500">WPM / {t.stats.peakSpeed}</div>
                <div className="mt-0.5 text-2xl font-bold tracking-tight text-white tabular-nums">
                  {wpm} <span className="text-sm font-medium text-zinc-500">/ {stats.peak_wpm}</span>
                </div>
              </div>
            </div>

            {/* Smooth Monochrome SVG Sparkline */}
            <div className="my-3 rounded-xl border border-white/6 bg-[#09090b] p-2.5">
              <svg
                viewBox={`0 0 ${sparkPath.w} ${sparkPath.h}`}
                className="h-14 w-full overflow-visible"
              >
                <path
                  d={sparkPath.dLine}
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>

            {/* Reference-style Monochrome Dot Matrix */}
            <div>
              <div className="mb-2 flex items-center justify-between text-[11px] text-zinc-500">
                <span>{t.overview.recentCadence}</span>
                <span className="font-mono text-white tabular-nums">
                  {stats.total_mouse_clicks.toLocaleString(t.locale)} {t.stats.mouseClicks}
                </span>
              </div>
              <div className="grid grid-cols-14 gap-1.5 rounded-xl border border-white/6 bg-[#09090b] p-3">
                {dotColumns.map((heightDots, colIdx) => (
                  <div key={colIdx} className="flex flex-col-reverse items-center gap-1">
                    {Array.from({ length: 6 }, (_, rowIdx) => {
                      const active = rowIdx < heightDots;
                      return (
                        <span
                          key={rowIdx}
                          className={`h-2 w-2 rounded-full transition-colors ${
                            active
                              ? rowIdx >= 4
                                ? 'bg-white'
                                : 'bg-zinc-400'
                              : 'bg-zinc-800/70'
                          }`}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Row 2: Three Modular Engine Bento Tiles */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* Tile 1: Acoustic Sound Engine */}
        <div className="sxm-card flex flex-col justify-between gap-3.5 p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {settings.enabled ? (
                <Volume2 className="h-4 w-4 text-white" />
              ) : (
                <VolumeX className="h-4 w-4 text-zinc-500" />
              )}
              <span className="text-xs font-bold tracking-tight text-white">
                {t.overview.soundTile}
              </span>
            </div>
            <button
              type="button"
              onClick={() => onUpdateSettings({ ...settings, enabled: !settings.enabled })}
              className={`cursor-pointer rounded-full px-3 py-1 text-[10px] font-bold transition ${
                settings.enabled
                  ? 'bg-white text-black'
                  : 'border border-white/15 bg-white/5 text-zinc-400'
              }`}
            >
              {settings.enabled ? t.onBadge : t.offBadge}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="sxm-well p-2.5">
              <div className="text-[10px] text-zinc-500 uppercase">{t.nav.keyboard}</div>
              <div className="mt-0.5 truncate text-xs font-semibold text-white">
                {activeKbPack?.name || '—'}
              </div>
            </div>
            <div className="sxm-well p-2.5">
              <div className="text-[10px] text-zinc-500 uppercase">{t.nav.mouse}</div>
              <div className="mt-0.5 truncate text-xs font-semibold text-white">
                {activeMousePack?.name || '—'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={1}
              step={0.02}
              value={settings.keyboard_volume}
              onChange={(e) =>
                onUpdateSettings({
                  ...settings,
                  keyboard_volume: parseFloat(e.target.value),
                })
              }
              className="sxm-slider flex-1"
            />
            <span className="w-9 text-right font-mono text-xs text-white tabular-nums">
              {Math.round(settings.keyboard_volume * 100)}%
            </span>
          </div>

          <div className="flex items-center justify-between gap-2 pt-1">
            <button
              type="button"
              onMouseDown={() => onSoundKeyPress('Space', true)}
              onMouseUp={() => onSoundKeyPress('Space', false)}
              className="cursor-pointer rounded-full border border-white/12 bg-white/5 px-3 py-1 text-[11px] font-semibold text-white hover:bg-white/12"
            >
              {t.overview.quickTestKey}
            </button>
            <button
              type="button"
              onClick={() => onNavigateTab('keyboard')}
              className="cursor-pointer text-[11px] font-semibold text-zinc-400 hover:text-white"
            >
              {t.nav.keyboard} →
            </button>
          </div>
        </div>

        {/* Tile 2: SxLighting Layer Compositor */}
        <div className="sxm-card flex flex-col justify-between gap-3.5 p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-white" />
              <span className="text-xs font-bold tracking-tight text-white">
                {t.overview.lightingTile}
              </span>
            </div>
            <button
              type="button"
              onClick={() =>
                onApplyLighting(
                  sxLightingStatus.active_preset,
                  !sxLightingStatus.active,
                  Boolean(selectedDevice?.capabilities.host_streaming)
                )
              }
              className={`cursor-pointer rounded-full px-3 py-1 text-[10px] font-bold transition ${
                sxLightingStatus.active
                  ? 'bg-white text-black'
                  : 'border border-white/15 bg-white/5 text-zinc-400'
              }`}
            >
              {sxLightingStatus.active ? t.onBadge : t.offBadge}
            </button>
          </div>

          <div className="sxm-well flex items-center justify-between p-3">
            <div>
              <div className="text-xs font-semibold text-white">
                {sxLightingStatus.active_preset.name}
              </div>
              <div className="text-[11px] text-zinc-500">
                {sxLightingStatus.active_preset.layers.filter((l) => l.enabled).length} layers •{' '}
                {sxLightingStatus.hardware_streaming
                  ? t.overview.streamingLive
                  : sxLightingStatus.active
                  ? t.overview.previewOnly
                  : t.overview.idle}
              </div>
            </div>
            <Sparkles className="h-4 w-4 text-zinc-400" />
          </div>

          {/* Mini Monochrome-framed RGB Bar Strip */}
          <div className="flex h-3 w-full overflow-hidden rounded-full border border-white/10 bg-black p-0.5">
            {(lightingFrame?.matrix_rgb?.slice(0, 16) ||
              Array.from({ length: 16 }, () => [255, 255, 255] as [number, number, number])).map(
              (c, i) => (
                <div
                  key={i}
                  className="h-full flex-1"
                  style={{
                    backgroundColor: sxLightingStatus.active
                      ? `rgb(${c[0]},${c[1]},${c[2]})`
                      : 'rgba(255,255,255,0.08)',
                  }}
                />
              )
            )}
          </div>

          <div className="flex items-center justify-between pt-1">
            <span className="font-mono text-[11px] text-zinc-500 tabular-nums">
              {sxLightingStatus.actual_fps.toFixed(1)} FPS • {sxLightingStatus.frames_sent} frm
            </span>
            <button
              type="button"
              onClick={() => onNavigateTab('rgb')}
              className="cursor-pointer rounded-full border border-white/12 px-3 py-1 text-[11px] font-semibold text-white hover:bg-white hover:text-black"
            >
              {t.overview.openStudio} →
            </button>
          </div>
        </div>

        {/* Tile 3: SxPerformance Opt-In Input Pipeline */}
        <div className="sxm-card flex flex-col justify-between gap-3.5 p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-white" />
              <span className="text-xs font-bold tracking-tight text-white">
                {t.overview.performanceTile}
              </span>
            </div>
            <button
              type="button"
              onClick={() => onTogglePerfEnabled(!sxPerfConfig.enabled)}
              className={`cursor-pointer rounded-full px-3 py-1 text-[10px] font-bold transition ${
                sxPerfConfig.enabled
                  ? 'bg-white text-black'
                  : 'border border-white/15 bg-white/5 text-zinc-400'
              }`}
            >
              {sxPerfConfig.enabled ? t.onBadge : t.overview.optInSafe}
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2 font-mono tabular-nums">
            <div className="sxm-well p-2.5">
              <div className="text-[10px] text-zinc-500">SOCD</div>
              <div className="mt-0.5 truncate text-xs font-bold text-white uppercase">
                {sxPerfConfig.socd_mode.replace('_', ' ')}
              </div>
            </div>
            <div className="sxm-well p-2.5">
              <div className="text-[10px] text-zinc-500">AVG</div>
              <div className="mt-0.5 text-xs font-bold text-white">
                {Math.round(sxPerfDiag.avg_proc_us)} µs
              </div>
            </div>
            <div className="sxm-well p-2.5">
              <div className="text-[10px] text-zinc-500">UINPUT</div>
              <div
                className={`mt-0.5 text-xs font-bold ${
                  sxPerfDiag.uinput_ready ? 'text-emerald-300' : 'text-amber-300'
                }`}
              >
                {sxPerfDiag.uinput_ready ? 'READY' : 'LOCKED'}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 pt-1">
            {sxPerfConfig.enabled ? (
              <button
                type="button"
                onClick={onTriggerPerfBypass}
                className="flex cursor-pointer items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-[11px] font-semibold text-amber-200 hover:bg-amber-400/20"
              >
                <ShieldAlert className="h-3.5 w-3.5" />
                Bypass
              </button>
            ) : (
              <span className="flex items-center gap-1.5 text-[11px] text-zinc-500">
                <Activity className="h-3.5 w-3.5" />
                {sxPerfDiag.events_processed} ev
              </span>
            )}
            <button
              type="button"
              onClick={() => onNavigateTab('performance')}
              className="cursor-pointer rounded-full border border-white/12 px-3 py-1 text-[11px] font-semibold text-white hover:bg-white hover:text-black"
            >
              {t.overview.openPanel} →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
