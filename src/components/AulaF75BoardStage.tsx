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
    { matrixIndex: 35, label: 'SXBOARDS', code: 'Space', width: 6.25, isAccent: true },
    { matrixIndex: 53, label: 'ALT', code: 'AltRight', width: 1, isMod: true },
    { matrixIndex: 59, label: 'FN', code: 'Fn', width: 1, isMod: true },
    { matrixIndex: 71, label: 'CTRL', code: 'ControlRight', width: 1, isMod: true },
    { matrixIndex: 77, label: '←', code: 'ArrowLeft', width: 1, gapBefore: 0.25, isMod: true },
    { matrixIndex: 83, label: '↓', code: 'ArrowDown', width: 1, isMod: true },
    { matrixIndex: 89, label: '→', code: 'ArrowRight', width: 1, isMod: true },
  ],
];

const PALETTE_RGB: [number, number, number][] = [
  [239, 68, 68],   // Red
  [34, 197, 94],   // Green
  [59, 130, 246],  // Blue
  [234, 179, 8],   // Yellow
  [168, 85, 247],  // Violet / Purple
  [6, 182, 212],   // Cyan
  [244, 241, 255], // White
  [168, 85, 247],  // Multicolor fallback
];

interface AulaF75BoardStageProps {
  mode?: 'sound' | 'remap' | 'rgb';
  pressedKeys: Set<string>;
  selectedMatrixIndex?: number | null;
  onSelectKey?: (key: F75VisualKey) => void;
  onSoundKeyPress?: (code: string, isDown: boolean) => void;
  // Hardware visual state
  effectId?: number;
  brightness?: number; // 0..9
  speed?: number; // 0..4
  colorIdx?: number; // 0..7
  sideMode?: number; // 0..3
  perKeyColors?: [number, number, number][];
  // Remap callouts
  reassignedEntries?: KeymapEntryDto[];
  onResetKey?: (matrixIndex: number) => void;
  // Header labels
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

  // Lightweight live RGB animation clock when in RGB or active effect preview
  useEffect(() => {
    if (effectId === 0 || effectId === 1 || effectId === 21) return;
    const intervalMs = Math.max(55, 130 - speed * 18);
    const id = setInterval(() => {
      setTick((n) => (n + 1) % 360);
    }, intervalMs);
    return () => clearInterval(id);
  }, [effectId, speed]);

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

