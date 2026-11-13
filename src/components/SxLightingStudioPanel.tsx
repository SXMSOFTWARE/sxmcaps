import React, { useEffect, useState } from 'react';
import {
  AnimationKind,
  DeviceHardwareState,
  HardwareDeviceInfo,
  LayerBlendMode,
  LightingPreviewFrame,
  SxLightingLayer,
  SxLightingPreset,
  SxLightingStatus,
  WaveDirection,
} from '../types';
import { useI18n } from '../i18n';
import { AulaF75BoardStage } from './AulaF75BoardStage';
import { SxBoardRgbPanel } from './SxBoardRgbPanel';
import {
  Download,
  Eye,
  EyeOff,
  FileUp,
  Layers,
  Play,
  Plus,
  Save,
  Square,
  Trash2,
} from 'lucide-react';

interface SxLightingStudioPanelProps {
  selectedDevice: HardwareDeviceInfo | null;
  hwState: DeviceHardwareState | null;
  pressedKeys: Set<string>;
  sxLightingStatus: SxLightingStatus;
  sxLightingPresets: SxLightingPreset[];
  lightingFrame: LightingPreviewFrame | null;
  busy: boolean;
  onApplyCompositor: (preset: SxLightingPreset, active: boolean, streamHw: boolean) => void;
  onStopCompositor: () => void;
  onSavePreset: (preset: SxLightingPreset) => void;
  onDeletePreset: (presetId: string) => void;
  onExportPreset: (preset: SxLightingPreset) => void;
  onImportPreset: () => void;
  // Firmware FX & Per-Key pass-through
  onSyncRead: () => Promise<void>;
  onApplyEffect: (effectId: number, brightness: number, speed: number, colorIdx: number) => Promise<void>;
  onApplyPerKey: (colors: [number, number, number][], brightness: number) => Promise<void>;
  onApplyFlags: (flags: {
    sideMode?: number;
    knobMode?: number;
    osMode?: number;
    winLock?: boolean;
    sleepSeconds?: number;
  }) => Promise<void>;
}

const ANIMATION_OPTIONS: { value: AnimationKind; label: string; group: string }[] = [
  { value: 'solid_color', label: 'Solid Color', group: 'Static' },
  { value: 'multi_color_gradient', label: 'Linear Gradient', group: 'Static' },
  { value: 'wasd_highlight', label: 'WASD Cluster', group: 'Static' },
  { value: 'rainbow_wave', label: 'Rainbow Wave', group: 'Dynamic' },
  { value: 'gradient_flow', label: 'Gradient Flow', group: 'Dynamic' },
  { value: 'color_cycle', label: 'Color Cycle', group: 'Dynamic' },
  { value: 'breathing', label: 'Breathing Pulse', group: 'Dynamic' },
  { value: 'spiral', label: 'Spiral Vortex', group: 'Dynamic' },
  { value: 'aurora', label: 'Aurora Veil', group: 'Dynamic' },
  { value: 'matrix_rain', label: 'Matrix Rain', group: 'Dynamic' },
  { value: 'circular_wave', label: 'Radial Wave', group: 'Dynamic' },
  { value: 'plasma', label: 'Plasma Field', group: 'Dynamic' },
  { value: 'fire', label: 'Ember Fire', group: 'Dynamic' },
  { value: 'meteor_trail', label: 'Meteor Trail', group: 'Dynamic' },
  { value: 'ripple', label: 'Key Ripple', group: 'Reactive' },
  { value: 'multi_key_ripple', label: 'Multi-Key Ripple', group: 'Reactive' },
  { value: 'key_press_flash', label: 'Key Press Flash', group: 'Reactive' },
  { value: 'key_release_flash', label: 'Key Release Flash', group: 'Reactive' },
  { value: 'typing_heatmap', label: 'Typing Heatmap', group: 'Reactive' },
  { value: 'reactive_gradient', label: 'Reactive Gradient', group: 'Reactive' },
  { value: 'audio_bass_pulse', label: 'Audio Bass Pulse', group: 'Audio' },
  { value: 'audio_spectrum', label: 'Audio Spectrum', group: 'Audio' },
  { value: 'audio_waveform', label: 'Audio Waveform', group: 'Audio' },
  { value: 'audio_beat_flash', label: 'Audio Beat Flash', group: 'Audio' },
];

const BLEND_MODES: LayerBlendMode[] = ['normal', 'additive', 'screen', 'maximum', 'multiply'];
const DIRECTIONS: WaveDirection[] = ['left_to_right', 'right_to_left', 'top_to_bottom', 'radial_out'];
const ZONES = ['all', 'alpha', 'mod', 'fn', 'nav', 'wasd'];

