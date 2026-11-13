import React from 'react';
import { AppSettings } from '../types';
import { useI18n } from '../i18n';
import { Layers, Sliders, Speaker, Volume2, Waves } from 'lucide-react';

interface AudioControlsProps {
  settings: AppSettings;
  audioDevices: string[];
  onChange: (next: AppSettings) => void;
}

interface ToggleRowProps {
  label: string;
  desc: string;
  checked: boolean;
  onToggle: (val: boolean) => void;
}

const ToggleRow: React.FC<ToggleRowProps> = ({
  label,
  desc,
  checked,
  onToggle,
}) => (
  <div className="flex items-center justify-between gap-3 py-1">
    <div>
      <div className="text-xs font-medium text-white">{label}</div>
      <div className="text-[11px] text-zinc-500">{desc}</div>
    </div>
    <button
      type="button"
      onClick={() => onToggle(!checked)}
      className={`relative h-5 w-10 shrink-0 cursor-pointer rounded-full border transition ${
        checked ? 'border-purple-500 bg-purple-600 shadow-[0_0_10px_rgba(147,51,234,0.45)]' : 'border-purple-500/25 bg-[#1b152d]'
      }`}
    >
      <span
        className={`block h-3.5 w-3.5 rounded-full transition-transform ${
          checked
            ? 'translate-x-5 bg-white'
            : 'translate-x-0.5 bg-zinc-400'
        }`}
      />
    </button>
  </div>
);

const PLATE_IDS = ['neutral', 'aluminum', 'polycarbonate', 'brass'] as const;

