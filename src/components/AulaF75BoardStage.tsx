import React, { useEffect, useMemo, useRef, useState } from 'react';
import { KeymapEntryDto } from '../types';
import { useI18n } from '../i18n';
import { Keyboard, RotateCw, X } from 'lucide-react';

export interface F75VisualKey {
  matrixIndex: number;
  label: string;
  code: string;
  width: number;
  gapBefore?: number;
  isMod?: boolean;
  isAccent?: boolean;
  isKnob?: boolean;
}

const F75_VISUAL_ROWS: F75VisualKey[][] = [
  [
    { matrixIndex: 0, label: 'ESC', code: 'Escape', width: 1, isAccent: true },
    { matrixIndex: 12, label: 'F1', code: 'F1', width: 1, gapBefore: 0.75 },
    { matrixIndex: 18, label: 'F2', code: 'F2', width: 1 },
    { matrixIndex: 24, label: 'F3', code: 'F3', width: 1 },
    { matrixIndex: 30, label: 'F4', code: 'F4', width: 1 },
    { matrixIndex: 36, label: 'F5', code: 'F5', width: 1, gapBefore: 0.35, isMod: true },
    { matrixIndex: 42, label: 'F6', code: 'F6', width: 1, isMod: true },
    { matrixIndex: 48, label: 'F7', code: 'F7', width: 1, isMod: true },
    { matrixIndex: 54, label: 'F8', code: 'F8', width: 1, isMod: true },
    { matrixIndex: 60, label: 'F9', code: 'F9', width: 1, gapBefore: 0.35 },
    { matrixIndex: 66, label: 'F10', code: 'F10', width: 1 },
    { matrixIndex: 72, label: 'F11', code: 'F11', width: 1 },
    { matrixIndex: 78, label: 'F12', code: 'F12', width: 1 },
    { matrixIndex: 84, label: 'KNOB', code: 'Knob', width: 1.05, gapBefore: 0.35, isKnob: true },
  ],
  [
    { matrixIndex: 1, label: '`', code: 'Backquote', width: 1, isMod: true },
    { matrixIndex: 7, label: '1', code: 'Digit1', width: 1 },
    { matrixIndex: 13, label: '2', code: 'Digit2', width: 1 },
    { matrixIndex: 19, label: '3', code: 'Digit3', width: 1 },
    { matrixIndex: 25, label: '4', code: 'Digit4', width: 1 },
    { matrixIndex: 31, label: '5', code: 'Digit5', width: 1 },
    { matrixIndex: 37, label: '6', code: 'Digit6', width: 1 },
    { matrixIndex: 43, label: '7', code: 'Digit7', width: 1 },
    { matrixIndex: 49, label: '8', code: 'Digit8', width: 1 },
    { matrixIndex: 55, label: '9', code: 'Digit9', width: 1 },
    { matrixIndex: 61, label: '0', code: 'Digit0', width: 1 },
    { matrixIndex: 67, label: '-', code: 'Minus', width: 1 },
    { matrixIndex: 73, label: '=', code: 'Equal', width: 1 },
    { matrixIndex: 79, label: '⌫', code: 'Backspace', width: 2, isMod: true },
    { matrixIndex: 85, label: 'DEL', code: 'Delete', width: 1, gapBefore: 0.25, isMod: true },
  ],
  [
    { matrixIndex: 2, label: 'TAB', code: 'Tab', width: 1.5, isMod: true },
    { matrixIndex: 8, label: 'Q', code: 'KeyQ', width: 1 },
    { matrixIndex: 14, label: 'W', code: 'KeyW', width: 1 },
    { matrixIndex: 20, label: 'E', code: 'KeyE', width: 1 },
    { matrixIndex: 26, label: 'R', code: 'KeyR', width: 1 },
    { matrixIndex: 32, label: 'T', code: 'KeyT', width: 1 },
    { matrixIndex: 38, label: 'Y', code: 'KeyY', width: 1 },
    { matrixIndex: 44, label: 'U', code: 'KeyU', width: 1 },
    { matrixIndex: 50, label: 'I', code: 'KeyI', width: 1 },
    { matrixIndex: 56, label: 'O', code: 'KeyO', width: 1 },
    { matrixIndex: 62, label: 'P', code: 'KeyP', width: 1 },
    { matrixIndex: 68, label: '[', code: 'BracketLeft', width: 1 },
    { matrixIndex: 74, label: ']', code: 'BracketRight', width: 1 },
    { matrixIndex: 80, label: '\\', code: 'Backslash', width: 1.5, isMod: true },
    { matrixIndex: 86, label: 'PGUP', code: 'PageUp', width: 1, gapBefore: 0.25, isMod: true },
  ],
  [
    { matrixIndex: 3, label: 'CAPS', code: 'CapsLock', width: 1.75, isMod: true },
    { matrixIndex: 9, label: 'A', code: 'KeyA', width: 1 },
    { matrixIndex: 15, label: 'S', code: 'KeyS', width: 1 },
    { matrixIndex: 21, label: 'D', code: 'KeyD', width: 1 },
    { matrixIndex: 27, label: 'F', code: 'KeyF', width: 1 },
    { matrixIndex: 33, label: 'G', code: 'KeyG', width: 1 },
    { matrixIndex: 39, label: 'H', code: 'KeyH', width: 1 },
    { matrixIndex: 45, label: 'J', code: 'KeyJ', width: 1 },
    { matrixIndex: 51, label: 'K', code: 'KeyK', width: 1 },
    { matrixIndex: 57, label: 'L', code: 'KeyL', width: 1 },
    { matrixIndex: 63, label: ';', code: 'Semicolon', width: 1 },
    { matrixIndex: 69, label: "'", code: 'Quote', width: 1 },
    { matrixIndex: 81, label: 'ENTER', code: 'Enter', width: 2.25, isAccent: true },
    { matrixIndex: 87, label: 'PGDN', code: 'PageDown', width: 1, gapBefore: 0.25, isMod: true },
  ],
  [
    { matrixIndex: 4, label: 'SHIFT', code: 'ShiftLeft', width: 2.25, isMod: true },
    { matrixIndex: 10, label: 'Z', code: 'KeyZ', width: 1 },
    { matrixIndex: 16, label: 'X', code: 'KeyX', width: 1 },
    { matrixIndex: 22, label: 'C', code: 'KeyC', width: 1 },
    { matrixIndex: 28, label: 'V', code: 'KeyV', width: 1 },
    { matrixIndex: 34, label: 'B', code: 'KeyB', width: 1 },
    { matrixIndex: 40, label: 'N', code: 'KeyN', width: 1 },
    { matrixIndex: 46, label: 'M', code: 'KeyM', width: 1 },
    { matrixIndex: 52, label: ',', code: 'Comma', width: 1 },
    { matrixIndex: 58, label: '.', code: 'Period', width: 1 },
    { matrixIndex: 64, label: '/', code: 'Slash', width: 1 },
    { matrixIndex: 70, label: 'SHIFT', code: 'ShiftRight', width: 1.75, isMod: true },
    { matrixIndex: 82, label: '↑', code: 'ArrowUp', width: 1, gapBefore: 0.25, isMod: true },
    { matrixIndex: 88, label: 'END', code: 'End', width: 1, gapBefore: 0.25, isMod: true },
  ],
  [
    { matrixIndex: 5, label: 'CTRL', code: 'ControlLeft', width: 1.25, isMod: true },
    { matrixIndex: 11, label: 'WIN', code: 'MetaLeft', width: 1.25, isMod: true },
    { matrixIndex: 17, label: 'ALT', code: 'AltLeft', width: 1.25, isMod: true },
    { matrixIndex: 35, label: 'SXMCAPS', code: 'Space', width: 6.25, isAccent: true },
    { matrixIndex: 53, label: 'ALT', code: 'AltRight', width: 1, isMod: true },
    { matrixIndex: 59, label: 'FN', code: 'Fn', width: 1, isMod: true },
    { matrixIndex: 71, label: 'CTRL', code: 'ControlRight', width: 1, isMod: true },
    { matrixIndex: 77, label: '←', code: 'ArrowLeft', width: 1, gapBefore: 0.25, isMod: true },
    { matrixIndex: 83, label: '↓', code: 'ArrowDown', width: 1, isMod: true },
    { matrixIndex: 89, label: '→', code: 'ArrowRight', width: 1, isMod: true },
  ],
];

