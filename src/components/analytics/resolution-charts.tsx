"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface BucketStat {
  label: string;
  count: number;
}

const NAVY = "#0d2a4a";
const TEAL = "#3a8d8d";
const ACCENT = "#c84321";
const BURGUNDY = "#7d2638";

export function ResolutionCharts({
  byCategory,
  byDorm,
  byStaff,
  byDay,
}: {
  byCategory: BucketStat[];
  byDorm: BucketStat[];
  byStaff: BucketStat[];
  byDay: { day: string; count: number }[];
}) {
  const topCategory = byCategory.slice(0, 8);
  const topDorm = byDorm.slice(0, 8);
  const topStaff = byStaff.slice(0, 8);
  const dayPoints = byDay.map((d) => ({
    ...d,
    dayShort: new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Zurich",
      day: "2-digit",
      month: "short",
    }).format(new Date(d.day)),
  }));

  return (
    <div className="charts-grid">
      <ChartCard title="Resolutions by category" wide>
        <ResponsiveContainer
          width="100%"
          height={Math.max(200, topCategory.length * 28)}
        >
          <BarChart data={topCategory} layout="vertical" margin={chartMargin}>
            <CartesianGrid strokeDasharray="2 4" stroke="#d8d2c5" horizontal={false} />
            <XAxis type="number" allowDecimals={false} stroke="#7a7468" fontSize={11} tickLine={false} />
            <YAxis type="category" dataKey="label" stroke="#7a7468" fontSize={11} width={160} tickLine={false} />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar dataKey="count" fill={NAVY} radius={[0, 2, 2, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Resolutions per day" wide>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={dayPoints} margin={{ top: 8, right: 16, left: -12, bottom: 0 }}>
            <CartesianGrid strokeDasharray="2 4" stroke="#d8d2c5" vertical={false} />
            <XAxis dataKey="dayShort" stroke="#7a7468" fontSize={11} tickLine={false} />
            <YAxis allowDecimals={false} stroke="#7a7468" fontSize={11} tickLine={false} />
            <Tooltip contentStyle={tooltipStyle} />
            <Line
              type="monotone"
              dataKey="count"
              stroke={ACCENT}
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="By dorm">
        <ResponsiveContainer width="100%" height={Math.max(200, topDorm.length * 28)}>
          <BarChart data={topDorm} layout="vertical" margin={chartMargin}>
            <CartesianGrid strokeDasharray="2 4" stroke="#d8d2c5" horizontal={false} />
            <XAxis type="number" allowDecimals={false} stroke="#7a7468" fontSize={11} tickLine={false} />
            <YAxis type="category" dataKey="label" stroke="#7a7468" fontSize={11} width={120} tickLine={false} />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar dataKey="count" fill={TEAL} radius={[0, 2, 2, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="By staff">
        <ResponsiveContainer width="100%" height={Math.max(200, topStaff.length * 28)}>
          <BarChart data={topStaff} layout="vertical" margin={chartMargin}>
            <CartesianGrid strokeDasharray="2 4" stroke="#d8d2c5" horizontal={false} />
            <XAxis type="number" allowDecimals={false} stroke="#7a7468" fontSize={11} tickLine={false} />
            <YAxis type="category" dataKey="label" stroke="#7a7468" fontSize={11} width={120} tickLine={false} />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar dataKey="count" fill={BURGUNDY} radius={[0, 2, 2, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}

const chartMargin = { top: 4, right: 16, left: 16, bottom: 0 };
const tooltipStyle = {
  background: "#fbf8f1",
  border: "1px solid #d8d2c5",
  fontSize: 12,
};

function ChartCard({
  title,
  children,
  wide,
}: {
  title: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={`chart-card${wide ? " chart-card--wide" : ""}`}>
      <div className="chart-card__title">{title}</div>
      <div className="chart-card__body">{children}</div>
    </div>
  );
}