export const AudioControls: React.FC<AudioControlsProps> = ({
  settings,
  audioDevices,
  onChange,
}) => {
  const { t } = useI18n();
  const update = (patch: Partial<AppSettings>) => {
    onChange({ ...settings, ...patch });
  };

  return (
    <div className="grid h-full grid-cols-1 gap-3.5 overflow-y-auto lg:grid-cols-3">
      {/* Card 1: Levels, Key-Up & Output */}
      <div className="flex flex-col gap-3 rounded-2xl border border-purple-500/20 bg-[#100d1a] p-4">
        <div className="flex items-center gap-2 border-b border-purple-500/15 pb-2.5 text-xs font-semibold tracking-wider text-zinc-300 uppercase">
          <Volume2 className="h-3.5 w-3.5 text-purple-400" />
          {t.audio.levelsTitle}
        </div>

        <div className="space-y-2 rounded-xl border border-purple-500/15 bg-[#0a0812] p-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-white">{t.audio.kbVol}</span>
            <span className="font-mono text-xs text-white">
              {Math.round(settings.keyboard_volume * 100)}%
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={1.5}
            step={0.01}
            value={settings.keyboard_volume}
            onChange={(e) =>
              update({ keyboard_volume: parseFloat(e.target.value) })
            }
            className="sxm-slider w-full"
          />
        </div>

        <div className="space-y-2 rounded-xl border border-purple-500/15 bg-[#0a0812] p-3">
          <ToggleRow
            label={t.audio.keyUpLabel}
            desc={t.audio.keyUpDesc}
            checked={settings.key_up_enabled}
            onToggle={(v) => update({ key_up_enabled: v })}
          />

          {settings.key_up_enabled && (
            <div className="mt-2 space-y-1.5 border-t border-purple-500/10 pt-2.5">
              <div className="flex items-center justify-between text-[11px] text-zinc-400">
                <span>{t.audio.keyUpVol}</span>
                <span className="font-mono text-white">
                  {Math.round(settings.key_up_volume * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0.1}
                max={1.2}
                step={0.02}
                value={settings.key_up_volume}
                onChange={(e) =>
                  update({ key_up_volume: parseFloat(e.target.value) })
                }
                className="sxm-slider w-full"
              />
            </div>
          )}
        </div>

        <div className="space-y-1.5 rounded-xl border border-purple-500/15 bg-[#0a0812] p-3">
          <label className="flex items-center gap-1.5 text-xs font-medium text-white">
            <Speaker className="h-3.5 w-3.5 text-zinc-400" />
            {t.audio.outputDevice}
          </label>
          <select
            value={settings.audio_device ?? ''}
            onChange={(e) =>
              update({
                audio_device: e.target.value === '' ? null : e.target.value,
              })
            }
            className="w-full cursor-pointer rounded-lg border border-purple-500/25 bg-[#161224] px-2.5 py-2 text-xs text-white outline-none focus:border-purple-400"
          >
            <option value="">{t.audio.systemDefault}</option>
            {audioDevices.map((dev) => (
              <option key={dev} value={dev}>
                {dev}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Card 2: Plate Simulation & Case Mods */}
      <div className="flex flex-col gap-3 rounded-2xl border border-purple-500/20 bg-[#100d1a] p-4">
        <div className="flex items-center gap-2 border-b border-purple-500/15 pb-2.5 text-xs font-semibold tracking-wider text-zinc-300 uppercase">
          <Layers className="h-3.5 w-3.5 text-purple-400" />
          {t.audio.plateTitle}
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          {PLATE_IDS.map((pid) => {
            const active = settings.plate_preset === pid;
            const plateMeta = t.audio.plates[pid];
            return (
              <button
                key={pid}
                type="button"
                onClick={() => update({ plate_preset: pid })}
                className={`cursor-pointer rounded-xl border p-2.5 text-left transition ${
                  active
                    ? 'border-purple-400 bg-purple-600 text-white shadow-[0_0_12px_rgba(147,51,234,0.35)]'
                    : 'border-purple-500/20 bg-[#0a0812] text-zinc-300 hover:border-purple-400/30'
                }`}
              >
                <div className="text-xs font-semibold">{plateMeta.label}</div>
                <div
                  className={`text-[10px] ${
                    active ? 'text-purple-200' : 'text-zinc-500'
                  }`}
                >
                  {plateMeta.desc}
                </div>
              </button>
            );
          })}
        </div>

        <div className="space-y-2 rounded-xl border border-purple-500/15 bg-[#0a0812] p-3">
          <ToggleRow
            label={t.audio.tapeLabel}
            desc={t.audio.tapeDesc}
            checked={settings.tape_mod}
            onToggle={(v) => update({ tape_mod: v })}
          />
          <div className="border-t border-purple-500/10 pt-2">
            <ToggleRow
              label={t.audio.foamLabel}
              desc={t.audio.foamDesc}
              checked={settings.poron_foam}
              onToggle={(v) => update({ poron_foam: v })}
            />
          </div>
        </div>
      </div>

      {/* Card 3: 3-Band EQ, Room Ambience & Humanization */}
      <div className="flex flex-col gap-3 rounded-2xl border border-purple-500/20 bg-[#100d1a] p-4">
        <div className="flex items-center justify-between border-b border-purple-500/15 pb-2.5">
          <div className="flex items-center gap-2 text-xs font-semibold tracking-wider text-zinc-300 uppercase">
            <Sliders className="h-3.5 w-3.5 text-purple-400" />
            {t.audio.eqTitle}
          </div>
          <button
            type="button"
            onClick={() =>
              update({
                eq_low_db: 0,
                eq_mid_db: 0,
                eq_high_db: 0,
                room_ambience: 0,
              })
            }
            className="cursor-pointer rounded border border-purple-500/25 px-2 py-0.5 text-[10px] text-zinc-400 hover:border-purple-400 hover:text-white"
          >
            {t.audio.reset}
          </button>
        </div>

        <div className="space-y-2.5 rounded-xl border border-purple-500/15 bg-[#0a0812] p-3">
          {[
            { key: 'eq_low_db' as const, label: t.audio.eqLow, val: settings.eq_low_db },
            { key: 'eq_mid_db' as const, label: t.audio.eqMid, val: settings.eq_mid_db },
            { key: 'eq_high_db' as const, label: t.audio.eqHigh, val: settings.eq_high_db },
          ].map((band) => (
            <div key={band.key} className="space-y-1">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-zinc-300">{band.label}</span>
                <span className="font-mono text-white">
                  {band.val > 0 ? `+${band.val.toFixed(1)}` : band.val.toFixed(1)} dB
                </span>
              </div>
              <input
                type="range"
                min={-9}
                max={9}
                step={0.5}
                value={band.val}
                onChange={(e) => update({ [band.key]: parseFloat(e.target.value) })}
                className="sxm-slider w-full"
              />
            </div>
          ))}
        </div>

        <div className="space-y-2 rounded-xl border border-purple-500/15 bg-[#0a0812] p-3">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-medium text-white">{t.audio.roomAmbience}</span>
            <span className="font-mono text-white">
              {Math.round(settings.room_ambience * 100)}%
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.02}
            value={settings.room_ambience}
            onChange={(e) =>
              update({ room_ambience: parseFloat(e.target.value) })
            }
            className="sxm-slider w-full"
          />

          <div className="border-t border-purple-500/10 pt-2">
            <div className="mb-1 flex items-center justify-between text-[11px]">
              <span className="flex items-center gap-1 text-zinc-300">
                <Waves className="h-3 w-3" />
                {t.audio.pitchVar}
              </span>
              <span className="font-mono text-white">
                ±{(settings.pitch_variation * 100).toFixed(1)}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={0.12}
              step={0.005}
              value={settings.pitch_variation}
              onChange={(e) =>
                update({ pitch_variation: parseFloat(e.target.value) })
              }
              className="sxm-slider w-full"
            />
          </div>

          <div className="border-t border-purple-500/10 pt-1">
            <ToggleRow
              label={t.audio.stereoPan}
              desc={t.audio.stereoPanDesc}
              checked={settings.stereo_pan}
              onToggle={(v) => update({ stereo_pan: v })}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
