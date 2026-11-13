import React from 'react';
import { AppSettings } from '../types';
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
        checked ? 'border-white bg-white' : 'border-white/20 bg-[#18181d]'
      }`}
    >
      <span
        className={`block h-3.5 w-3.5 rounded-full transition-transform ${
          checked
            ? 'translate-x-5 bg-black'
            : 'translate-x-0.5 bg-zinc-400'
        }`}
      />
    </button>
  </div>
);

const PLATES = [
  { id: 'neutral', label: 'Nötr', desc: 'Ham switch karakteri' },
  { id: 'aluminum', label: 'Alüminyum', desc: 'Net & dengeli clack' },
  { id: 'polycarbonate', label: 'Polikarbonat', desc: 'Sıcak & tok thock' },
  { id: 'brass', label: 'Pirinç', desc: 'Parlak & keskin tepki' },
] as const;

export const AudioControls: React.FC<AudioControlsProps> = ({
  settings,
  audioDevices,
  onChange,
}) => {
  const update = (patch: Partial<AppSettings>) => {
    onChange({ ...settings, ...patch });
  };

  return (
    <div className="grid h-full grid-cols-1 gap-3.5 overflow-y-auto lg:grid-cols-3">
      {/* Card 1: Levels, Key-Up & Output */}
      <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-[#0b0b0e] p-4">
        <div className="flex items-center gap-2 border-b border-white/[0.07] pb-2.5 text-xs font-semibold tracking-wider text-zinc-300 uppercase">
          <Volume2 className="h-3.5 w-3.5 text-white" />
          Ses Düzeyi & Çıkış
        </div>

        <div className="space-y-2 rounded-xl border border-white/[0.07] bg-[#060608] p-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-white">Klavye Ses Seviyesi</span>
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

        <div className="space-y-2 rounded-xl border border-white/[0.07] bg-[#060608] p-3">
          <ToggleRow
            label="Tuş Bırakma (Key-Up)"
            desc="Tuş dönüşünde üst gövde sesi çalar"
            checked={settings.key_up_enabled}
            onToggle={(v) => update({ key_up_enabled: v })}
          />

          {settings.key_up_enabled && (
            <div className="mt-2 space-y-1.5 border-t border-white/[0.06] pt-2.5">
              <div className="flex items-center justify-between text-[11px] text-zinc-400">
                <span>Key-Up Şiddeti</span>
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

        <div className="space-y-1.5 rounded-xl border border-white/[0.07] bg-[#060608] p-3">
          <label className="flex items-center gap-1.5 text-xs font-medium text-white">
            <Speaker className="h-3.5 w-3.5 text-zinc-400" />
            Ses Çıkış Cihazı
          </label>
          <select
            value={settings.audio_device ?? ''}
            onChange={(e) =>
              update({
                audio_device: e.target.value === '' ? null : e.target.value,
              })
            }
            className="w-full cursor-pointer rounded-lg border border-white/15 bg-[#121216] px-2.5 py-2 text-xs text-white outline-none focus:border-white"
          >
            <option value="">Varsayılan Sistem Çıkışı (PipeWire / WASAPI)</option>
            {audioDevices.map((dev) => (
              <option key={dev} value={dev}>
                {dev}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Card 2: Plate Simulation & Case Mods */}
      <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-[#0b0b0e] p-4">
        <div className="flex items-center gap-2 border-b border-white/[0.07] pb-2.5 text-xs font-semibold tracking-wider text-zinc-300 uppercase">
          <Layers className="h-3.5 w-3.5 text-white" />
          Plaka & Kasa Modları (DSP)
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          {PLATES.map((p) => {
            const active = settings.plate_preset === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => update({ plate_preset: p.id })}
                className={`cursor-pointer rounded-xl border p-2.5 text-left transition ${
                  active
                    ? 'border-white bg-white text-black'
                    : 'border-white/10 bg-[#060608] text-zinc-300 hover:border-white/30'
                }`}
              >
                <div className="text-xs font-semibold">{p.label}</div>
                <div
                  className={`text-[10px] ${
                    active ? 'text-black/70' : 'text-zinc-500'
                  }`}
                >
                  {p.desc}
                </div>
              </button>
            );
          })}
        </div>

        <div className="space-y-2 rounded-xl border border-white/[0.07] bg-[#060608] p-3">
          <ToggleRow
            label="Tempest Tape Mod"
            desc="Alt gövdeyi sıcaklaştırır ve yüksek tiz sertliğini yumuşatır"
            checked={settings.tape_mod}
            onToggle={(v) => update({ tape_mod: v })}
          />
          <div className="border-t border-white/[0.06] pt-2">
            <ToggleRow
              label="Poron Kasa Süngeri"
              desc="Kasa içi boşluk çınlamasını azaltıp tok akustik sağlar"
              checked={settings.poron_foam}
              onToggle={(v) => update({ poron_foam: v })}
            />
          </div>
        </div>
      </div>

      {/* Card 3: 3-Band EQ, Room Ambience & Humanization */}
      <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-[#0b0b0e] p-4">
        <div className="flex items-center justify-between border-b border-white/[0.07] pb-2.5">
          <div className="flex items-center gap-2 text-xs font-semibold tracking-wider text-zinc-300 uppercase">
            <Sliders className="h-3.5 w-3.5 text-white" />
            3-Bant EQ & Yankı
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
            className="cursor-pointer rounded border border-white/15 px-2 py-0.5 text-[10px] text-zinc-400 hover:border-white hover:text-white"
          >
            Sıfırla
          </button>
        </div>

        <div className="space-y-2.5 rounded-xl border border-white/[0.07] bg-[#060608] p-3">
          {[
            { key: 'eq_low_db' as const, label: 'Bas (Thock • 210Hz)', val: settings.eq_low_db },
            { key: 'eq_mid_db' as const, label: 'Orta (Body • 1.1kHz)', val: settings.eq_mid_db },
            { key: 'eq_high_db' as const, label: 'Tiz (Clack • 3.4kHz)', val: settings.eq_high_db },
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

        <div className="space-y-2 rounded-xl border border-white/[0.07] bg-[#060608] p-3">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-medium text-white">Masa / Oda Yankısı</span>
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

          <div className="border-t border-white/[0.06] pt-2">
            <div className="mb-1 flex items-center justify-between text-[11px]">
              <span className="flex items-center gap-1 text-zinc-300">
                <Waves className="h-3 w-3" />
                Ton Varyasyonu
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

          <div className="border-t border-white/[0.06] pt-1">
            <ToggleRow
              label="Mekansal Stereo Pan"
              desc="Sol ve sağ tuşlara göre stereo konum"
              checked={settings.stereo_pan}
              onToggle={(v) => update({ stereo_pan: v })}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
