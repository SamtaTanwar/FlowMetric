"use client";

import Link from "next/link";
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
  if (seconds < 60) {
    return `${Math.max(0, Math.round(seconds))}s`;
  }

  return formatMinutes(Math.round(seconds / 60));
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

function activeSessionClockOutLabel(loginAt?: string | null) {
  const currentTime = new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());

  if (!loginAt) {
    return currentTime;
  }

  const activeMinutes = Math.max(
    0,
    Math.round((Date.now() - new Date(loginAt).getTime()) / 60000),
  );

  return `${currentTime} (${formatMinutes(activeMinutes)})`;
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
        <table className="min-w-[940px] text-left text-sm">
          <thead className="text-xs uppercase text-slate-400">
            <tr className="border-b border-white/10">
              <th className="px-3 py-3 font-semibold">Employee</th>
              <th className="px-3 py-3 font-semibold">Clock In</th>
              <th className="px-3 py-3 font-semibold">Clock Out</th>
              <th className="px-3 py-3 font-semibold">Status</th>
              <th className="px-3 py-3 font-semibold">Total Idle</th>
              <th className="px-3 py-3 font-semibold">Break</th>
              <th className="px-3 py-3 font-semibold">Productive</th>
              <th className="px-3 py-3 font-semibold">Unproductive</th>
              <th className="px-3 py-3 font-semibold">Network</th>
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
                    {item.logoutAt ? (
                      formatFullDateTime(item.logoutAt)
                    ) : item.sessionStatus === "ACTIVE" ? (
                      <span className="font-semibold text-cyan-100">
                        {activeSessionClockOutLabel(item.loginAt)}
                      </span>
                    ) : (
                      "--"
                    )}
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
                  <td className="px-3 py-3 font-semibold text-violet-100">{formatMinutes(item.networkInterruptionMinutes)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="px-3 py-8 text-center text-slate-400" colSpan={9}>
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
    (item) => item.category !== "UNRECORDED" && item.appDurationSeconds > 0,
  );
  const rowsToShow = visibleRows(actualUsageRows, previewLimit);

  return (
    <TableSection href={href} title="App/Website Activity">
      <div className="overflow-x-auto">
        <table className="min-w-[760px] text-left text-sm">
          <thead className="text-xs uppercase text-slate-400">
            <tr className="border-b border-white/10">
              <th className="px-3 py-3 font-semibold">Employee</th>
              <th className="px-3 py-3 font-semibold">Activity / App / Website</th>
              <th className="px-3 py-3 font-semibold">Window</th>
              <th className="px-3 py-3 font-semibold">Type</th>
              <th className="px-3 py-3 font-semibold">Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {rowsToShow.length > 0 ? (
              rowsToShow.map((item, index) => (
                <tr key={`${item.sessionId}-${item.appName}-${item.windowTitle}-${item.category}-${index}`}>
                  <td className="px-3 py-3">
                    <p className="font-semibold text-white">{item.employeeName}</p>
                    <p className="mt-0.5 text-xs text-slate-400">{item.employeeCode}</p>
                  </td>
                  <td className="max-w-[190px] px-3 py-3 font-medium text-white">
                    <span className="block truncate">{item.appName}</span>
                  </td>
                  <td className="max-w-[300px] px-3 py-3 text-slate-300">
                    <span className="block truncate">{item.windowTitle}</span>
                  </td>
                  <td className="px-3 py-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${usageCategoryStyle(item.category)}`}>
                      {labelFromEnum(item.category)}
                    </span>
                  </td>
                  <td className="px-3 py-3 font-semibold text-cyan-100">{formatSeconds(item.appDurationSeconds)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="px-3 py-8 text-center text-slate-400" colSpan={5}>
                  No app or website activity recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </TableSection>
  );
}

export function SessionUsageTables({ rows = [] }: { rows?: SessionUsageRow[] }) {
  return (
    <div className="space-y-6">
      <EmployeeSnapshotTable
        href="/dashboard/employee-snapshot"
        previewLimit={5}
        rows={rows}
      />
      <AppWebsiteActivityTable
        href="/dashboard/app-website-activity"
        previewLimit={5}
        rows={rows}
      />
    </div>
  );
}
