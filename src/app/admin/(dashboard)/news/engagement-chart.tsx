// NW-43: 7-day Pulse Check engagement (% of active users who completed a
// Pulse Check each day). A single magnitude series - one hue (the existing
// admin UI's --primary token, already used for active nav state), no
// categorical palette needed. Plain SVG, no charting library - dataviz
// skill's "build each in plain HTML" guidance, appropriate for a 7-point
// admin widget. Values are always direct-labeled (not hover-only) since
// staff read this as a KPI table as much as a shape, and 7 points is few
// enough that labeling every one doesn't clutter.
const CHART_HEIGHT = 96;
const BAR_WIDTH = 28;
const BAR_GAP = 12;

export type EngagementDay = { date: string; pct: number };

function formatDayLabel(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00+05:30`);
  return d.toLocaleDateString("en-IN", { weekday: "short", timeZone: "Asia/Kolkata" });
}

export function EngagementChart({ daily, averagePct }: { daily: EngagementDay[]; averagePct: number }) {
  const width = daily.length * (BAR_WIDTH + BAR_GAP) + BAR_GAP;
  const avgY = CHART_HEIGHT - (averagePct / 100) * CHART_HEIGHT;

  return (
    <div className="space-y-2 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">7-day Pulse Check engagement</h2>
        <span className="text-xs text-muted-foreground">
          {averagePct}% average of active users/day
        </span>
      </div>

      <svg
        viewBox={`0 0 ${width} ${CHART_HEIGHT + 28}`}
        role="img"
        aria-label={`Daily Pulse Check engagement over the last ${daily.length} days, averaging ${averagePct}%`}
        className="w-full max-w-md"
      >
        {/* Average reference line - muted, dashed, behind the bars */}
        <line
          x1={0}
          y1={avgY}
          x2={width}
          y2={avgY}
          stroke="var(--color-muted-foreground)"
          strokeWidth={1}
          strokeDasharray="3 3"
          opacity={0.5}
        />

        {daily.map((day, i) => {
          const x = BAR_GAP + i * (BAR_WIDTH + BAR_GAP);
          const barHeight = Math.max(1, (day.pct / 100) * CHART_HEIGHT);
          const y = CHART_HEIGHT - barHeight;
          return (
            <g key={day.date}>
              <title>{`${day.date}: ${day.pct}%`}</title>
              <rect x={x} y={y} width={BAR_WIDTH} height={barHeight} rx={4} fill="var(--color-primary)" />
              <text
                x={x + BAR_WIDTH / 2}
                y={y - 6}
                textAnchor="middle"
                className="fill-foreground"
                style={{ font: "700 10px JetBrains Mono, monospace" }}
              >
                {day.pct}%
              </text>
              <text
                x={x + BAR_WIDTH / 2}
                y={CHART_HEIGHT + 16}
                textAnchor="middle"
                className="fill-muted-foreground"
                style={{ font: "600 9px JetBrains Mono, monospace" }}
              >
                {formatDayLabel(day.date)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
