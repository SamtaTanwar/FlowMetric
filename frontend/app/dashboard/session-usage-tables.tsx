"use client";

import Link from "next/link";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { allowProtectedNavigation } from "@/lib/api";

export type SessionUsageRow = {
  sessionId: number;
  userId: number;
  employeeCode: string;
  employeeName: string;
  department: string;
  loginAt: string;
  logoutAt: string | null;
  sessionStatus: string;
  sessionLabel: string;
  totalMinutes: number;
  idleMinutes: number;
  breakMinutes: number;
  activeMinutes: number;
  productiveMinutes: number;
  unproductiveMinutes: number;
  unproductiveAppMinutes?: number;
  networkInterruptionMinutes: number;
  appName: string;
  windowTitle: string;
  category: string;
  appDurationSeconds: number;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
};

export type EmployeeSnapshotRow = {
  sessionId?: number | string;
  userId: number;
  employeeCode: string;
  employeeName: string;
  department: string;
  loginAt?: string | null;
  logoutAt?: string | null;
  sessionStatus?: string;
  sessionLabel: string;
  totalMinutes: number;
  idleMinutes: number;
  breakMinutes: number;
  activeMinutes: number;
  productiveMinutes: number;
  unproductiveMinutes: number;
  networkInterruptionMinutes: number;
};

type TableSectionProps = {
  title: string;
  children: React.ReactNode;
  href?: string;
};

function formatMinutes(minutes = 0) {
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;

  if (hours <= 0) {
    return `${remaining}m`;
  }

  return `${hours}h ${remaining}m`;
}

function formatSeconds(seconds = 0) {
  const safeSeconds = Math.max(0, Math.round(seconds));

  if (safeSeconds < 60) {
    return `${safeSeconds}s`;
  }

  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;

  return remainingSeconds > 0
    ? `${formatMinutes(minutes)} ${remainingSeconds}s`
    : formatMinutes(minutes);
}

const usageChartColors = [
  "#22d3ee",
  "#34d399",
  "#f59e0b",
  "#fb7185",
  "#a78bfa",
  "#60a5fa",
  "#f472b6",
  "#2dd4bf",
  "#f97316",
  "#84cc16",
];

const browserAppNames = new Set([
  "browser",
  "brave",
  "chrome",
  "firefox",
  "iexplore",
  "msedge",
  "opera",
  "safari",
]);

function cleanWindowTitle(value?: string | null) {
  return String(value || "")
    .replace(/\s+-\s+(Google Chrome|Microsoft Edge|Mozilla Firefox|Brave|Opera)$/i, "")
    .trim();
}

function activityDisplayName(item: SessionUsageRow) {
  const appName = item.appName.trim();
  const windowTitle = cleanWindowTitle(item.windowTitle);
  const normalizedAppName = appName.toLowerCase();

  if (browserAppNames.has(normalizedAppName) && windowTitle && windowTitle.toLowerCase() !== normalizedAppName) {
    return windowTitle;
  }

  return appName || windowTitle || "Unknown app";
}

