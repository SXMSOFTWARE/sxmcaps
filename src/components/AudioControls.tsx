import React from 'react';
import { AppSettings } from '../types';
import { Sliders, Speaker, Volume2, Waves } from 'lucide-react';

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
      {/* Card 1: Levels & Key-Up */}
      <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-[#0b0b0e] p-4">
        <div className="flex items-center gap-2 border-b border-white/[0.07] pb-2.5 text-xs font-semibold tracking-wider text-zinc-300 uppercase">
          <Volume2 className="h-3.5 w-3.5 text-white" />
          Ses Düzeyi & Key-Up
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
            desc="Tuşu bırakırken üst gövde dönüş sesi çalar"
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
      </div>

      {/* Card 2: Physics & Realism */}
      <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-[#0b0b0e] p-4">
        <div className="flex items-center gap-2 border-b border-white/[0.07] pb-2.5 text-xs font-semibold tracking-wider text-zinc-300 uppercase">
          <Waves className="h-3.5 w-3.5 text-white" />
          Akustik & Gerçekçilik
        </div>

        <div className="space-y-2 rounded-xl border border-white/[0.07] bg-[#060608] p-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-white">
              Ton Varyasyonu (Humanize)
            </span>
            <span className="font-mono text-xs text-white">
              ±{(settings.pitch_variation * 100).toFixed(1)}%
            </span>
          </div>
          <p className="text-[11px] text-zinc-500">
            Hızlı yazarken her vuruşa mikro perde farkı katarak robotikliği önler.
          </p>
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

        <div className="rounded-xl border border-white/[0.07] bg-[#060608] p-3">
          <ToggleRow
            label="Mekansal Stereo Pan"
            desc="Sol tuşlar sol kanalda, sağ tuşlar sağ kanalda duyulur"
            checked={settings.stereo_pan}
            onToggle={(v) => update({ stereo_pan: v })}
          />
        </div>
      </div>

      {/* Card 3: Output Device */}
      <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-[#0b0b0e] p-4">
        <div className="flex items-center gap-2 border-b border-white/[0.07] pb-2.5 text-xs font-semibold tracking-wider text-zinc-300 uppercase">
          <Speaker className="h-3.5 w-3.5 text-white" />
          Ses Çıkışı
        </div>

        <div className="space-y-2 rounded-xl border border-white/[0.07] bg-[#060608] p-3">
          <label className="flex items-center gap-1.5 text-xs font-medium text-white">
            <Sliders className="h-3.5 w-3.5 text-zinc-400" />
            Aktif Çıkış Cihazı
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
            <option value="">Varsayılan Sistem Çıkışı (PipeWire / ALSA)</option>
            {audioDevices.map((dev) => (
              <option key={dev} value={dev}>
                {dev}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-zinc-500">
            64 ses kanallı düşük gecikmeli CPAL mikseri ile doğrudan çıkışa gönderilir.
          </p>
        </div>
      </div>
    </div>
  );
};
