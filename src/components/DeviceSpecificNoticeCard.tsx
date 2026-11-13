import React from 'react';
import { AppSettings, HardwareDeviceInfo, SoundpackInfo } from '../types';
import { useI18n } from '../i18n';
import { Cpu, Headphones, Mouse, ShieldAlert, Sliders, Volume2 } from 'lucide-react';

interface DeviceSpecificNoticeCardProps {
  device: HardwareDeviceInfo;
  settings: AppSettings;
  soundpacks: SoundpackInfo[];
  audioDevices: string[];
  pressedMouseButtons: Set<string>;
  onUpdateSettings: (next: AppSettings) => void;
  onTestMouseButton: (btn: string, isDown: boolean) => void;
  onNavigateTab: (tab: string) => void;
}

export const DeviceSpecificNoticeCard: React.FC<DeviceSpecificNoticeCardProps> = ({
  device,
  settings,
  soundpacks,
  audioDevices,
  pressedMouseButtons,
  onUpdateSettings,
  onTestMouseButton,
  onNavigateTab,
}) => {
  const { t } = useI18n();
  const isMouse = device.device_kind === 'mouse';
  const isHeadset = device.device_kind === 'headset' || device.device_kind === 'audio';
  const mousePacks = soundpacks.filter((p) => p.device_type === 'mouse');

  const kindLabel =
    device.device_kind === 'keyboard'
      ? t.sxb.kindKeyboard
      : device.device_kind === 'mouse'
      ? t.sxb.kindMouse
      : device.device_kind === 'headset'
      ? t.sxb.kindHeadset
      : device.device_kind === 'audio'
      ? t.sxb.kindAudio
      : t.sxb.kindPeripheral;

  return (
    <div className="flex flex-col gap-3.5">
      {/* Honest Communication Protocol Notice */}
      {!device.capabilities.communication_supported && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-400/20 bg-amber-400/[0.04] p-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-amber-400/25 bg-amber-400/10 text-amber-300">
            <ShieldAlert className="h-4.5 w-4.5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold tracking-wide text-white">
                {t.sxb.commUnsupportedTitle}
              </span>
              <span className="rounded-full border border-white/12 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-zinc-300 uppercase">
                {kindLabel} • {device.vid_pid}
              </span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-zinc-400">
              {t.sxb.commUnsupportedBody(device.display_name, kindLabel)}
            </p>
            {device.notes && (
              <p className="mt-1.5 text-[11px] text-zinc-500">{device.notes}</p>
            )}
          </div>
        </div>
      )}

      {/* Mouse Dedicated Controls */}
      {isMouse && (
        <div className="sxm-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 pb-3.5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/12 bg-white text-black">
                <Mouse className="h-4.5 w-4.5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">{device.display_name}</h3>
                <p className="text-[11px] text-zinc-500">{t.mouse.subtitle}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('mouse')}
              className="cursor-pointer rounded-full border border-white/15 bg-white/8 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-white hover:text-black"
            >
              {t.mouse.packsTitle} →
            </button>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-12">
            {/* Interactive Mouse Silhouette Tester */}
            <div className="sxm-well flex flex-col items-center justify-center p-4 md:col-span-5">
              <div className="w-40 rounded-3xl border border-white/12 bg-[#141418] p-2.5">
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onMouseDown={() => onTestMouseButton('MouseLeft', true)}
                    onMouseUp={() => onTestMouseButton('MouseLeft', false)}
                    className={`h-16 cursor-pointer rounded-tl-2xl rounded-tr-sm border text-[11px] font-bold transition ${
                      pressedMouseButtons.has('MouseLeft')
                        ? 'border-white bg-white text-black'
                        : 'border-white/10 bg-[#1b1b20] text-zinc-300 hover:border-white/30'
                    }`}
                  >
                    {t.mouse.left}
                  </button>
                  <button
                    type="button"
                    onMouseDown={() => onTestMouseButton('MouseRight', true)}
                    onMouseUp={() => onTestMouseButton('MouseRight', false)}
                    className={`h-16 cursor-pointer rounded-tr-2xl rounded-tl-sm border text-[11px] font-bold transition ${
                      pressedMouseButtons.has('MouseRight')
                        ? 'border-white bg-white text-black'
                        : 'border-white/10 bg-[#1b1b20] text-zinc-300 hover:border-white/30'
                    }`}
                  >
                    {t.mouse.right}
                  </button>
                </div>
                <div className="mt-2 flex items-center justify-center gap-2">
                  <button
                    type="button"
                    onMouseDown={() => onTestMouseButton('MouseSide', true)}
                    onMouseUp={() => onTestMouseButton('MouseSide', false)}
                    className={`cursor-pointer rounded-full border px-3 py-1 text-[10px] font-semibold ${
                      pressedMouseButtons.has('MouseSide')
                        ? 'border-white bg-white text-black'
                        : 'border-white/10 bg-[#1b1b20] text-zinc-400 hover:text-white'
                    }`}
                  >
                    SIDE
                  </button>
                  <button
                    type="button"
                    onMouseDown={() => onTestMouseButton('MouseMiddle', true)}
                    onMouseUp={() => onTestMouseButton('MouseMiddle', false)}
                    className={`cursor-pointer rounded-full border px-3 py-1 text-[10px] font-semibold ${
                      pressedMouseButtons.has('MouseMiddle')
                        ? 'border-white bg-white text-black'
                        : 'border-white/10 bg-[#1b1b20] text-zinc-400 hover:text-white'
                    }`}
                  >
                    MID
                  </button>
                </div>
              </div>
              <span className="mt-2.5 text-[11px] text-zinc-500">{t.mouse.testHint}</span>
            </div>

            {/* Mouse Soundpack & Click Sound Controls */}
            <div className="flex flex-col justify-between gap-3 md:col-span-7">
              <div className="sxm-well flex items-center justify-between p-3.5">
                <div>
                  <div className="text-xs font-semibold text-white">{t.mouse.title}</div>
                  <div className="text-[11px] text-zinc-500">
                    {mousePacks.find((p) => p.id === settings.active_mouse_pack)?.name ||
                      settings.active_mouse_pack}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateSettings({ ...settings, mouse_enabled: !settings.mouse_enabled })
                  }
                  className={`cursor-pointer rounded-full px-3.5 py-1 text-[11px] font-bold transition ${
                    settings.mouse_enabled
                      ? 'bg-white text-black'
                      : 'border border-white/15 bg-white/5 text-zinc-400'
                  }`}
                >
                  {settings.mouse_enabled ? t.onBadge : t.offBadge}
                </button>
              </div>

              <div className="sxm-well p-3.5">
                <div className="mb-2 flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-zinc-300">
                    <Volume2 className="h-3.5 w-3.5" />
                    {t.mouse.volume}
                  </span>
                  <span className="font-mono text-white tabular-nums">
                    {Math.round(settings.mouse_volume * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.02}
                  value={settings.mouse_volume}
                  onChange={(e) =>
                    onUpdateSettings({
                      ...settings,
                      mouse_volume: parseFloat(e.target.value),
                    })
                  }
                  className="sxm-slider w-full"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Headset / Audio Dedicated Controls */}
      {isHeadset && (
        <div className="sxm-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 pb-3.5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/12 bg-white text-black">
                <Headphones className="h-4.5 w-4.5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">{device.display_name}</h3>
                <p className="text-[11px] text-zinc-500">{t.headset.title}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('audio')}
              className="cursor-pointer rounded-full border border-white/15 bg-white/8 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-white hover:text-black"
            >
              <Sliders className="mr-1 inline h-3 w-3" />
              {t.headset.quickDsp}
            </button>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3.5 md:grid-cols-2">
            <div className="sxm-well flex flex-col justify-between gap-2 p-3.5">
              <label className="text-[11px] font-semibold tracking-wider text-zinc-500 uppercase">
                {t.audio.outputDevice}
              </label>
              <select
                value={settings.audio_device || ''}
                onChange={(e) =>
                  onUpdateSettings({
                    ...settings,
                    audio_device: e.target.value || null,
                  })
                }
                className="w-full rounded-xl border border-white/12 bg-[#141418] px-3 py-2 text-xs text-white outline-none focus:border-white/40"
              >
                <option value="">{t.audio.systemDefault}</option>
                {audioDevices.map((dev) => (
                  <option key={dev} value={dev}>
                    {dev}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-zinc-500">{t.headset.defaultDeviceNote}</p>
            </div>

            <div className="sxm-well flex flex-col justify-between gap-2 p-3.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-zinc-200">{t.audio.eqTitle}</span>
                <span className="font-mono text-[11px] text-zinc-400 tabular-nums">
                  {settings.plate_preset.toUpperCase()}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 pt-1 text-center font-mono text-[11px] tabular-nums">
                <div className="rounded-lg border border-white/8 bg-black/40 py-2">
                  <div className="text-[10px] text-zinc-500">LOW</div>
                  <div className="font-bold text-white">{settings.eq_low_db.toFixed(1)} dB</div>
                </div>
                <div className="rounded-lg border border-white/8 bg-black/40 py-2">
                  <div className="text-[10px] text-zinc-500">MID</div>
                  <div className="font-bold text-white">{settings.eq_mid_db.toFixed(1)} dB</div>
                </div>
                <div className="rounded-lg border border-white/8 bg-black/40 py-2">
                  <div className="text-[10px] text-zinc-500">HIGH</div>
                  <div className="font-bold text-white">{settings.eq_high_db.toFixed(1)} dB</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Generic Unsupported Keyboard or Other Peripheral */}
      {!isMouse && !isHeadset && (
        <div className="sxm-card flex items-center gap-3.5 p-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/12 bg-white/5 text-zinc-300">
            <Cpu className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-bold text-white">{device.display_name}</div>
            <div className="text-xs text-zinc-500">{t.sxb.readOnlyNotice}</div>
          </div>
        </div>
      )}
    </div>
  );
};