function formatFullDateTime(value?: string | null) {
  if (!value) {
    return "--";
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function labelFromEnum(value?: string) {
  if (!value) {
    return "Not Marked";
  }

  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function statusStyle(status: string) {
  if (status === "Active" || status === "Present" || status === "Ready") {
    return "bg-emerald-300/10 text-emerald-200 ring-emerald-300/20";
  }

  if (status === "Idle" || status === "Late" || status === "Half Day" || status === "Review") {
    return "bg-amber-300/10 text-amber-200 ring-amber-300/20";
  }

  return "bg-slate-300/10 text-slate-300 ring-white/10";
}

function usageCategoryStyle(category: string) {
  if (category === "UNPRODUCTIVE") {
    return "bg-rose-300/10 text-rose-200 ring-rose-300/20";
  }

  if (category === "NETWORK") {
    return "bg-violet-300/10 text-violet-200 ring-violet-300/20";
  }

  if (category === "IDLE" || category === "BREAK") {
    return "bg-amber-300/10 text-amber-200 ring-amber-300/20";
  }

  if (category === "PRODUCTIVE") {
    return "bg-emerald-300/10 text-emerald-200 ring-emerald-300/20";
  }

  return "bg-slate-300/10 text-slate-300 ring-white/10";
}

function TableSection({ title, children, href }: TableSectionProps) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/6 p-5 shadow-2xl shadow-black/20 backdrop-blur-xl">
      <div className="mb-5 flex items-center justify-between gap-4">
        <h2 className="text-base font-semibold text-white">{title}</h2>
      </div>
      {children}
      {href && (
        <div className="mt-5 flex justify-end">
          <Link
            className="rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-4 py-2 text-sm font-semibold text-cyan-100 hover:bg-cyan-300/15"
            href={href}
            onClick={() => allowProtectedNavigation(href)}
          >
            See more
          </Link>
        </div>
      )}
    </section>
  );
}

function visibleRows<T>(rows: T[], previewLimit?: number) {
  return typeof previewLimit === "number" ? rows.slice(0, previewLimit) : rows;
}

export function EmployeeSnapshotTable({
  href,
  previewLimit,
  rows = [],
}: {
  href?: string;
  previewLimit?: number;
  rows?: EmployeeSnapshotRow[];
}) {
  const sessionRows = Array.from(
    new Map(rows.map((item) => [item.sessionId ?? `employee-${item.userId}`, item])).values(),
  );
  const rowsToShow = visibleRows(sessionRows, previewLimit);

  return (
    <TableSection href={href} title="Employee Snapshot">
      <div className="overflow-x-auto">
        <table className="min-w-[860px] text-left text-sm">
          <thead className="text-xs uppercase text-slate-400">
            <tr className="border-b border-white/10">
              <th className="px-3 py-3 font-semibold">Employee</th>
              <th className="px-3 py-3 font-semibold">Clock In</th>
              <th className="px-3 py-3 font-semibold">Clock Out</th>
              <th className="px-3 py-3 font-semibold">Status</th>
              <th className="px-3 py-3 font-semibold">Total Idle</th>
              <th className="px-3 py-3 font-semibold">Break Time</th>
              <th className="px-3 py-3 font-semibold">Productive Time</th>
              <th className="px-3 py-3 font-semibold">Unproductive Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {rowsToShow.length > 0 ? (
              rowsToShow.map((item) => (
                <tr key={item.sessionId ?? `employee-${item.userId}`}>
                  <td className="px-3 py-3">
                    <p className="font-semibold text-white">{item.employeeName}</p>
                    <p className="mt-0.5 text-xs text-slate-400">{item.employeeCode}</p>
                  </td>
                  <td className="px-3 py-3 text-slate-300">{formatFullDateTime(item.loginAt)}</td>
                  <td className="px-3 py-3 text-slate-300">
                    {item.logoutAt ? formatFullDateTime(item.logoutAt) : "--"}
                  </td>
                  <td className="px-3 py-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${statusStyle(item.sessionLabel)}`}>
                      {item.sessionLabel}
                    </span>
                  </td>
                  <td className="px-3 py-3 font-semibold text-amber-100">{formatMinutes(item.idleMinutes)}</td>
                  <td className="px-3 py-3 font-semibold text-blue-100">{formatMinutes(item.breakMinutes)}</td>
                  <td className="px-3 py-3 font-semibold text-emerald-100">{formatMinutes(item.productiveMinutes)}</td>
                  <td className="px-3 py-3 font-semibold text-rose-100">{formatMinutes(item.unproductiveMinutes)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="px-3 py-8 text-center text-slate-400" colSpan={8}>
                  No session usage recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </TableSection>
  );
}

export function AppWebsiteActivityTable({
  href,
  previewLimit,
  rows = [],
}: {
  href?: string;
  previewLimit?: number;
  rows?: SessionUsageRow[];
}) {
  const actualUsageRows = rows.filter(
    (item) =>
      item.appDurationSeconds > 0 &&
      !["UNRECORDED", "IDLE", "BREAK", "NETWORK"].includes(item.category) &&
      item.appName.trim().length > 0,
  );
  const usageByApp = new Map<string, number>();

  for (const item of actualUsageRows) {
    const name = activityDisplayName(item);
    usageByApp.set(name, (usageByApp.get(name) || 0) + item.appDurationSeconds);
  }

  const totalSeconds = Array.from(usageByApp.values()).reduce((sum, seconds) => sum + seconds, 0);
  const chartRows = Array.from(usageByApp.entries())
    .map(([name, seconds]) => ({
      name,
      seconds,
      percentage: totalSeconds > 0 ? Math.round((seconds / totalSeconds) * 100) : 0,
    }))
    .sort((first, second) => second.seconds - first.seconds);
  const rowsToShow = visibleRows(chartRows, previewLimit);

  return (
    <TableSection href={href} title="App/Website Activity">
      {chartRows.length > 0 ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(260px,0.9fr)_minmax(0,1.1fr)] lg:items-center">
          <div className="h-80 min-h-72">
            <ResponsiveContainer height="100%" width="100%">
              <PieChart>
                <Pie
                  data={chartRows}
                  dataKey="seconds"
                  innerRadius={58}
                  nameKey="name"
                  outerRadius={108}
                  paddingAngle={3}
                >
                  {chartRows.map((entry, index) => (
                    <Cell
                      fill={usageChartColors[index % usageChartColors.length]}
                      key={entry.name}
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#ffffff",
                    border: "1px solid #cbd5e1",
                    color: "#020617",
                  }}
                  formatter={(value, name, item) => [
                    `${formatSeconds(Number(value))} (${item.payload.percentage}%)`,
                    name,
                  ]}
                  labelStyle={{ color: "#020617" }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="grid max-h-80 gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
            {rowsToShow.map((item, index) => (
              <div
                className="rounded-xl border border-white/10 bg-white/5 p-3"
                key={item.name}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: usageChartColors[index % usageChartColors.length] }}
                    />
                    <p className="truncate text-sm font-semibold text-white">{item.name}</p>
                  </div>
                  <span className="text-sm font-semibold text-cyan-100">{item.percentage}%</span>
                </div>
                <p className="mt-2 text-xs font-medium text-slate-400">{formatSeconds(item.seconds)}</p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-8 text-center text-sm text-slate-400">
          No app or website activity recorded yet.
        </div>
      )}
    </TableSection>
  );
}

export function SessionUsageTables({
  appWebsiteRows,
  rows = [],
}: {
  appWebsiteRows?: SessionUsageRow[];
  rows?: SessionUsageRow[];
}) {
  return (
    <div className="space-y-6">
      <EmployeeSnapshotTable
        href="/dashboard/employee-snapshot"
        previewLimit={5}
        rows={rows}
      />
      <AppWebsiteActivityTable
        previewLimit={5}
        rows={appWebsiteRows ?? rows}
      />
    </div>
  );
}