const SWATCHES: [number, number, number][][] = [
  [[255, 255, 255], [161, 161, 170]],
  [[239, 68, 68], [249, 115, 22]],
  [[59, 130, 246], [6, 182, 212]],
  [[16, 185, 129], [52, 211, 153]],
  [[234, 179, 8], [250, 204, 21]],
];

export const SxLightingStudioPanel: React.FC<SxLightingStudioPanelProps> = ({
  selectedDevice,
  hwState,
  pressedKeys,
  sxLightingStatus,
  sxLightingPresets,
  lightingFrame,
  busy,
  onApplyCompositor,
  onStopCompositor,
  onSavePreset,
  onDeletePreset,
  onExportPreset,
  onImportPreset,
  onSyncRead,
  onApplyEffect,
  onApplyPerKey,
  onApplyFlags,
}) => {
  const { t } = useI18n();
  const [subTab, setSubTab] = useState<'compositor' | 'firmware'>('compositor');
  const [draft, setDraft] = useState<SxLightingPreset>(sxLightingStatus.active_preset);
  const [streamHw, setStreamHw] = useState(
    Boolean(selectedDevice?.capabilities.host_streaming && sxLightingStatus.hardware_streaming)
  );
  const [selectedLayerId, setSelectedLayerId] = useState<string>(
    sxLightingStatus.active_preset.layers[0]?.id || ''
  );

  useEffect(() => {
    setDraft(sxLightingStatus.active_preset);
    if (sxLightingStatus.active_preset.layers.length > 0) {
      setSelectedLayerId((prev) =>
        sxLightingStatus.active_preset.layers.some((l) => l.id === prev)
          ? prev
          : sxLightingStatus.active_preset.layers[0].id
      );
    }
  }, [sxLightingStatus.active_preset]);

  const canStreamHw = Boolean(
    selectedDevice?.capabilities.host_streaming && selectedDevice.online && selectedDevice.permission_ok
  );

  const selectedLayer =
    draft.layers.find((l) => l.id === selectedLayerId) || draft.layers[0] || null;

  const pushDraft = (next: SxLightingPreset, forceActive?: boolean) => {
    setDraft(next);
    const shouldRun = forceActive !== undefined ? forceActive : sxLightingStatus.active;
    if (shouldRun) {
      onApplyCompositor(next, true, streamHw && canStreamHw);
    }
  };

  const updateLayer = (id: string, patch: Partial<SxLightingLayer>) => {
    const next: SxLightingPreset = {
      ...draft,
      layers: draft.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    };
    pushDraft(next);
  };

  const addLayer = () => {
    if (draft.layers.length >= 8) return;
    const newId = `layer-${Date.now().toString(36)}`;
    const layer: SxLightingLayer = {
      id: newId,
      name: `Layer ${draft.layers.length + 1}`,
      enabled: true,
      effect: 'ripple',
      palette: [[255, 255, 255], [161, 161, 170]],
      opacity: 0.85,
      speed: 1.0,
      scale: 1.0,
      blend_mode: 'additive',
      direction: 'left_to_right',
      zone_filter: 'all',
    };
    setSelectedLayerId(newId);
    pushDraft({ ...draft, layers: [...draft.layers, layer] });
  };

  const removeLayer = (id: string) => {
    if (draft.layers.length <= 1) return;
    const layers = draft.layers.filter((l) => l.id !== id);
    setSelectedLayerId(layers[0]?.id || '');
    pushDraft({ ...draft, layers });
  };

  return (
    <div className="flex h-full flex-col gap-3.5 overflow-hidden">
      {/* Mode Switcher Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 rounded-full border border-white/10 bg-[#0d0d10] p-1">
          <button
            type="button"
            onClick={() => setSubTab('compositor')}
            className={`cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
              subTab === 'compositor'
                ? 'bg-white text-black'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Layers className="mr-1.5 inline h-3.5 w-3.5" />
            {t.sxb.compositorTab}
          </button>
          <button
            type="button"
            onClick={() => setSubTab('firmware')}
            className={`cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
              subTab === 'firmware'
                ? 'bg-white text-black'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            {t.sxb.hwEffectsTab} & {t.sxb.perKeyTab}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-white/10 bg-[#111114] px-3 py-1 font-mono text-[11px] text-zinc-400 tabular-nums">
            {t.sxlighting.statsFps}: <strong className="text-white">{sxLightingStatus.actual_fps.toFixed(1)}</strong>
            {' · '}
            {t.sxlighting.statsSent}: <strong className="text-white">{sxLightingStatus.frames_sent}</strong>
            {' · '}
            {t.sxlighting.statsDedup}: <strong className="text-zinc-300">{sxLightingStatus.frames_deduped}</strong>
          </span>

          {sxLightingStatus.active ? (
            <button
              type="button"
              onClick={onStopCompositor}
              className="flex cursor-pointer items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-xs font-bold text-white hover:bg-white/20"
            >
              <Square className="h-3 w-3 fill-current" />
              {t.sxlighting.stopStream}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onApplyCompositor(draft, true, streamHw && canStreamHw)}
              className="flex cursor-pointer items-center gap-1.5 rounded-full bg-white px-4 py-1.5 text-xs font-bold text-black hover:bg-zinc-200"
            >
              <Play className="h-3 w-3 fill-current" />
              {t.sxlighting.startStream}
            </button>
          )}
        </div>
      </div>

      {subTab === 'firmware' ? (
        <div className="min-h-0 flex-1">
          <SxBoardRgbPanel
            device={selectedDevice}
            hwState={hwState}
            pressedKeys={pressedKeys}
            loading={busy}
            onRefreshState={onSyncRead}
            onApplyEffect={onApplyEffect}
            onApplyPerKey={onApplyPerKey}
            onApplyFlags={onApplyFlags}
          />
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3.5 lg:grid-cols-12">
          {/* Left Column: .sxl Preset Library & Global Stream Settings */}
          <div className="sxm-card flex flex-col justify-between gap-3 overflow-y-auto p-4 lg:col-span-4">
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold tracking-wider text-zinc-400 uppercase">
                  {t.sxlighting.presets}
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={onImportPreset}
                    className="cursor-pointer rounded-full border border-white/12 px-2.5 py-1 text-[11px] text-zinc-300 hover:border-white/30 hover:text-white"
                    title={t.sxlighting.importFile}
                  >
                    <FileUp className="inline h-3 w-3" /> .sxl
                  </button>
                  <button
                    type="button"
                    onClick={() => onExportPreset(draft)}
                    className="cursor-pointer rounded-full border border-white/12 px-2.5 py-1 text-[11px] text-zinc-300 hover:border-white/30 hover:text-white"
                    title={t.sxlighting.exportFile}
                  >
                    <Download className="inline h-3 w-3" />
                  </button>
                </div>
              </div>

              <div className="flex max-h-40 flex-col gap-1.5 overflow-y-auto pr-1">
                {sxLightingPresets.map((p) => {
                  const isSel = draft.id === p.id;
                  return (
                    <div
                      key={p.id}
                      onClick={() => pushDraft(p)}
                      className={`flex cursor-pointer items-center justify-between rounded-xl border px-3 py-2 transition ${
                        isSel
                          ? 'border-white bg-white text-black'
                          : 'border-white/8 bg-[#0b0b0d] text-zinc-200 hover:border-white/25'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="truncate text-xs font-bold">{p.name}</div>
                        <div
                          className={`truncate text-[10px] ${
                            isSel ? 'text-zinc-700' : 'text-zinc-500'
                          }`}
                        >
                          {p.layers.length} layers · {p.fps} FPS
                        </div>
                      </div>
                      {!p.id.startsWith('builtin-') && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeletePreset(p.id);
                          }}
                          className="rounded-full p-1 hover:bg-black/15"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Save Preset Name */}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  className="min-w-0 flex-1 rounded-xl border border-white/10 bg-[#0b0b0d] px-3 py-1.5 text-xs text-white outline-none focus:border-white/35"
                />
                <button
                  type="button"
                  onClick={() => onSavePreset(draft)}
                  className="flex cursor-pointer items-center gap-1 rounded-full bg-white px-3 py-1.5 text-[11px] font-bold text-black hover:bg-zinc-200"
                >
                  <Save className="h-3 w-3" />
                  {t.sxlighting.savePreset}
                </button>
              </div>
            </div>

            {/* Stream FPS, Safety Ceiling & Hardware Toggle */}
            <div className="sxm-well flex flex-col gap-3 p-3.5">
              <div>
                <div className="mb-1 flex justify-between text-[11px]">
                  <span className="text-zinc-400">{t.sxlighting.fpsLabel}</span>
                  <span className="font-mono text-white tabular-nums">{draft.fps} FPS</span>
                </div>
                <input
                  type="range"
                  min={15}
                  max={60}
                  step={5}
                  value={draft.fps}
                  onChange={(e) =>
                    pushDraft({ ...draft, fps: parseInt(e.target.value, 10) })
                  }
                  className="sxm-slider w-full"
                />
              </div>

              <div>
                <div className="mb-1 flex justify-between text-[11px]">
                  <span className="text-zinc-400">{t.sxlighting.maxBright}</span>
                  <span className="font-mono text-white tabular-nums">
                    {draft.max_brightness}%
                  </span>
                </div>
                <input
                  type="range"
                  min={10}
                  max={100}
                  step={5}
                  value={draft.max_brightness}
                  onChange={(e) =>
                    pushDraft({ ...draft, max_brightness: parseInt(e.target.value, 10) })
                  }
                  className="sxm-slider w-full"
                />
              </div>

              <div className="flex items-center justify-between border-t border-white/8 pt-2.5">
                <span className="text-xs font-medium text-zinc-200">
                  {t.sxlighting.hwStreamToggle}
                </span>
                <button
                  type="button"
                  disabled={!canStreamHw}
                  onClick={() => {
                    const nextHw = !streamHw;
                    setStreamHw(nextHw);
                    if (sxLightingStatus.active) {
                      onApplyCompositor(draft, true, nextHw && canStreamHw);
                    }
                  }}
                  className={`cursor-pointer rounded-full px-3 py-1 text-[10px] font-bold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                    streamHw && canStreamHw
                      ? 'bg-white text-black'
                      : 'border border-white/15 bg-white/5 text-zinc-400'
                  }`}
                >
                  {streamHw && canStreamHw ? t.onBadge : t.offBadge}
                </button>
              </div>
              {!canStreamHw && (
                <p className="text-[10px] leading-snug text-zinc-500">
                  {t.sxlighting.hwStreamUnavailable}
                </p>
              )}
            </div>
          </div>

          {/* Right Column: Live Topology Preview + Layer Stack Inspector */}
          <div className="flex flex-col gap-3.5 overflow-y-auto pr-1 lg:col-span-8">
            <AulaF75BoardStage
              mode="rgb"
              pressedKeys={pressedKeys}
              liveFrame={sxLightingStatus.active ? lightingFrame?.matrix_rgb : null}
              deviceTitle={selectedDevice?.display_name || 'SxLighting Topology Preview'}
              badgeText={sxLightingStatus.active ? 'SX-LIGHTING LIVE' : 'STANDBY'}
            />

            <div className="grid grid-cols-1 gap-3.5 xl:grid-cols-12">
              {/* Layer Stack List */}
              <div className="sxm-card flex flex-col gap-2.5 p-4 xl:col-span-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold tracking-wider text-zinc-400 uppercase">
                    {t.sxlighting.layersTitle} ({draft.layers.length}/8)
                  </span>
                  <button
                    type="button"
                    onClick={addLayer}
                    disabled={draft.layers.length >= 8}
                    className="flex cursor-pointer items-center gap-1 rounded-full border border-white/15 bg-white/8 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-white hover:text-black disabled:opacity-40"
                  >
                    <Plus className="h-3 w-3" />
                    {t.sxlighting.addLayer}
                  </button>
                </div>

                <div className="flex flex-col gap-1.5">
                  {draft.layers.map((layer) => {
                    const isSel = selectedLayer?.id === layer.id;
                    return (
                      <div
                        key={layer.id}
                        onClick={() => setSelectedLayerId(layer.id)}
                        className={`flex cursor-pointer items-center justify-between rounded-xl border px-3 py-2 transition ${
                          isSel
                            ? 'border-white bg-[#1a1a1f]'
                            : 'border-white/8 bg-[#0b0b0d] hover:border-white/20'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="truncate text-xs font-semibold text-white">
                            {layer.name}
                          </div>
                          <div className="text-[10px] text-zinc-500">
                            {layer.effect} · {layer.blend_mode}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              updateLayer(layer.id, { enabled: !layer.enabled });
                            }}
                            className="rounded-full p-1 text-zinc-400 hover:bg-white/10 hover:text-white"
                          >
                            {layer.enabled ? (
                              <Eye className="h-3.5 w-3.5 text-white" />
                            ) : (
                              <EyeOff className="h-3.5 w-3.5" />
                            )}
                          </button>
                          {draft.layers.length > 1 && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                removeLayer(layer.id);
                              }}
                              className="rounded-full p-1 text-zinc-500 hover:bg-white/10 hover:text-white"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Layer Inspector */}
              {selectedLayer && (
                <div className="sxm-card flex flex-col gap-3 p-4 xl:col-span-7">
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="mb-1 block text-[10px] font-semibold text-zinc-500 uppercase">
                        {t.sxlighting.effect}
                      </label>
                      <select
                        value={selectedLayer.effect}
                        onChange={(e) =>
                          updateLayer(selectedLayer.id, {
                            effect: e.target.value as AnimationKind,
                          })
                        }
                        className="w-full rounded-xl border border-white/10 bg-[#0b0b0d] px-2.5 py-1.5 text-xs text-white outline-none"
                      >
                        {ANIMATION_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            [{opt.group}] {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="mb-1 block text-[10px] font-semibold text-zinc-500 uppercase">
                        {t.sxlighting.blend}
                      </label>
                      <select
                        value={selectedLayer.blend_mode}
                        onChange={(e) =>
                          updateLayer(selectedLayer.id, {
                            blend_mode: e.target.value as LayerBlendMode,
                          })
                        }
                        className="w-full rounded-xl border border-white/10 bg-[#0b0b0d] px-2.5 py-1.5 text-xs text-white outline-none"
                      >
                        {BLEND_MODES.map((m) => (
                          <option key={m} value={m}>
                            {m.toUpperCase()}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="mb-1 block text-[10px] font-semibold text-zinc-500 uppercase">
                        {t.sxlighting.zone}
                      </label>
                      <select
                        value={selectedLayer.zone_filter}
                        onChange={(e) =>
                          updateLayer(selectedLayer.id, { zone_filter: e.target.value })
                        }
                        className="w-full rounded-xl border border-white/10 bg-[#0b0b0d] px-2.5 py-1.5 text-xs text-white outline-none"
                      >
                        {ZONES.map((z) => (
                          <option key={z} value={z}>
                            {z.toUpperCase()}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-semibold text-zinc-500 uppercase">
                        {t.sxlighting.direction}
                      </label>
                      <select
                        value={selectedLayer.direction}
                        onChange={(e) =>
                          updateLayer(selectedLayer.id, {
                            direction: e.target.value as WaveDirection,
                          })
                        }
                        className="w-full rounded-xl border border-white/10 bg-[#0b0b0d] px-2.5 py-1.5 text-xs text-white outline-none"
                      >
                        {DIRECTIONS.map((d) => (
                          <option key={d} value={d}>
                            {d.replace(/_/g, ' ').toUpperCase()}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Opacity / Speed / Scale */}
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <div className="mb-1 flex justify-between text-[10px] text-zinc-400">
                        <span>{t.sxlighting.opacity}</span>
                        <span className="font-mono text-white">
                          {Math.round(selectedLayer.opacity * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={selectedLayer.opacity}
                        onChange={(e) =>
                          updateLayer(selectedLayer.id, {
                            opacity: parseFloat(e.target.value),
                          })
                        }
                        className="sxm-slider w-full"
                      />
                    </div>
                    <div>
                      <div className="mb-1 flex justify-between text-[10px] text-zinc-400">
                        <span>{t.sxlighting.speed}</span>
                        <span className="font-mono text-white">
                          {selectedLayer.speed.toFixed(1)}x
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0.2}
                        max={4}
                        step={0.1}
                        value={selectedLayer.speed}
                        onChange={(e) =>
                          updateLayer(selectedLayer.id, {
                            speed: parseFloat(e.target.value),
                          })
                        }
                        className="sxm-slider w-full"
                      />
                    </div>
                    <div>
                      <div className="mb-1 flex justify-between text-[10px] text-zinc-400">
                        <span>{t.sxlighting.scale}</span>
                        <span className="font-mono text-white">
                          {selectedLayer.scale.toFixed(1)}
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0.3}
                        max={3}
                        step={0.1}
                        value={selectedLayer.scale}
                        onChange={(e) =>
                          updateLayer(selectedLayer.id, {
                            scale: parseFloat(e.target.value),
                          })
                        }
                        className="sxm-slider w-full"
                      />
                    </div>
                  </div>

                  {/* Layer Color Palette Swatches */}
                  <div>
                    <label className="mb-1.5 block text-[10px] font-semibold text-zinc-500 uppercase">
                      {t.sxlighting.palette}
                    </label>
                    <div className="flex flex-wrap items-center gap-2">
                      {SWATCHES.map((pal, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => updateLayer(selectedLayer.id, { palette: pal })}
                          className="flex h-7 w-12 cursor-pointer overflow-hidden rounded-full border border-white/20 transition hover:scale-105"
                        >
                          {pal.map((c, ci) => (
                            <span
                              key={ci}
                              className="h-full flex-1"
                              style={{ backgroundColor: `rgb(${c[0]},${c[1]},${c[2]})` }}
                            />
                          ))}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