const PALETTE_RGB: [number, number, number][] = [
  [239, 68, 68],
  [34, 197, 94],
  [59, 130, 246],
  [234, 179, 8],
  [244, 244, 245],
  [6, 182, 212],
  [255, 255, 255],
  [228, 228, 231],
];

interface AulaF75BoardStageProps {
  mode?: 'sound' | 'remap' | 'rgb';
  pressedKeys: Set<string>;
  selectedMatrixIndex?: number | null;
  onSelectKey?: (key: F75VisualKey) => void;
  onSoundKeyPress?: (code: string, isDown: boolean) => void;
  effectId?: number;
  brightness?: number;
  speed?: number;
  colorIdx?: number;
  sideMode?: number;
  perKeyColors?: [number, number, number][];
  liveFrame?: [number, number, number][] | null;
  liveSynced?: boolean;
  reassignedEntries?: KeymapEntryDto[];
  onResetKey?: (matrixIndex: number) => void;
  deviceTitle?: string;
  badgeText?: string;
  wpm?: number;
  lastKeyLabel?: string | null;
  showSandbox?: boolean;
}

export const AulaF75BoardStage: React.FC<AulaF75BoardStageProps> = ({
  mode = 'sound',
  pressedKeys,
  selectedMatrixIndex = null,
  onSelectKey,
  onSoundKeyPress,
  effectId = 3,
  brightness = 8,
  speed = 3,
  colorIdx = 7,
  sideMode = 1,
  perKeyColors = [],
  liveFrame = null,
  liveSynced = false,
  reassignedEntries = [],
  onResetKey,
  deviceTitle = 'AULA F75',
  badgeText,
  wpm = 0,
  lastKeyLabel = null,
  showSandbox = false,
}) => {
  const { t } = useI18n();
  const [tick, setTick] = useState(0);
  const [sandboxText, setSandboxText] = useState('');
  const [promptIdx, setPromptIdx] = useState(0);
  const mouseDownCodeRef = useRef<string | null>(null);
  const paintingRef = useRef(false);

  const prompts = t.kb.prompts;
  const activePrompt = prompts[promptIdx % prompts.length];

  useEffect(() => {
    if (liveFrame && liveFrame.length > 0) return;
    if (effectId === 0 || effectId === 1 || effectId === 21) return;
    const intervalMs = Math.max(55, 130 - speed * 18);
    const id = setInterval(() => {
      setTick((n) => (n + 1) % 360);
    }, intervalMs);
    return () => clearInterval(id);
  }, [effectId, speed, liveFrame]);

  useEffect(() => {
    const stopPaint = () => {
      paintingRef.current = false;
    };
    window.addEventListener('mouseup', stopPaint);
    return () => window.removeEventListener('mouseup', stopPaint);
  }, []);

  const modifiedMap = useMemo(() => {
    const map = new Map<number, KeymapEntryDto>();
    for (const e of reassignedEntries) {
      map.set(e.matrix_index, e);
    }
    return map;
  }, [reassignedEntries]);

  const computeLedColor = (
    key: F75VisualKey,
    rIdx: number,
    cIdx: number
  ): [number, number, number] | null => {
    if (liveFrame && liveFrame.length > 0) {
      const px = liveFrame[key.matrixIndex];
      if (!px || (px[0] === 0 && px[1] === 0 && px[2] === 0)) return null;
      return px;
    }

    if (effectId === 0) return null;
    const bFactor = Math.max(0.15, brightness / 9);
    if (effectId === 21) {
      const rgb = perKeyColors[key.matrixIndex];
      if (!rgb || (rgb[0] === 0 && rgb[1] === 0 && rgb[2] === 0)) return null;
      return [
        Math.round(rgb[0] * bFactor),
        Math.round(rgb[1] * bFactor),
        Math.round(rgb[2] * bFactor),
      ];
    }

    if (
      effectId === 3 ||
      effectId === 6 ||
      effectId === 13 ||
      effectId === 15 ||
      effectId === 16 ||
      colorIdx === 7
    ) {
      const hue = (tick * 6 + cIdx * 24 + rIdx * 14) % 360;
      const rad = (hue * Math.PI) / 180;
      const r = Math.round((127 + 120 * Math.cos(rad)) * bFactor);
      const g = Math.round((127 + 120 * Math.cos(rad - (2 * Math.PI) / 3)) * bFactor);
      const b = Math.round((127 + 120 * Math.cos(rad + (2 * Math.PI) / 3)) * bFactor);
      return [r, g, b];
    }

    const base = PALETTE_RGB[colorIdx] ?? [244, 244, 245];
    const pulse =
      effectId === 2
        ? 0.35 + 0.65 * (0.5 + 0.5 * Math.sin((tick * 8 * Math.PI) / 180))
        : 1.0;
    return [
      Math.round(base[0] * bFactor * pulse),
      Math.round(base[1] * bFactor * pulse),
      Math.round(base[2] * bFactor * pulse),
    ];
  };

  const handlePointerDown = (key: F75VisualKey) => {
    mouseDownCodeRef.current = key.code;
    paintingRef.current = true;
    onSelectKey?.(key);
    if (mode === 'sound') {
      onSoundKeyPress?.(key.code, true);
    }
  };

  const handlePointerEnter = (key: F75VisualKey) => {
    if (mode === 'rgb' && paintingRef.current) {
      onSelectKey?.(key);
    }
  };

  const handlePointerUp = (key: F75VisualKey) => {
    if (mouseDownCodeRef.current === key.code) {
      mouseDownCodeRef.current = null;
      if (mode === 'sound') {
        onSoundKeyPress?.(key.code, false);
      }
    }
  };

  const handlePointerLeave = (key: F75VisualKey) => {
    if (mouseDownCodeRef.current === key.code) {
      mouseDownCodeRef.current = null;
      if (mode === 'sound') {
        onSoundKeyPress?.(key.code, false);
      }
    }
  };

  const callouts = reassignedEntries.slice(0, 4);

  return (
    <div className="sxb-stage-bg relative flex flex-col justify-between overflow-hidden rounded-2xl border border-white/10 p-4 shadow-[0_24px_60px_rgba(0,0,0,0.65)]">
      {/* Top Bezel Info + Live Telemetry */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5">
        <div className="flex items-center gap-2.5">
          <span className="h-2 w-2 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.65)]" />
          <span className="text-xs font-bold tracking-[0.14em] text-white uppercase">
            {deviceTitle}
          </span>
          {badgeText && (
            <span className="rounded-full border border-white/15 bg-white/8 px-2.5 py-0.5 text-[10px] font-semibold tracking-wider text-zinc-200 uppercase">
              {badgeText}
            </span>
          )}
          {liveSynced && (
            <span className="rounded-full border border-emerald-400/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
              {t.sxb.liveSyncedBadge}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2.5 text-xs text-zinc-400">
          {lastKeyLabel && (
            <span className="rounded-full border border-white/12 bg-black/50 px-2.5 py-0.5 font-mono text-[11px] text-white">
              {lastKeyLabel}
            </span>
          )}
          <span className="font-mono text-[11px] text-zinc-400 tabular-nums">
            <strong className="text-white">{wpm}</strong> WPM
          </span>
        </div>
      </div>

      {/* Reassigned Key Callout Pills */}
      {callouts.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center justify-center gap-2">
          {callouts.map((entry) => (
            <div
              key={entry.matrix_index}
              onClick={() => {
                const flat = F75_VISUAL_ROWS.flat();
                const found = flat.find((k) => k.matrixIndex === entry.matrix_index);
                if (found) onSelectKey?.(found);
              }}
              className="group flex cursor-pointer items-center gap-2.5 rounded-full border border-white/15 bg-[#121215] px-3 py-1 transition hover:border-white/35"
            >
              <div className="flex h-5 min-w-[22px] items-center justify-center rounded-full bg-white px-1.5 font-mono text-[10px] font-bold text-black">
                {entry.key_label}
              </div>
              <div className="flex items-center gap-1.5 text-[11px]">
                <span className="font-semibold text-white">{entry.assigned_label}</span>
                <span className="text-[9px] tracking-wider text-zinc-500 uppercase">
                  REMAP
                </span>
              </div>
              {onResetKey && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onResetKey(entry.matrix_index);
                  }}
                  className="rounded-full p-0.5 text-zinc-400 hover:bg-white/15 hover:text-white"
                  title={t.sxb.resetKey}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Physical AULA F75 75% Chassis */}
      <div className="relative mx-auto w-full max-w-[920px] rounded-2xl border border-white/10 bg-[#08080a] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_20px_50px_rgba(0,0,0,0.85)]">
        {/* Left Vertical Side LED Strip */}
        <div
          className={`absolute top-6 bottom-6 left-1.5 w-1 rounded-full transition-all duration-300 ${
            sideMode === 0
              ? 'bg-zinc-800/50'
              : sideMode === 2
              ? 'animate-pulse bg-white shadow-[0_0_10px_rgba(255,255,255,0.65)]'
              : 'bg-zinc-200 shadow-[0_0_12px_rgba(255,255,255,0.55)]'
          }`}
        />

        <div className="flex flex-col gap-1.5 pl-2">
          {F75_VISUAL_ROWS.map((row, rIdx) => (
            <div key={rIdx} className="flex w-full items-center gap-1">
              {row.map((key, cIdx) => {
                const isPressed = pressedKeys.has(key.code);
                const isSelected = selectedMatrixIndex === key.matrixIndex;
                const isModified = modifiedMap.has(key.matrixIndex);
                const ledColor = computeLedColor(key, rIdx, cIdx);
                const glowCss = ledColor
                  ? `rgb(${ledColor[0]}, ${ledColor[1]}, ${ledColor[2]})`
                  : undefined;

                if (key.isKnob) {
                  return (
                    <React.Fragment key={key.code}>
                      {key.gapBefore && (
                        <div style={{ flex: `${key.gapBefore} 0 0%` }} />
                      )}
                      <button
                        type="button"
                        onMouseDown={() => handlePointerDown(key)}
                        onMouseUp={() => handlePointerUp(key)}
                        onMouseLeave={() => handlePointerLeave(key)}
                        title="AULA F75 Rotary Knob"
                        style={{ flex: `${key.width} 1 0%` }}
                        className={`relative flex h-9 cursor-pointer items-center justify-center transition ${
                          isSelected ? 'scale-105' : ''
                        }`}
                      >
                        <div
                          className={`flex h-9 w-9 items-center justify-center rounded-full border-2 shadow-lg transition ${
                            isSelected
                              ? 'border-white bg-zinc-200 text-black shadow-[0_0_14px_rgba(255,255,255,0.55)]'
                              : 'border-zinc-600 bg-gradient-to-br from-zinc-700 via-zinc-900 to-black text-zinc-200 hover:border-white/70'
                          }`}
                        >
                          <RotateCw className="h-3.5 w-3.5" />
                        </div>
                      </button>
                    </React.Fragment>
                  );
                }

                let keyClasses = '';
                if (mode === 'rgb') {
                  keyClasses = 'bg-[#121216] text-zinc-100 border-white/15';
                } else if (key.isAccent) {
                  keyClasses = isPressed
                    ? 'bg-white text-black border-white'
                    : 'bg-[#1f1f24] text-white border-white/25';
                } else if (key.isMod) {
                  keyClasses = isPressed
                    ? 'bg-white text-black border-white'
                    : 'bg-[#141418] text-zinc-300 border-white/12';
                } else {
                  keyClasses = isPressed
                    ? 'bg-zinc-900 text-white border-white'
                    : 'bg-[#ededef] text-[#09090b] border-white/80';
                }

                return (
                  <React.Fragment key={key.code}>
                    {key.gapBefore && (
                      <div style={{ flex: `${key.gapBefore} 0 0%` }} />
                    )}
                    <button
                      type="button"
                      onMouseDown={() => handlePointerDown(key)}
                      onMouseEnter={() => handlePointerEnter(key)}
                      onMouseUp={() => handlePointerUp(key)}
                      onMouseLeave={() => handlePointerLeave(key)}
                      style={{
                        flex: `${key.width} 1 0%`,
                        boxShadow: isPressed
                          ? '0 1px 0 #050506, 0 0 14px rgba(255,255,255,0.65)'
                          : isSelected
                          ? '0 3px 0 #050506, 0 0 14px rgba(255, 255, 255, 0.55)'
                          : glowCss
                          ? `0 3px 0 #050506, 0 0 8px ${glowCss}44, inset 0 -2px 5px ${glowCss}55`
                          : '0 3px 0 #050506, 0 4px 8px rgba(0,0,0,0.65)',
                        borderColor: isSelected
                          ? '#ffffff'
                          : isModified
                          ? '#e4e4e7'
                          : glowCss && mode === 'rgb'
                          ? glowCss
                          : undefined,
                        backgroundColor:
                          mode === 'rgb' && glowCss && (liveFrame?.length || effectId !== 0)
                            ? `${glowCss}28`
                            : undefined,
                        transform: isPressed ? 'translateY(2px)' : 'translateY(0px)',
                      }}
                      className={`relative flex h-9 cursor-pointer items-center justify-center rounded-md border text-[10px] font-bold tracking-wide transition-all duration-75 select-none ${keyClasses}`}
                    >
                      {isModified && (
                        <span className="absolute top-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-white" />
                      )}
                      <span className="truncate px-1">
                        {key.code === 'Space' ? (
                          <span className="text-[9px] tracking-[0.26em] opacity-75">
                            {key.label}
                          </span>
                        ) : (
                          key.label
                        )}
                      </span>
                    </button>
                  </React.Fragment>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Optional Interactive Typing Sandbox */}
      {showSandbox && (
        <div className="mx-auto mt-3 flex w-full max-w-[920px] items-center gap-2.5 rounded-xl border border-white/10 bg-[#0b0b0d] px-3 py-1.5">
          <Keyboard className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
          <input
            type="text"
            value={sandboxText}
            onChange={(e) => setSandboxText(e.target.value)}
            placeholder={t.kb.placeholder(activePrompt)}
            className="w-full bg-transparent text-xs text-white placeholder-zinc-500 outline-none"
          />
          {sandboxText && (
            <button
              type="button"
              onClick={() => {
                setSandboxText('');
                setPromptIdx((i) => (i + 1) % prompts.length);
              }}
              className="shrink-0 cursor-pointer rounded-full border border-white/15 bg-white/10 px-2.5 py-0.5 text-[11px] text-white hover:bg-white/20"
            >
              {t.kb.clear}
            </button>
          )}
        </div>
      )}
    </div>
  );
};