  const computeLedColor = (key: F75VisualKey, rIdx: number, cIdx: number): [number, number, number] | null => {
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

    // Animated or fixed firmware preview
    if (effectId === 3 || effectId === 6 || effectId === 13 || effectId === 15 || effectId === 16 || colorIdx === 7) {
      const hue = (tick * 6 + cIdx * 24 + rIdx * 14) % 360;
      const rad = (hue * Math.PI) / 180;
      const r = Math.round((127 + 120 * Math.cos(rad)) * bFactor);
      const g = Math.round((127 + 120 * Math.cos(rad - (2 * Math.PI) / 3)) * bFactor);
      const b = Math.round((127 + 120 * Math.cos(rad + (2 * Math.PI) / 3)) * bFactor);
      return [r, g, b];
    }

    const base = PALETTE_RGB[colorIdx] ?? [168, 85, 247];
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
    <div className="sxb-stage-bg relative flex flex-col justify-between overflow-hidden rounded-2xl border border-purple-500/20 p-4 shadow-[0_24px_60px_rgba(0,0,0,0.65)]">
      {/* Top Bezel Info + Live Telemetry */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2">
        <div className="flex items-center gap-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-purple-400 shadow-[0_0_10px_#a855f7]" />
          <span className="text-xs font-bold tracking-[0.14em] text-white uppercase">
            {deviceTitle}
          </span>
          {badgeText && (
            <span className="rounded-md border border-purple-400/25 bg-purple-500/15 px-2 py-0.5 text-[10px] font-semibold tracking-wider text-purple-200 uppercase">
              {badgeText}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2.5 text-xs text-zinc-400">
          {lastKeyLabel && (
            <span className="rounded-md border border-purple-500/25 bg-[#120f1e] px-2 py-0.5 font-mono text-[11px] text-purple-200">
              {lastKeyLabel}
            </span>
          )}
          <span className="font-mono text-[11px] text-zinc-400">
            <strong className="text-white">{wpm}</strong> WPM
          </span>
        </div>
      </div>

      {/* Reference-style Reassigned Key Callout Pills Floating Above the Keyboard */}
      {callouts.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center justify-center gap-2.5">
          {callouts.map((entry) => (
            <div
              key={entry.matrix_index}
              onClick={() => {
                const flat = F75_VISUAL_ROWS.flat();
                const found = flat.find((k) => k.matrixIndex === entry.matrix_index);
                if (found) onSelectKey?.(found);
              }}
              className="group flex cursor-pointer items-center gap-3 rounded-lg border border-purple-500/35 bg-[#120f1d]/95 px-3 py-1.5 shadow-[0_4px_18px_rgba(139,92,246,0.2)] transition hover:border-purple-400"
            >
              <div className="flex h-6 min-w-[24px] items-center justify-center rounded border border-purple-400/30 bg-[#1b1630] px-1.5 font-mono text-[10px] font-bold text-white">
                {entry.key_label}
              </div>
              <div className="text-left leading-tight">
                <div className="text-[11px] font-bold text-white">
                  {entry.assigned_label}
                </div>
                <div className="text-[9px] font-semibold tracking-wider text-purple-300 uppercase">
                  REASSIGNED
                </div>
              </div>
              {onResetKey && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onResetKey(entry.matrix_index);
                  }}
                  className="ml-1 rounded p-0.5 text-zinc-400 hover:bg-white/10 hover:text-white"
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
      <div className="relative mx-auto w-full max-w-[920px] rounded-2xl border border-purple-400/20 bg-[#0b0912] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_20px_50px_rgba(0,0,0,0.85)]">
        {/* Left Vertical Side LED Ambient Strip (Physical feature next to Esc/Tab/Caps) */}
        <div
          className={`absolute top-6 bottom-6 left-1.5 w-1 rounded-full transition-all duration-300 ${
            sideMode === 0
              ? 'bg-zinc-800/40'
              : sideMode === 2
              ? 'animate-pulse bg-gradient-to-b from-purple-400 via-fuchsia-400 to-purple-600 shadow-[0_0_12px_#a855f7]'
              : 'bg-gradient-to-b from-purple-300 via-violet-500 to-fuchsia-600 shadow-[0_0_14px_#a855f7]'
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
                              ? 'border-purple-400 bg-gradient-to-br from-purple-700 to-[#191529] shadow-[0_0_16px_rgba(168,85,247,0.7)]'
                              : 'border-zinc-500/70 bg-gradient-to-br from-zinc-700 via-zinc-900 to-black hover:border-purple-400/70'
                          }`}
                        >
                          <RotateCw className="h-3.5 w-3.5 text-zinc-200" />
                        </div>
                      </button>
                    </React.Fragment>
                  );
                }

                // Visual aesthetic matching the reference keyboard:
                // Light pearl/white alphas, dark charcoal mods, rose-magenta accents OR glowing per-key RGB underglow!
                let keyClasses = '';
                if (mode === 'rgb') {
                  keyClasses =
                    'bg-[#171424] text-zinc-100 border-[#2e2747]';
                } else if (key.isAccent) {
                  keyClasses = isPressed
                    ? 'bg-purple-400 text-black border-white'
                    : 'bg-gradient-to-b from-[#d91c5c] to-[#9f1239] text-white border-[#f43f5e]/60';
                } else if (key.isMod) {
                  keyClasses = isPressed
                    ? 'bg-purple-500 text-white border-purple-300'
                    : 'bg-[#171522] text-zinc-300 border-[#2c2740]';
                } else {
                  keyClasses = isPressed
                    ? 'bg-purple-300 text-black border-white'
                    : 'bg-[#ece8f6] text-[#171224] border-white/80';
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
                          ? `0 1px 0 #09070f, 0 0 18px ${glowCss ?? '#a855f7'}`
                          : isSelected
                          ? '0 3px 0 #4c1d95, 0 0 18px rgba(168, 85, 247, 0.75)'
                          : glowCss
                          ? `0 3px 0 #09070f, 0 0 10px ${glowCss}55, inset 0 -2px 6px ${glowCss}66`
                          : '0 3px 0 #09070f, 0 4px 8px rgba(0,0,0,0.6)',
                        borderColor: isSelected
                          ? '#c084fc'
                          : isModified
                          ? '#a855f7'
                          : glowCss && mode === 'rgb'
                          ? glowCss
                          : undefined,
                        backgroundColor:
                          mode === 'rgb' && glowCss && effectId !== 0
                            ? `${glowCss}2b`
                            : undefined,
                        transform: isPressed ? 'translateY(2px)' : 'translateY(0px)',
                      }}
                      className={`relative flex h-9 cursor-pointer items-center justify-center rounded-md border text-[10px] font-bold tracking-wide transition-all duration-75 select-none ${keyClasses}`}
                    >
                      {isModified && (
                        <span className="absolute top-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-purple-400 shadow-[0_0_6px_#a855f7]" />
                      )}
                      <span className="truncate px-1">
                        {key.code === 'Space' ? (
                          <span className="text-[9px] tracking-[0.26em] opacity-85">
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
        <div className="mx-auto mt-3 flex w-full max-w-[920px] items-center gap-2.5 rounded-xl border border-purple-500/20 bg-[#0d0b16] px-3 py-1.5">
          <Keyboard className="h-3.5 w-3.5 shrink-0 text-purple-400" />
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
              className="shrink-0 cursor-pointer rounded border border-purple-500/25 bg-purple-500/15 px-2 py-0.5 text-[11px] text-purple-200 hover:bg-purple-500/25"
            >
              {t.kb.clear}
            </button>
          )}
        </div>
      )}
    </div>
  );
};
