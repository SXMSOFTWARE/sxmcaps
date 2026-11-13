import React, { useRef, useState } from 'react';
import { KEYBOARD_ROWS, KeyCapDef } from '../keymap';
import { useI18n } from '../i18n';
import { ChevronDown, ChevronUp, Keyboard } from 'lucide-react';

interface KeyboardVisualizerProps {
  pressedKeys: Set<string>;
  activePackName: string;
  activePackTag: string;
  wpm: number;
  lastKeyLabel: string | null;
  onKeyPress: (code: string, isDown: boolean) => void;
}

export const KeyboardVisualizer: React.FC<KeyboardVisualizerProps> = ({
  pressedKeys,
  activePackName,
  activePackTag,
  wpm,
  lastKeyLabel,
  onKeyPress,
}) => {
  const { t } = useI18n();
  const [sandboxText, setSandboxText] = useState('');
  const [promptIdx, setPromptIdx] = useState(0);
  const [collapsed, setCollapsed] = useState(false);
  const mouseDownKeyRef = useRef<string | null>(null);
  const prompts = t.kb.prompts;
  const activePrompt = prompts[promptIdx % prompts.length];

  const handleMouseDown = (key: KeyCapDef) => {
    mouseDownKeyRef.current = key.code;
    onKeyPress(key.code, true);
  };

  const handleMouseUp = (key: KeyCapDef) => {
    if (mouseDownKeyRef.current === key.code) {
      mouseDownKeyRef.current = null;
      onKeyPress(key.code, false);
    }
  };

  const handleMouseLeave = (key: KeyCapDef) => {
    if (mouseDownKeyRef.current === key.code) {
      mouseDownKeyRef.current = null;
      onKeyPress(key.code, false);
    }
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-[#0b0b0e] p-3.5 shadow-2xl">
      {/* Top keyboard bezel info */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-2 w-2 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]" />
          <span className="text-xs font-semibold tracking-wider text-white uppercase">
            {activePackName}
          </span>
          <span className="rounded border border-white/15 bg-white/[0.06] px-2 py-0.5 text-[10px] font-medium tracking-wide text-zinc-300 uppercase">
            {activePackTag}
          </span>
        </div>

        <div className="flex items-center gap-3 text-xs text-zinc-400">
          {lastKeyLabel && (
            <span className="rounded border border-white/15 bg-black px-2 py-0.5 font-mono text-[11px] text-white">
              {lastKeyLabel}
            </span>
          )}
          <span className="font-mono text-[11px] text-zinc-400">
            <strong className="text-white">{wpm}</strong> WPM
          </span>
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] text-zinc-300 hover:bg-white/10 hover:text-white"
          >
            {collapsed ? (
              <>
                <ChevronDown className="h-3.5 w-3.5" />
                {t.kb.show}
              </>
            ) : (
              <>
                <ChevronUp className="h-3.5 w-3.5" />
                {t.kb.hide}
              </>
            )}
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          {/* Mechanical keyboard deck */}
          <div className="mt-2.5 rounded-xl border border-white/[0.08] bg-[#040405] p-2.5 shadow-inner">
            <div className="flex flex-col gap-1.5">
              {KEYBOARD_ROWS.map((row, rIdx) => (
                <div key={rIdx} className="flex w-full gap-1.5">
                  {row.map((key) => {
                    const isPressed = pressedKeys.has(key.code);
                    const flexGrow = key.width ?? 1;

                    let baseClasses =
                      'bg-[#19191e] text-zinc-100 border-[#2c2c34]';
                    let lipColor = '#0a0a0d';

                    if (key.isAccent) {
                      baseClasses = isPressed
                        ? 'bg-zinc-200 text-black border-white'
                        : 'bg-white text-black border-white';
                      lipColor = '#71717a';
                    } else if (key.isMod) {
                      baseClasses = isPressed
                        ? 'bg-white text-black border-white'
                        : 'bg-[#111115] text-zinc-400 border-[#23232a]';
                      lipColor = '#060608';
                    } else if (isPressed) {
                      baseClasses = 'bg-white text-black border-white';
                    }

                    return (
                      <button
                        key={key.code}
                        type="button"
                        onMouseDown={() => handleMouseDown(key)}
                        onMouseUp={() => handleMouseUp(key)}
                        onMouseLeave={() => handleMouseLeave(key)}
                        style={{
                          flex: `${flexGrow} 1 0%`,
                          boxShadow: isPressed
                            ? `0 1px 0 ${lipColor}, 0 0 16px rgba(255,255,255,0.45)`
                            : `0 3px 0 ${lipColor}, 0 4px 8px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.08)`,
                          transform: isPressed
                            ? 'translateY(2.5px)'
                            : 'translateY(0px)',
                        }}
                        className={`relative flex h-8.5 cursor-pointer items-center justify-center rounded-md border text-[11px] font-semibold tracking-wide transition-all duration-75 select-none ${baseClasses}`}
                      >
                        <span className="truncate px-1">
                          {key.code === 'Space' ? (
                            <span
                              className={`text-[10px] tracking-[0.26em] ${
                                isPressed ? 'text-black/70' : 'text-zinc-500'
                              }`}
                            >
                              {key.label}
                            </span>
                          ) : (
                            key.label
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* Built-in typing sandbox strip */}
          <div className="mt-2.5 flex items-center gap-2.5 rounded-lg border border-white/[0.08] bg-[#060608] px-3 py-1.5">
            <Keyboard className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
            <input
              type="text"
              value={sandboxText}
              onChange={(e) => setSandboxText(e.target.value)}
              placeholder={t.kb.placeholder(activePrompt)}
              className="w-full bg-transparent text-xs text-white placeholder-zinc-600 outline-none"
            />
            {sandboxText && (
              <button
                type="button"
                onClick={() => {
                  setSandboxText('');
                  setPromptIdx((i) => (i + 1) % prompts.length);
                }}
                className="shrink-0 cursor-pointer rounded border border-white/15 bg-white/5 px-2 py-0.5 text-[11px] text-zinc-300 hover:bg-white/15 hover:text-white"
              >
                {t.kb.clear}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
};
