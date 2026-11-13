import React, { useMemo } from 'react';
import { KEYBOARD_ROWS } from '../keymap';
import { StatsData } from '../types';
import { BarChart3, Flame, Mouse, RotateCcw, Trophy } from 'lucide-react';

interface StatsSectionProps {
  stats: StatsData;
  onResetStats: () => void;
}

export const StatsSection: React.FC<StatsSectionProps> = ({
  stats,
  onResetStats,
}) => {
  const maxKeyCount = useMemo(() => {
    const vals = Object.values(stats.heatmap);
    return vals.length > 0 ? Math.max(...vals, 1) : 1;
  }, [stats.heatmap]);

  const topKeys = useMemo(() => {
    return Object.entries(stats.heatmap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
  }, [stats.heatmap]);

  const dailySeries = useMemo(() => {
    const entries = Object.entries(stats.daily).slice(-14);
    const max = entries.length > 0 ? Math.max(...entries.map((e) => e[1]), 1) : 1;
    return { entries, max };
  }, [stats.daily]);

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto pr-1">
      {/* Top Stat Summary Cards */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-[#0b0b0e] p-3">
          <div className="text-[10px] font-medium tracking-wider text-zinc-500 uppercase">
            Toplam Tuş Vuruşu
          </div>
          <div className="mt-1 font-mono text-xl font-bold text-white">
            {stats.total_keystrokes.toLocaleString('tr-TR')}
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-[#0b0b0e] p-3">
          <div className="flex items-center gap-1 text-[10px] font-medium tracking-wider text-zinc-500 uppercase">
            <Mouse className="h-3 w-3" />
            Fare Tıklaması
          </div>
          <div className="mt-1 font-mono text-xl font-bold text-white">
            {stats.total_mouse_clicks.toLocaleString('tr-TR')}
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-[#0b0b0e] p-3">
          <div className="flex items-center gap-1 text-[10px] font-medium tracking-wider text-zinc-500 uppercase">
            <Trophy className="h-3 w-3" />
            Rekor Hız
          </div>
          <div className="mt-1 font-mono text-xl font-bold text-white">
            {stats.peak_wpm} <span className="text-xs font-normal text-zinc-400">WPM</span>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-xl border border-white/10 bg-[#0b0b0e] p-3">
          <div>
            <div className="text-[10px] font-medium tracking-wider text-zinc-500 uppercase">
              En Aktif Tuş
            </div>
            <div className="mt-1 font-mono text-base font-bold text-white">
              {topKeys[0]?.[0] ?? '—'}
            </div>
          </div>

          <button
            type="button"
            onClick={onResetStats}
            title="İstatistikleri sıfırla"
            className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-white/15 bg-white/[0.04] px-2.5 py-1.5 text-[11px] text-zinc-300 hover:border-white hover:bg-white hover:text-black"
          >
            <RotateCcw className="h-3 w-3" />
            Sıfırla
          </button>
        </div>
      </div>

      {/* Monochrome Keycap Heatmap */}
      <div className="rounded-2xl border border-white/10 bg-[#0b0b0e] p-3.5">
        <div className="mb-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold tracking-wider text-zinc-300 uppercase">
            <Flame className="h-3.5 w-3.5 text-white" />
            Tuş Kullanım Isı Haritası
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-zinc-500">
            <span>Az</span>
            <span className="h-2.5 w-4 rounded-xs bg-[#18181d] border border-white/10" />
            <span className="h-2.5 w-4 rounded-xs bg-zinc-500" />
            <span className="h-2.5 w-4 rounded-xs bg-white" />
            <span>Çok</span>
          </div>
        </div>

        <div className="rounded-xl border border-white/[0.08] bg-[#040405] p-2">
          <div className="flex flex-col gap-1">
            {KEYBOARD_ROWS.map((row, rIdx) => (
              <div key={rIdx} className="flex w-full gap-1">
                {row.map((key) => {
                  const hits = stats.heatmap[key.code] ?? 0;
                  const ratio = hits / maxKeyCount;
                  const flexGrow = key.width ?? 1;

                  // Pure monochrome interpolation: dark graphite -> bright white
                  const bg =
                    hits === 0
                      ? '#141418'
                      : ratio > 0.65
                        ? '#ffffff'
                        : ratio > 0.35
                          ? '#a1a1aa'
                          : ratio > 0.12
                            ? '#52525b'
                            : '#27272a';
                  const fg = ratio > 0.55 && hits > 0 ? '#050506' : '#e4e4e7';

                  return (
                    <div
                      key={key.code}
                      title={`${key.code}: ${hits.toLocaleString('tr-TR')} vuruş`}
                      style={{
                        flex: `${flexGrow} 1 0%`,
                        backgroundColor: bg,
                        color: fg,
                      }}
                      className="flex h-7 items-center justify-center rounded border border-white/10 text-[10px] font-semibold"
                    >
                      <span className="truncate px-1">
                        {hits > 0 ? `${key.label}·${hits}` : key.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom: Top Keys + 14-Day History */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-[#0b0b0e] p-3.5">
          <div className="mb-2.5 flex items-center gap-2 text-xs font-semibold tracking-wider text-zinc-300 uppercase">
            <BarChart3 className="h-3.5 w-3.5 text-white" />
            En Çok Basılan Tuşlar
          </div>
          {topKeys.length === 0 ? (
            <div className="py-6 text-center text-xs text-zinc-500">
              Henüz tuş vuruşu kaydedilmedi.
            </div>
          ) : (
            <div className="space-y-1.5">
              {topKeys.map(([code, count]) => {
                const pct = Math.max(4, Math.round((count / maxKeyCount) * 100));
                return (
                  <div key={code} className="flex items-center gap-2 text-[11px]">
                    <span className="w-24 shrink-0 truncate font-mono text-zinc-300">
                      {code}
                    </span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                      <div
                        style={{ width: `${pct}%` }}
                        className="h-full rounded-full bg-white"
                      />
                    </div>
                    <span className="w-14 text-right font-mono text-white">
                      {count}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#0b0b0e] p-3.5">
          <div className="mb-2.5 text-xs font-semibold tracking-wider text-zinc-300 uppercase">
            Günlük Aktivite (Son 14 Gün)
          </div>
          {dailySeries.entries.length === 0 ? (
            <div className="py-6 text-center text-xs text-zinc-500">
              Günlük veri biriktikçe burada görüntülenecek.
            </div>
          ) : (
            <div className="flex h-28 items-end gap-1.5 pt-2">
              {dailySeries.entries.map(([date, count]) => {
                const h = Math.max(8, Math.round((count / dailySeries.max) * 100));
                return (
                  <div
                    key={date}
                    title={`${date}: ${count.toLocaleString('tr-TR')} vuruş`}
                    className="flex flex-1 flex-col items-center gap-1"
                  >
                    <div className="flex h-20 w-full items-end">
                      <div
                        style={{ height: `${h}%` }}
                        className="w-full rounded-t bg-white/85 transition hover:bg-white"
                      />
                    </div>
                    <span className="font-mono text-[9px] text-zinc-500">
                      {date.slice(5)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
