import React from 'react';
import { AppSettings, SoundpackInfo } from '../types';
import { useI18n } from '../i18n';
import { Check, Download, Mouse, Play, Trash2, Volume2 } from 'lucide-react';

interface MouseSectionProps {
  settings: AppSettings;
  soundpacks: SoundpackInfo[];
  pressedMouseButtons: Set<string>;
  onUpdateSettings: (next: AppSettings) => void;
  onSelectMousePack: (id: string) => void;
  onTestMouseButton: (button: string, isDown: boolean) => void;
  onDeleteCustom: (id: string) => void;
  onExportZip: (id: string) => void;
}

export const MouseSection: React.FC<MouseSectionProps> = ({
  settings,
  soundpacks,
  pressedMouseButtons,
  onUpdateSettings,
  onSelectMousePack,
  onTestMouseButton,
  onDeleteCustom,
  onExportZip,
}) => {
  const { t } = useI18n();
  const mousePacks = soundpacks.filter((p) => p.device_type === 'mouse');

  const leftDown = pressedMouseButtons.has('MouseLeft');
  const rightDown = pressedMouseButtons.has('MouseRight');
  const midDown = pressedMouseButtons.has('MouseMiddle');
  const sideDown =
    pressedMouseButtons.has('MouseSide') ||
    pressedMouseButtons.has('MouseExtra');

  return (
    <div className="grid h-full grid-cols-1 gap-3.5 overflow-y-auto lg:grid-cols-12">
      {/* Left: Interactive Mouse Tester + Volume */}
      <div className="flex flex-col justify-between gap-3 rounded-2xl border border-purple-500/20 bg-[#100d1a] p-4 lg:col-span-5">
        <div className="flex items-center justify-between border-b border-purple-500/15 pb-3">
          <div className="flex items-center gap-2">
            <Mouse className="h-4 w-4 text-purple-400" />
            <div>
              <div className="text-xs font-semibold text-white">
                {t.mouse.title}
              </div>
              <div className="text-[11px] text-zinc-500">
                {t.mouse.subtitle}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() =>
              onUpdateSettings({
                ...settings,
                mouse_enabled: !settings.mouse_enabled,
              })
            }
            className={`relative h-5 w-10 shrink-0 cursor-pointer rounded-full border transition ${
              settings.mouse_enabled
                ? 'border-purple-500 bg-purple-600 shadow-[0_0_10px_rgba(147,51,234,0.45)]'
                : 'border-purple-500/25 bg-[#1b152d]'
            }`}
          >
            <span
              className={`block h-3.5 w-3.5 rounded-full transition-transform ${
                settings.mouse_enabled
                  ? 'translate-x-5 bg-white'
                  : 'translate-x-0.5 bg-zinc-400'
              }`}
            />
          </button>
        </div>

        {/* Interactive Minimalist Monochrome Mouse Diagram */}
        <div className="flex flex-1 flex-col items-center justify-center py-2">
          <div className="relative flex h-44 w-28 flex-col overflow-hidden rounded-[44px] border-2 border-purple-500/30 bg-[#161224] shadow-2xl">
            {/* Top half: Left / Middle / Right */}
            <div className="grid h-22 grid-cols-2 border-b border-purple-500/25">
              <button
                type="button"
                onMouseDown={() => onTestMouseButton('MouseLeft', true)}
                onMouseUp={() => onTestMouseButton('MouseLeft', false)}
                onMouseLeave={() =>
                  leftDown && onTestMouseButton('MouseLeft', false)
                }
                className={`flex cursor-pointer items-center justify-center border-r border-purple-500/25 text-[10px] font-semibold tracking-wider uppercase transition ${
                  leftDown
                    ? 'bg-purple-600 text-white'
                    : 'bg-[#181328] text-zinc-400 hover:bg-purple-500/20 hover:text-white'
                }`}
              >
                {t.mouse.left}
              </button>
              <button
                type="button"
                onMouseDown={() => onTestMouseButton('MouseRight', true)}
                onMouseUp={() => onTestMouseButton('MouseRight', false)}
                onMouseLeave={() =>
                  rightDown && onTestMouseButton('MouseRight', false)
                }
                className={`flex cursor-pointer items-center justify-center text-[10px] font-semibold tracking-wider uppercase transition ${
                  rightDown
                    ? 'bg-purple-600 text-white'
                    : 'bg-[#181328] text-zinc-400 hover:bg-purple-500/20 hover:text-white'
                }`}
              >
                {t.mouse.right}
              </button>
            </div>

            {/* Scroll / Middle button floating */}
            <button
              type="button"
              onMouseDown={() => onTestMouseButton('MouseMiddle', true)}
              onMouseUp={() => onTestMouseButton('MouseMiddle', false)}
              onMouseLeave={() =>
                midDown && onTestMouseButton('MouseMiddle', false)
              }
              title={t.mouse.midTitle}
              className={`absolute top-7 left-1/2 h-9 w-4 -translate-x-1/2 cursor-pointer rounded-full border transition ${
                midDown
                  ? 'border-purple-300 bg-purple-500 shadow-[0_0_12px_rgba(168,85,247,0.8)]'
                  : 'border-purple-400/40 bg-[#0a0812] hover:border-purple-400'
              }`}
            />

            {/* Side thumb button indicator */}
            <button
              type="button"
              onMouseDown={() => onTestMouseButton('MouseSide', true)}
              onMouseUp={() => onTestMouseButton('MouseSide', false)}
              title={t.mouse.sideTitle}
              className={`absolute top-24 -left-0.5 h-8 w-2 cursor-pointer rounded-r border border-l-0 transition ${
                sideDown
                  ? 'border-purple-500 bg-purple-600 shadow-[0_0_10px_rgba(147,51,234,0.45)]'
                  : 'border-purple-400/40 bg-zinc-700 hover:bg-purple-500'
              }`}
            />

            {/* Lower Palm Rest */}
            <div className="flex flex-1 items-center justify-center bg-[#0b0814]">
              <span className="font-mono text-[9px] tracking-[0.2em] text-zinc-600 uppercase">
                SXM MOUSE
              </span>
            </div>
          </div>

          <p className="mt-2.5 text-[11px] text-zinc-500">
            {t.mouse.testHint}
          </p>
        </div>

        {/* Mouse Volume Slider */}
        <div className="space-y-2 rounded-xl border border-purple-500/15 bg-[#0a0812] p-3">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 font-medium text-zinc-200">
              <Volume2 className="h-3.5 w-3.5 text-purple-400" />
              {t.mouse.volume}
            </span>
            <span className="font-mono text-xs text-white">
              {Math.round(settings.mouse_volume * 100)}%
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={1.5}
            step={0.01}
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

      {/* Right: Mouse Soundpacks */}
      <div className="flex flex-col gap-3 rounded-2xl border border-purple-500/20 bg-[#100d1a] p-4 lg:col-span-7">
        <div className="text-xs font-semibold tracking-wider text-zinc-300 uppercase">
          {t.mouse.packsTitle} ({mousePacks.length})
        </div>

        <div className="grid grid-cols-1 gap-2.5 overflow-y-auto pr-1 sm:grid-cols-2">
          {mousePacks.map((pack) => {
            const isActive = pack.id === settings.active_mouse_pack;
            return (
              <div
                key={pack.id}
                onClick={() => onSelectMousePack(pack.id)}
                className={`flex cursor-pointer flex-col justify-between rounded-xl border p-4 transition ${
                  isActive
                    ? 'border-purple-400 bg-purple-500/15 shadow-[0_0_20px_rgba(147,51,234,0.22)]'
                    : 'border-purple-500/20 bg-[#151123] hover:border-purple-400/30'
                }`}
              >
                <div>
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                          isActive
                            ? 'border-purple-400 bg-purple-600 text-white shadow-[0_0_12px_rgba(147,51,234,0.35)]'
                            : 'border-purple-500/30 bg-[#090710]/80'
                        }`}
                      >
                        {isActive && <Check className="h-3 w-3 stroke-[3]" />}
                      </span>
                      <span className="text-sm font-semibold text-white">
                        {pack.name}
                      </span>
                    </div>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${
                        isActive
                          ? 'bg-purple-600 text-white'
                          : 'border border-purple-500/25 text-zinc-400'
                      }`}
                    >
                      {pack.tag}
                    </span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-zinc-400">
                    {pack.description}
                  </p>
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-purple-500/10 pt-2.5">
                  <span className="text-[10px] text-zinc-500">
                    {pack.is_builtin ? t.packs.builtin : t.mouse.installed}
                  </span>

                  <div className="flex items-center gap-1">
                    {!pack.is_builtin && (
                      <>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onExportZip(pack.id);
                          }}
                          title={t.packs.exportZipTitle}
                          className="cursor-pointer rounded p-1 text-zinc-400 transition hover:bg-purple-500/20 hover:text-white"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteCustom(pack.id);
                          }}
                          title={t.packs.deleteTitle}
                          className="cursor-pointer rounded p-1 text-zinc-500 transition hover:bg-purple-500/20 hover:text-white"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectMousePack(pack.id);
                        setTimeout(() => {
                          onTestMouseButton('MouseLeft', true);
                          setTimeout(
                            () => onTestMouseButton('MouseLeft', false),
                            65
                          );
                        }, 40);
                      }}
                      className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-purple-500/25 bg-purple-500/15 px-2.5 py-1 text-[11px] font-medium text-white hover:border-purple-400 hover:bg-purple-600 hover:text-white"
                    >
                      <Play className="h-3 w-3 fill-current" />
                      {t.mouse.clickTest}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
