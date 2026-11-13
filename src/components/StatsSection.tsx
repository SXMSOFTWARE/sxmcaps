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
    <div className="flex h-full flex-col gap-3.5 overflow-y-auto pr-1">
      {/* KPI Bento Strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="sxm-card p-4">
          <div className="flex items-center justify-between text-[10px] font-bold tracking-widest text-zinc-500 uppercase">
            <span>{t.stats.totalKeys}</span>
            <Activity className="h-3.5 w-3.5 text-white" />
          </div>
          <div className="mt-1.5 font-mono text-2xl font-extrabold tracking-tight text-white tabular-nums">
            {stats.total_keystrokes.toLocaleString(t.locale)}
          </div>
        </div>

        <div className="sxm-card p-4">
          <div className="flex items-center justify-between text-[10px] font-bold tracking-widest text-zinc-500 uppercase">
            <span>{t.stats.mouseClicks}</span>
            <Mouse className="h-3.5 w-3.5 text-white" />
          </div>
          <div className="mt-1.5 font-mono text-2xl font-extrabold tracking-tight text-white tabular-nums">
            {stats.total_mouse_clicks.toLocaleString(t.locale)}
          </div>
        </div>

        <div className="sxm-card p-4">
          <div className="flex items-center justify-between text-[10px] font-bold tracking-widest text-zinc-500 uppercase">
            <span>{t.stats.peakSpeed}</span>
            <Trophy className="h-3.5 w-3.5 text-white" />
          </div>
          <div className="mt-1.5 font-mono text-2xl font-extrabold tracking-tight text-white tabular-nums">
            {stats.peak_wpm}{' '}
            <span className="text-xs font-semibold text-zinc-400">WPM</span>
          </div>
        </div>

        <div className="sxm-card flex items-center justify-between p-4">
          <div className="min-w-0">
            <div className="text-[10px] font-bold tracking-widest text-zinc-500 uppercase">
              {t.stats.topKey}
            </div>
            <div className="mt-1.5 truncate font-mono text-lg font-extrabold text-white">
              {topKeys[0]?.[0] ?? '—'}
            </div>
          </div>

          <button
            type="button"
            onClick={onResetStats}
            title={t.stats.resetTitle}
            className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] font-semibold text-zinc-200 transition hover:bg-white hover:text-black"
          >
            <RotateCcw className="h-3 w-3" />
            {t.stats.resetBtn}
          </button>
        </div>
      </div>

      {/* Monochrome Charts Row */}
      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
        <div className="sxm-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold tracking-wider text-zinc-200 uppercase">
              <BarChart3 className="h-3.5 w-3.5 text-white" />
              {t.stats.dailyTitle}
            </div>
            <span className="rounded-full border border-white/12 bg-white/5 px-2.5 py-0.5 font-mono text-[10px] font-semibold text-zinc-300">
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
                    <div className="flex h-24 w-full items-end overflow-hidden rounded-lg bg-[#0b0b0d] p-0.5">
                      <div
                        style={{
                          height: `${h}%`,
                          background:
                            'linear-gradient(to top, #3f3f46 0%, #a1a1aa 55%, #ffffff 100%)',
                        }}
                        className="w-full rounded-sm transition-all group-hover:brightness-110"
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

        {/* Crisp Monochrome Trend Curve */}
        <div className="sxm-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold tracking-wider text-zinc-200 uppercase">
              <TrendingUp className="h-3.5 w-3.5 text-white" />
              {t.stats.dailyTitle}
            </div>
            <span className="font-mono text-[10px] text-white tabular-nums">
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
            <div className="h-32 w-full rounded-xl border border-white/8 bg-[#0b0b0d] p-2">
              <svg
                viewBox={`0 0 ${curveSvg.width} ${curveSvg.height}`}
                className="h-full w-full overflow-visible"
                preserveAspectRatio="none"
              >
                <defs>
                  <linearGradient id="sxmAreaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ffffff" stopOpacity="0.28" />
                    <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
                  </linearGradient>
                </defs>

                {[0.25, 0.5, 0.75].map((frac) => (
                  <line
                    key={frac}
                    x1={10}
                    x2={curveSvg.width - 10}
                    y1={curveSvg.height * frac}
                    y2={curveSvg.height * frac}
                    stroke="rgba(255,255,255,0.08)"
                    strokeDasharray="3 4"
                  />
                ))}

                <path d={curveSvg.areaPath} fill="url(#sxmAreaGrad)" />
                <path
                  d={curveSvg.linePath}
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth="2.2"
                />
                {curveSvg.points.map((pt) => (
                  <circle
                    key={pt.date}
                    cx={pt.x}
                    cy={pt.y}
                    r="3.2"
                    fill="#ffffff"
                    stroke="#050506"
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

      {/* Bottom Row: Monochrome Heatmap + Top Pressed Pill Bars */}
      <div className="grid grid-cols-1 gap-3.5 xl:grid-cols-3">
        <div className="sxm-card p-4 xl:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold tracking-wider text-zinc-200 uppercase">
              <Flame className="h-3.5 w-3.5 text-white" />
              {t.stats.heatmapTitle}
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-zinc-400">
              <span>{t.stats.less}</span>
              <span className="h-2.5 w-4 rounded-xs border border-white/10 bg-[#141418]" />
              <span className="h-2.5 w-4 rounded-xs bg-zinc-600" />
              <span className="h-2.5 w-4 rounded-xs bg-white" />
              <span>{t.stats.more}</span>
            </div>
          </div>

          <div className="rounded-xl border border-white/8 bg-[#09090b] p-2.5">
            <div className="flex flex-col gap-1">
              {KEYBOARD_ROWS.map((row, rIdx) => (
                <div key={rIdx} className="flex w-full gap-1">
                  {row.map((key) => {
                    const hits = stats.heatmap[key.code] ?? 0;
                    const ratio = hits / maxKeyCount;
                    const flexGrow = key.width ?? 1;

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
                    const fg = ratio > 0.35 && hits > 0 ? '#050506' : '#f4f4f5';

                    return (
                      <div
                        key={key.code}
                        title={`${key.code}: ${hits.toLocaleString(t.locale)} ${t.stats.hits}`}
                        style={{
                          flex: `${flexGrow} 1 0%`,
                          backgroundColor: bg,
                          color: fg,
                        }}
                        className="flex h-7 items-center justify-center rounded border border-white/8 text-[10px] font-semibold"
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

        <div className="sxm-card p-4">
          <div className="mb-3 flex items-center gap-2 text-xs font-bold tracking-wider text-zinc-200 uppercase">
            <BarChart3 className="h-3.5 w-3.5 text-white" />
            {t.stats.mostPressed}
          </div>
          {topKeys.length === 0 ? (
            <div className="py-10 text-center text-xs text-zinc-500">
              {t.stats.noKeysYet}
            </div>
          ) : (
            <div className="space-y-2.5">
              {topKeys.map(([code, count]) => {
                const pct = Math.max(8, Math.round((count / maxKeyCount) * 100));
                return (
                  <div key={code} className="space-y-1 text-[11px]">
                    <div className="flex items-center justify-between">
                      <span className="truncate font-mono text-zinc-300">
                        {code}
                      </span>
                      <span className="font-mono font-semibold text-white tabular-nums">
                        {count.toLocaleString(t.locale)}
                      </span>
                    </div>
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-[#1a1a1f]">
                      <div
                        style={{ width: `${pct}%` }}
                        className="h-full rounded-full bg-white"
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
