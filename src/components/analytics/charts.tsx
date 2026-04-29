"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface DayPoint {
  day: string;
  count: number;
}
interface CategoryPoint {
  category: string;
  count: number;
}
interface HousePoint {
  house: string;
  count: number;
}

const ACCENT = "#c84321";
const NAVY = "#0d2a4a";
const TEAL = "#3a8d8d";
const AMBER = "#c98e2c";

export function PastoralCharts({
  byDay,
  byCategory,
  byHouse,
  watchlistCount,
  sensitiveCount,
}: {
  byDay: DayPoint[];
  byCategory: CategoryPoint[];
  byHouse: HousePoint[];
  watchlistCount: number;
  sensitiveCount: number;
}) {
  if (byDay.length === 0 && byCategory.length === 0) return null;

  const dayChartData = byDay.map((d) => ({
    ...d,
    dayShort: new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Zurich",
      day: "2-digit",
      month: "short",
    }).format(new Date(d.day)),
  }));

  const topCategories = byCategory.slice(0, 8);
  const topHouses = byHouse.slice(0, 8);

  return (
    <div className="charts-grid">
      <ChartCard title="Records per day" wide>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={dayChartData} margin={{ top: 8, right: 16, left: -12, bottom: 0 }}>
            <CartesianGrid strokeDasharray="2 4" stroke="#d8d2c5" vertical={false} />
            <XAxis
              dataKey="dayShort"
              stroke="#7a7468"
              fontSize={11}
              tickLine={false}
            />
            <YAxis
              allowDecimals={false}
              stroke="#7a7468"
              fontSize={11}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                background: "#fbf8f1",
                border: "1px solid #d8d2c5",
                fontSize: 12,
              }}
            />
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

      <ChartCard title="Top categories">
        <ResponsiveContainer width="100%" height={Math.max(200, topCategories.length * 28)}>
          <BarChart
            data={topCategories}
            layout="vertical"
            margin={{ top: 4, right: 16, left: 16, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="2 4" stroke="#d8d2c5" horizontal={false} />
            <XAxis
              type="number"
              allowDecimals={false}
              stroke="#7a7468"
              fontSize={11}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="category"
              stroke="#7a7468"
              fontSize={11}
              width={140}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                background: "#fbf8f1",
                border: "1px solid #d8d2c5",
                fontSize: 12,
              }}
            />
            <Bar dataKey="count" fill={NAVY} radius={[0, 2, 2, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="By house">
        <ResponsiveContainer width="100%" height={Math.max(200, topHouses.length * 28)}>
          <BarChart
            data={topHouses}
            layout="vertical"
            margin={{ top: 4, right: 16, left: 16, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="2 4" stroke="#d8d2c5" horizontal={false} />
            <XAxis
              type="number"
              allowDecimals={false}
              stroke="#7a7468"
              fontSize={11}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="house"
              stroke="#7a7468"
              fontSize={11}
              width={120}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                background: "#fbf8f1",
                border: "1px solid #d8d2c5",
                fontSize: 12,
              }}
            />
            <Bar dataKey="count" fill={TEAL} radius={[0, 2, 2, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Flag mix">
        <ResponsiveContainer width="100%" height={200}>
          <BarChart
            data={[
              { kind: "Watchlist", count: watchlistCount },
              { kind: "Sensitive", count: sensitiveCount },
            ]}
            margin={{ top: 12, right: 16, left: -12, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="2 4" stroke="#d8d2c5" vertical={false} />
            <XAxis dataKey="kind" stroke="#7a7468" fontSize={11} tickLine={false} />
            <YAxis allowDecimals={false} stroke="#7a7468" fontSize={11} tickLine={false} />
            <Tooltip
              contentStyle={{
                background: "#fbf8f1",
                border: "1px solid #d8d2c5",
                fontSize: 12,
              }}
            />
            <Bar dataKey="count" radius={[2, 2, 0, 0]}>
              <Cell fill={ACCENT} />
              <Cell fill={AMBER} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}

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
