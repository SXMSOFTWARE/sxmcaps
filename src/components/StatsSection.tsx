import React, { useMemo } from 'react';
import { KEYBOARD_ROWS } from '../keymap';
import { StatsData } from '../types';
import { useI18n } from '../i18n';
import {
  Activity,
  BarChart3,
  Flame,
  Mouse,
  RotateCcw,
  TrendingUp,
  Trophy,
} from 'lucide-react';

interface StatsSectionProps {
  stats: StatsData;
  onResetStats: () => void;
}

export const StatsSection: React.FC<StatsSectionProps> = ({
  stats,
  onResetStats,
}) => {
  const { t } = useI18n();

  const maxKeyCount = useMemo(() => {
    const vals = Object.values(stats.heatmap);
    return vals.length > 0 ? Math.max(...vals, 1) : 1;
  }, [stats.heatmap]);

  const topKeys = useMemo(() => {
    return Object.entries(stats.heatmap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 7);
  }, [stats.heatmap]);

  const dailySeries = useMemo(() => {
    const entries = Object.entries(stats.daily).slice(-14);
    const max = entries.length > 0 ? Math.max(...entries.map((e) => e[1]), 1) : 1;
    return { entries, max };
  }, [stats.daily]);

  // SVG polyline + area coordinates for the LORGAR-style glowing purple activity curve
  const curveSvg = useMemo(() => {
    const entries = dailySeries.entries;
    if (entries.length === 0) return null;
    const width = 460;
    const height = 112;
    const padX = 16;
    const padY = 14;
    const innerW = width - padX * 2;
    const innerH = height - padY * 2;
    const stepX = entries.length > 1 ? innerW / (entries.length - 1) : 0;

    const points = entries.map(([date, count], i) => {
      const x = entries.length === 1 ? width / 2 : padX + i * stepX;
      const y = padY + innerH - (count / dailySeries.max) * innerH;
      return { x, y, date, count };
    });

    const linePath = points
      .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
      .join(' ');
    const last = points[points.length - 1];
    const first = points[0];
    const areaPath = `${linePath} L ${last.x.toFixed(1)} ${(height - padY).toFixed(1)} L ${first.x.toFixed(1)} ${(height - padY).toFixed(1)} Z`;

    return { width, height, padY, points, linePath, areaPath };
  }, [dailySeries]);

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto pr-1">
      {/* LORGAR KPI Summary Strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-purple-500/20 bg-[#100d1a] p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
          <div className="flex items-center justify-between text-[10px] font-bold tracking-widest text-zinc-400 uppercase">
            <span>{t.stats.totalKeys}</span>
            <Activity className="h-3.5 w-3.5 text-purple-400" />
          </div>
          <div className="mt-1.5 font-mono text-2xl font-extrabold tracking-tight text-white">
            {stats.total_keystrokes.toLocaleString(t.locale)}
          </div>
        </div>

        <div className="rounded-xl border border-purple-500/20 bg-[#100d1a] p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
          <div className="flex items-center justify-between text-[10px] font-bold tracking-widest text-zinc-400 uppercase">
            <span>{t.stats.mouseClicks}</span>
            <Mouse className="h-3.5 w-3.5 text-purple-400" />
          </div>
          <div className="mt-1.5 font-mono text-2xl font-extrabold tracking-tight text-white">
            {stats.total_mouse_clicks.toLocaleString(t.locale)}
          </div>
        </div>

        <div className="rounded-xl border border-purple-500/20 bg-[#100d1a] p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
          <div className="flex items-center justify-between text-[10px] font-bold tracking-widest text-zinc-400 uppercase">
            <span>{t.stats.peakSpeed}</span>
            <Trophy className="h-3.5 w-3.5 text-purple-400" />
          </div>
          <div className="mt-1.5 font-mono text-2xl font-extrabold tracking-tight text-white">
            {stats.peak_wpm}{' '}
            <span className="text-xs font-semibold text-purple-300/80">WPM</span>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-xl border border-purple-500/20 bg-[#100d1a] p-3.5">
          <div className="min-w-0">
            <div className="text-[10px] font-bold tracking-widest text-zinc-400 uppercase">
              {t.stats.topKey}
            </div>
            <div className="mt-1.5 truncate font-mono text-lg font-extrabold text-purple-200">
              {topKeys[0]?.[0] ?? '—'}
            </div>
          </div>

          <button
            type="button"
            onClick={onResetStats}
            title={t.stats.resetTitle}
            className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-purple-500/30 bg-purple-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-purple-200 transition hover:border-purple-400 hover:bg-purple-600 hover:text-white"
          >
            <RotateCcw className="h-3 w-3" />
            {t.stats.resetBtn}
          </button>
        </div>
      </div>

      {/* Violet Analytics Charts Row: Vertical Bar Columns + Glowing Spline Curve */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {/* Neon Violet Vertical Bar Chart */}
        <div className="rounded-2xl border border-purple-500/20 bg-[#100d1a] p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold tracking-wider text-zinc-200 uppercase">
              <BarChart3 className="h-3.5 w-3.5 text-purple-400" />
              {t.stats.dailyTitle}
            </div>
            <span className="rounded-md bg-purple-500/15 px-2 py-0.5 font-mono text-[10px] font-semibold text-purple-300">
              14D
            </span>
          </div>

          {dailySeries.entries.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-xs text-zinc-500">
              {t.stats.dailyEmpty}
            </div>
          ) : (
            <div className="flex h-32 items-end gap-2 pt-2">
              {dailySeries.entries.map(([date, count]) => {
                const h = Math.max(8, Math.round((count / dailySeries.max) * 100));
                return (
                  <div
                    key={date}
                    title={`${date}: ${count.toLocaleString(t.locale)} ${t.stats.hits}`}
                    className="group flex flex-1 flex-col items-center gap-1.5"
                  >
                    <div className="flex h-24 w-full items-end overflow-hidden rounded-md bg-[#161224] p-0.5">
                      <div
                        style={{
                          height: `${h}%`,
                          background:
                            'linear-gradient(to top, #6b21a8 0%, #9333ea 55%, #c084fc 100%)',
                          boxShadow: '0 0 14px rgba(168,85,247,0.45)',
                        }}
                        className="w-full rounded-sm transition-all group-hover:brightness-125"
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

        {/* Glowing Violet Trend Curve */}
        <div className="rounded-2xl border border-purple-500/20 bg-[#100d1a] p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold tracking-wider text-zinc-200 uppercase">
              <TrendingUp className="h-3.5 w-3.5 text-purple-400" />
              {t.stats.dailyTitle}
            </div>
            <span className="font-mono text-[10px] text-purple-300">
              {dailySeries.entries[dailySeries.entries.length - 1]?.[1].toLocaleString(
                t.locale
              ) ?? '0'}{' '}
              {t.stats.hits}
            </span>
          </div>

          {!curveSvg ? (
            <div className="flex h-32 items-center justify-center text-xs text-zinc-500">
              {t.stats.dailyEmpty}
            </div>
          ) : (
            <div className="h-32 w-full rounded-xl border border-purple-500/10 bg-[#0c0914] p-2">
              <svg
                viewBox={`0 0 ${curveSvg.width} ${curveSvg.height}`}
                className="h-full w-full overflow-visible"
                preserveAspectRatio="none"
              >
                <defs>
                  <linearGradient id="sxbAreaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#a855f7" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="#a855f7" stopOpacity="0" />
                  </linearGradient>
                  <filter id="sxbGlow" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="2.5" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>

                {[0.25, 0.5, 0.75].map((frac) => (
                  <line
                    key={frac}
                    x1={10}
                    x2={curveSvg.width - 10}
                    y1={curveSvg.height * frac}
                    y2={curveSvg.height * frac}
                    stroke="rgba(168,85,247,0.12)"
                    strokeDasharray="3 4"
                  />
                ))}

                <path d={curveSvg.areaPath} fill="url(#sxbAreaGrad)" />
                <path
                  d={curveSvg.linePath}
                  fill="none"
                  stroke="#a855f7"
                  strokeWidth="2.4"
                  filter="url(#sxbGlow)"
                />
                {curveSvg.points.map((pt) => (
                  <circle
                    key={pt.date}
                    cx={pt.x}
                    cy={pt.y}
                    r="3.2"
                    fill="#e9d5ff"
                    stroke="#9333ea"
                    strokeWidth="1.5"
                  >
                    <title>{`${pt.date}: ${pt.count.toLocaleString(t.locale)} ${t.stats.hits}`}</title>
                  </circle>
                ))}
              </svg>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Row: Keycap Violet Heatmap + Most Pressed Keys */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        {/* Violet Keycap Heatmap */}
        <div className="rounded-2xl border border-purple-500/20 bg-[#100d1a] p-4 xl:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold tracking-wider text-zinc-200 uppercase">
              <Flame className="h-3.5 w-3.5 text-purple-400" />
              {t.stats.heatmapTitle}
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-zinc-400">
              <span>{t.stats.less}</span>
              <span className="h-2.5 w-4 rounded-xs border border-purple-500/20 bg-[#161224]" />
              <span className="h-2.5 w-4 rounded-xs bg-[#6b21a8]" />
              <span className="h-2.5 w-4 rounded-xs bg-[#c084fc]" />
              <span>{t.stats.more}</span>
            </div>
          </div>

          <div className="rounded-xl border border-purple-500/15 bg-[#090710] p-2.5">
            <div className="flex flex-col gap-1">
              {KEYBOARD_ROWS.map((row, rIdx) => (
                <div key={rIdx} className="flex w-full gap-1">
                  {row.map((key) => {
                    const hits = stats.heatmap[key.code] ?? 0;
                    const ratio = hits / maxKeyCount;
                    const flexGrow = key.width ?? 1;

                    const bg =
                      hits === 0
                        ? '#161224'
                        : ratio > 0.65
                          ? '#c084fc'
                          : ratio > 0.35
                            ? '#9333ea'
                            : ratio > 0.12
                              ? '#581c87'
                              : '#2e1065';
                    const fg = ratio > 0.65 && hits > 0 ? '#0b0714' : '#f3e8ff';

                    return (
                      <div
                        key={key.code}
                        title={`${key.code}: ${hits.toLocaleString(t.locale)} ${t.stats.hits}`}
                        style={{
                          flex: `${flexGrow} 1 0%`,
                          backgroundColor: bg,
                          color: fg,
                          boxShadow:
                            ratio > 0.65 && hits > 0
                              ? '0 0 10px rgba(192,132,252,0.55)'
                              : undefined,
                        }}
                        className="flex h-7 items-center justify-center rounded border border-purple-400/15 text-[10px] font-semibold"
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

        {/* Most Pressed Keys */}
        <div className="rounded-2xl border border-purple-500/20 bg-[#100d1a] p-4">
          <div className="mb-3 flex items-center gap-2 text-xs font-bold tracking-wider text-zinc-200 uppercase">
            <BarChart3 className="h-3.5 w-3.5 text-purple-400" />
            {t.stats.mostPressed}
          </div>
          {topKeys.length === 0 ? (
            <div className="py-10 text-center text-xs text-zinc-500">
              {t.stats.noKeysYet}
            </div>
          ) : (
            <div className="space-y-2.5">
              {topKeys.map(([code, count]) => {
                const pct = Math.max(4, Math.round((count / maxKeyCount) * 100));
                return (
                  <div key={code} className="space-y-1 text-[11px]">
                    <div className="flex items-center justify-between">
                      <span className="truncate font-mono text-zinc-300">
                        {code}
                      </span>
                      <span className="font-mono font-semibold text-purple-200">
                        {count.toLocaleString(t.locale)}
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-[#1a152b]">
                      <div
                        style={{
                          width: `${pct}%`,
                          background:
                            'linear-gradient(to right, #7e22ce, #c084fc)',
                        }}
                        className="h-full rounded-full"
                      />
                    </div>
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
