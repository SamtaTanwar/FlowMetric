"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { allowProtectedNavigation, apiRequest, canOpenProtectedRoute, clearAuth, getStoredUser, isEmployeeAccount } from "@/lib/api";

type ProductivityRecord = {
  id: number;
  date: string;
  activeMinutes: number;
  loginMinutes: number;
  productiveMinutes: number;
  breakMinutes: number;
  idleMinutes: number;
  productivityPercent: number;
};

type AttendanceRecord = {
  id: number;
  date: string;
  status: string;
  loginAt?: string | null;
  logoutAt?: string | null;
  lateMinutes: number;
  overtimeMinutes: number;
  idleDeductionMinutes: number;
};

type WorkflowRecord = {
  id: number;
  title: string;
  status: string;
  priority: string;
  estimatedHours?: number | null;
  actualHours?: number | null;
  dueDate?: string | null;
  completedAt?: string | null;
  updatedAt: string;
};

type TrackingSession = {
  id: number;
  loginAt: string;
  logoutAt?: string | null;
  status?: string;
  activeMinutes?: number;
  idleMinutes?: number;
  breakMinutes?: number;
  productiveMinutes?: number;
};

type ActiveSessionResponse = {
  activeSession: TrackingSession | null;
  breakStartedAt?: string | null;
  idleStartedAt?: string | null;
  isOnBreak?: boolean;
  isIdle?: boolean;
};

type TrackingEvent = {
  id: number;
  type: string;
  createdAt: string;
  durationSeconds?: number | null;
};

const BREAK_ALLOWANCE_SECONDS = 45 * 60;
const REPORT_TIMELINE_EVENT_TYPES = new Set([
  "LOGIN",
  "LOGOUT",
  "BREAK_START",
  "BREAK_END",
  "IDLE_START",
  "IDLE_END",
]);

function formatDuration(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  return `${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
}

function formatMinutes(minutes: number) {
  return formatDuration(minutes * 60);
}

function formatDate(value?: string | null) {
  if (!value) {
    return "--";
  }

  return new Date(value).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}

function dateInputValue(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).formatToParts(value);
  const getPart = (type: string) => parts.find((part) => part.type === type)?.value || "";

  return `${getPart("year")}-${getPart("month")}-${getPart("day")}`;
}

function dateKey(value?: string | null) {
  if (!value) {
    return "";
  }

  return dateInputValue(new Date(value));
}

function formatTime(value?: string | null) {
  if (!value) {
    return "--";
  }

  return new Date(value).toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  });
}

function labelFromEnum(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function productiveSecondsWithBreakAllowance(totalSeconds: number, idleSeconds: number, breakSeconds: number) {
  const excessBreakSeconds = Math.max(0, breakSeconds - BREAK_ALLOWANCE_SECONDS);
  return Math.max(0, totalSeconds - idleSeconds - excessBreakSeconds);
}

function productivityPercentFromSeconds(productiveSeconds: number, totalSeconds: number) {
  if (totalSeconds <= 0) {
    return 0;
  }

  return Math.min(100, Math.round((productiveSeconds / totalSeconds) * 100));
}

function secondsFromEventPairs(
  events: TrackingEvent[],
  startType: string,
  endType: string,
  currentTimestamp: number,
) {
  let startedAt: number | null = null;
  let totalSeconds = 0;

  for (const event of events) {
    if (event.type === startType) {
      startedAt = new Date(event.createdAt).getTime();
    }

    if (event.type === endType && startedAt) {
      totalSeconds += event.durationSeconds
        ? Number(event.durationSeconds)
        : Math.max(
            0,
            Math.round((new Date(event.createdAt).getTime() - startedAt) / 1000),
          );
      startedAt = null;
    }
  }

  if (startedAt) {
    totalSeconds += Math.max(0, Math.round((currentTimestamp - startedAt) / 1000));
  }

  return totalSeconds;
}

function eventDurationLabel(events: TrackingEvent[], event: TrackingEvent) {
  if (event.type !== "BREAK_END" && event.type !== "IDLE_END") {
    return null;
  }

  if (event.durationSeconds) {
    return formatDuration(event.durationSeconds);
  }

  const startType = event.type === "BREAK_END" ? "BREAK_START" : "IDLE_START";
  const eventIndex = events.findIndex((item) => item.id === event.id);
  const startedAt = events
    .slice(0, eventIndex)
    .reverse()
    .find((item) => item.type === startType);

  if (!startedAt) {
    return null;
  }

  const seconds = Math.max(
    0,
    Math.round((new Date(event.createdAt).getTime() - new Date(startedAt.createdAt).getTime()) / 1000),
  );

  return formatDuration(seconds);
}

export default function EmployeeReportsPage() {
  const router = useRouter();
  const [records, setRecords] = useState<ProductivityRecord[]>([]);
  const [events, setEvents] = useState<TrackingEvent[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [workflowRecords, setWorkflowRecords] = useState<WorkflowRecord[]>([]);
  const [activeSession, setActiveSession] = useState<TrackingSession | null>(null);
  const [latestSession, setLatestSession] = useState<TrackingSession | null>(null);
  const [breakStartedAt, setBreakStartedAt] = useState<number | null>(null);
  const [idleStartedAt, setIdleStartedAt] = useState<number | null>(null);
  const [currentTimestamp, setCurrentTimestamp] = useState(() => Date.now());
  const [reportDate, setReportDate] = useState(() => dateInputValue());
  const [isReportCalendarOpen, setIsReportCalendarOpen] = useState(false);

  useEffect(() => {
    const allowEmployeeReturn = () => {
      allowProtectedNavigation("/employee");
    };

    window.addEventListener("pagehide", allowEmployeeReturn);
    window.addEventListener("popstate", allowEmployeeReturn);

    return () => {
      allowEmployeeReturn();
      window.removeEventListener("pagehide", allowEmployeeReturn);
      window.removeEventListener("popstate", allowEmployeeReturn);
    };
  }, []);

  useEffect(() => {
    let isCurrent = true;
    const hasRouteAccess = canOpenProtectedRoute("/employee/reports");

    async function fetchProductivity() {
      try {
        const storedUser = getStoredUser();

        if (!hasRouteAccess) {
          clearAuth();
          router.replace("/login");
          return;
        }

        if (!isEmployeeAccount(storedUser)) {
          allowProtectedNavigation("/dashboard");
          router.replace("/dashboard");
          return;
        }

        const [productivityData, attendanceData, workflowsData, activeSessionData, latestSessionData] = await Promise.all([
          apiRequest<{ records: ProductivityRecord[] }>(`/api/productivity/employee/${storedUser.id}?all=true`),
          apiRequest<{ records: AttendanceRecord[] }>(`/api/attendance?userId=${storedUser.id}&all=true`),
          apiRequest<{ workflows: WorkflowRecord[] }>("/api/workflows"),
          apiRequest<ActiveSessionResponse>("/api/tracking/active-session"),
          apiRequest<{ latestSession: TrackingSession | null }>("/api/tracking/latest-session"),
        ]);

        if (!isCurrent) {
          return;
        }

        const sessionForEvents = activeSessionData.activeSession || latestSessionData.latestSession;
        const eventsData = sessionForEvents
          ? await apiRequest<{ events: TrackingEvent[] }>(`/api/tracking/events/${sessionForEvents.id}`)
          : { events: [] };

        if (!isCurrent) {
          return;
        }

        setRecords(productivityData.records || []);
        setAttendanceRecords(attendanceData.records || []);
        setWorkflowRecords(workflowsData.workflows || []);
        setActiveSession(activeSessionData.activeSession);
        setLatestSession(latestSessionData.latestSession);
        setBreakStartedAt(
          activeSessionData.breakStartedAt ? new Date(activeSessionData.breakStartedAt).getTime() : null,
        );
        setIdleStartedAt(
          activeSessionData.idleStartedAt ? new Date(activeSessionData.idleStartedAt).getTime() : null,
        );
        setEvents(eventsData.events || []);
        setCurrentTimestamp(Date.now());
      } catch (error) {
        console.error(error);
      }
    }

    fetchProductivity();
    const refresh = setInterval(fetchProductivity, 5000);

    return () => {
      isCurrent = false;
      clearInterval(refresh);
    };
  }, [router]);

  useEffect(() => {
    const tick = setInterval(() => setCurrentTimestamp(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  const metrics = useMemo(() => {
    const session = activeSession || latestSession;

    if (session) {
      const endTimestamp = activeSession
        ? currentTimestamp
        : session.logoutAt
          ? new Date(session.logoutAt).getTime()
          : currentTimestamp;
      const totalSeconds = Math.max(0, Math.round((endTimestamp - new Date(session.loginAt).getTime()) / 1000));
      const breakSecondsFromEvents = secondsFromEventPairs(
        events,
        "BREAK_START",
        "BREAK_END",
        currentTimestamp,
      );
      const idleSecondsFromEvents = secondsFromEventPairs(
        events,
        "IDLE_START",
        "IDLE_END",
        currentTimestamp,
      );
      const breakSeconds = Math.max(
        (session.breakMinutes || 0) * 60,
        breakSecondsFromEvents ||
          (activeSession && breakStartedAt ? Math.max(0, Math.round((currentTimestamp - breakStartedAt) / 1000)) : 0),
      );
      const idleSeconds = Math.max(
        (session.idleMinutes || 0) * 60,
        idleSecondsFromEvents ||
          (activeSession && idleStartedAt ? Math.max(0, Math.round((currentTimestamp - idleStartedAt) / 1000)) : 0),
      );
      const productiveSeconds = activeSession
        ? productiveSecondsWithBreakAllowance(totalSeconds, idleSeconds, breakSeconds)
        : (session.productiveMinutes || 0) * 60;

      return {
        totalSeconds,
        productiveSeconds,
        breakSeconds,
        idleSeconds,
      };
    }

    const latestRecord = records[0];

    return {
      totalSeconds: (latestRecord?.loginMinutes || 0) * 60,
      productiveSeconds: (latestRecord?.productiveMinutes || 0) * 60,
      breakSeconds: (latestRecord?.breakMinutes || 0) * 60,
      idleSeconds: (latestRecord?.idleMinutes || 0) * 60,
    };
  }, [activeSession, breakStartedAt, currentTimestamp, events, idleStartedAt, latestSession, records]);

  const timelineEvents = useMemo(
    () => events.filter((event) => REPORT_TIMELINE_EVENT_TYPES.has(event.type)),
    [events],
  );

  const allTimeMetrics = useMemo(() => {
    const totalWorkedMinutes = records.reduce((sum, record) => sum + record.loginMinutes, 0);
    const productiveMinutes = records.reduce((sum, record) => sum + record.productiveMinutes, 0);
    const breakMinutes = records.reduce((sum, record) => sum + record.breakMinutes, 0);
    const idleMinutes = records.reduce((sum, record) => sum + record.idleMinutes, 0);
    const averageProductivity = records.length
      ? Math.round(records.reduce((sum, record) => sum + record.productivityPercent, 0) / records.length)
      : 0;
    const completedWorkflows = workflowRecords.filter((workflow) => workflow.status === "COMPLETED").length;
    const firstDates = [
      ...records.map((record) => record.date),
      ...attendanceRecords.map((record) => record.date),
      ...workflowRecords.map((workflow) => workflow.updatedAt),
    ]
      .map((value) => new Date(value).getTime())
      .filter((value) => Number.isFinite(value));
    const firstActivityAt = firstDates.length ? new Date(Math.min(...firstDates)).toISOString() : null;

    return {
      totalWorkedMinutes,
      productiveMinutes,
      breakMinutes,
      idleMinutes,
      averageProductivity,
      completedWorkflows,
      firstActivityAt,
    };
  }, [attendanceRecords, records, workflowRecords]);

  const dateReport = useMemo(() => {
    const liveProductivity =
      activeSession && dateKey(activeSession.loginAt) === reportDate
        ? {
            id: -activeSession.id,
            date: activeSession.loginAt,
            activeMinutes: Math.max(
              0,
              Math.round((metrics.totalSeconds - metrics.idleSeconds - metrics.breakSeconds) / 60),
            ),
            loginMinutes: Math.round(metrics.totalSeconds / 60),
            productiveMinutes: Math.round(metrics.productiveSeconds / 60),
            breakMinutes: Math.round(metrics.breakSeconds / 60),
            idleMinutes: Math.round(metrics.idleSeconds / 60),
            productivityPercent: productivityPercentFromSeconds(metrics.productiveSeconds, metrics.totalSeconds),
          }
        : null;
    const productivity = [
      ...records.filter((record) => dateKey(record.date) === reportDate),
      ...(liveProductivity ? [liveProductivity] : []),
    ];
    const attendance = attendanceRecords.filter((record) => dateKey(record.date) === reportDate);
    const workflows = workflowRecords.filter((workflow) => {
      return [workflow.updatedAt, workflow.completedAt, workflow.dueDate].some((value) => dateKey(value) === reportDate);
    });
    const totalWorkedMinutes = productivity.reduce((sum, record) => sum + record.loginMinutes, 0);
    const productiveMinutes = productivity.reduce((sum, record) => sum + record.productiveMinutes, 0);
    const breakMinutes = productivity.reduce((sum, record) => sum + record.breakMinutes, 0);
    const idleMinutes = productivity.reduce((sum, record) => sum + record.idleMinutes, 0);
    const averageProductivity = productivity.length
      ? Math.round(productivity.reduce((sum, record) => sum + record.productivityPercent, 0) / productivity.length)
      : 0;
    const completedWorkflows = workflows.filter((workflow) => workflow.status === "COMPLETED").length;

    return {
      productivity,
      attendance,
      workflows,
      totalWorkedMinutes,
      productiveMinutes,
      breakMinutes,
      idleMinutes,
      averageProductivity,
      completedWorkflows,
    };
  }, [activeSession, attendanceRecords, metrics, records, reportDate, workflowRecords]);

  function csvCell(value: unknown) {
    const text = value == null ? "" : String(value);
    return `"${text.replace(/"/g, '""')}"`;
  }

  function csvRow(values: unknown[]) {
    return values.map(csvCell).join(",");
  }

  function handleExportCsv() {
    const lines = [
      csvRow(["Employee Work Report"]),
      csvRow(["From", formatDate(allTimeMetrics.firstActivityAt)]),
      csvRow(["Generated At", new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })]),
      "",
      csvRow(["Summary"]),
      csvRow(["Total Worked", formatMinutes(allTimeMetrics.totalWorkedMinutes)]),
      csvRow(["Productive Time", formatMinutes(allTimeMetrics.productiveMinutes)]),
      csvRow(["Break Time", formatMinutes(allTimeMetrics.breakMinutes)]),
      csvRow(["Idle Time", formatMinutes(allTimeMetrics.idleMinutes)]),
      csvRow(["Average Productivity", `${allTimeMetrics.averageProductivity}%`]),
      csvRow(["Attendance Days", attendanceRecords.length]),
      csvRow(["Completed Workflows", `${allTimeMetrics.completedWorkflows}/${workflowRecords.length}`]),
      "",
      csvRow(["Attendance History"]),
      csvRow(["Date", "Status", "Clock In", "Clock Out", "Late Minutes", "Overtime Minutes", "Idle Deduction Minutes"]),
      ...attendanceRecords.map((record) =>
        csvRow([
          formatDate(record.date),
          labelFromEnum(record.status),
          formatTime(record.loginAt),
          formatTime(record.logoutAt),
          record.lateMinutes,
          record.overtimeMinutes,
          record.idleDeductionMinutes,
        ]),
      ),
      "",
      csvRow(["Productivity History"]),
      csvRow(["Date", "Worked", "Active", "Productive Time", "Break", "Idle", "Productivity"]),
      ...records.map((record) =>
        csvRow([
          formatDate(record.date),
          formatMinutes(record.loginMinutes),
          formatMinutes(record.activeMinutes),
          formatMinutes(record.productiveMinutes),
          formatMinutes(record.breakMinutes),
          formatMinutes(record.idleMinutes),
          `${Math.round(record.productivityPercent)}%`,
        ]),
      ),
      "",
      csvRow(["Workflow History"]),
      csvRow(["Title", "Status", "Priority", "Estimated Hours", "Actual Hours", "Due Date", "Completed At", "Last Updated"]),
      ...workflowRecords.map((workflow) =>
        csvRow([
          workflow.title,
          labelFromEnum(workflow.status),
          labelFromEnum(workflow.priority),
          workflow.estimatedHours ?? "",
          workflow.actualHours ?? "",
          formatDate(workflow.dueDate),
          formatDate(workflow.completedAt),
          formatDate(workflow.updatedAt),
        ]),
      ),
    ];

    const blob = new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `employee-work-report-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function handleExportDateCsv() {
    const lines = [
      csvRow(["Employee Date Wise Work Report"]),
      csvRow(["Date", formatDate(reportDate)]),
      csvRow(["Generated At", new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })]),
      "",
      csvRow(["Summary"]),
      csvRow(["Total Worked", formatMinutes(dateReport.totalWorkedMinutes)]),
      csvRow(["Productive Time", formatMinutes(dateReport.productiveMinutes)]),
      csvRow(["Break Time", formatMinutes(dateReport.breakMinutes)]),
      csvRow(["Idle Time", formatMinutes(dateReport.idleMinutes)]),
      csvRow(["Average Productivity", `${dateReport.averageProductivity}%`]),
      csvRow(["Attendance Records", dateReport.attendance.length]),
      csvRow(["Completed Workflows", `${dateReport.completedWorkflows}/${dateReport.workflows.length}`]),
      "",
      csvRow(["Attendance"]),
      csvRow(["Date", "Status", "Clock In", "Clock Out", "Late Minutes", "Overtime Minutes", "Idle Deduction Minutes"]),
      ...dateReport.attendance.map((record) =>
        csvRow([
          formatDate(record.date),
          labelFromEnum(record.status),
          formatTime(record.loginAt),
          formatTime(record.logoutAt),
          record.lateMinutes,
          record.overtimeMinutes,
          record.idleDeductionMinutes,
        ]),
      ),
      "",
      csvRow(["Productivity"]),
      csvRow(["Date", "Worked", "Active", "Productive Time", "Break", "Idle", "Productivity"]),
      ...dateReport.productivity.map((record) =>
        csvRow([
          formatDate(record.date),
          formatMinutes(record.loginMinutes),
          formatMinutes(record.activeMinutes),
          formatMinutes(record.productiveMinutes),
          formatMinutes(record.breakMinutes),
          formatMinutes(record.idleMinutes),
          `${Math.round(record.productivityPercent)}%`,
        ]),
      ),
      "",
      csvRow(["Workflow"]),
      csvRow(["Title", "Status", "Priority", "Estimated Hours", "Actual Hours", "Due Date", "Completed At", "Last Updated"]),
      ...dateReport.workflows.map((workflow) =>
        csvRow([
          workflow.title,
          labelFromEnum(workflow.status),
          labelFromEnum(workflow.priority),
          workflow.estimatedHours ?? "",
          workflow.actualHours ?? "",
          formatDate(workflow.dueDate),
          formatDate(workflow.completedAt),
          formatDate(workflow.updatedAt),
        ]),
      ),
    ];

    const blob = new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `employee-work-report-${reportDate}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function getEventDetails(type: string) {
    switch (type) {
      case "LOGIN":
        return {
          label: "Clocked In",
          color: "bg-green-400",
        };

      case "LOGOUT":
        return {
          label: "Clocked Out",
          color: "bg-red-400",
        };

      case "BREAK_START":
        return {
          label: "Break Started",
          color: "bg-yellow-400",
        };

      case "BREAK_END":
        return {
          label: "Break Ended",
          color: "bg-cyan-400",
        };

      case "IDLE_START":
        return {
          label: "Idle Started",
          color: "bg-orange-400",
        };

      case "IDLE_END":
        return {
          label: "Idle Ended",
          color: "bg-emerald-400",
        };

      default:
        return {
          label: type,
          color: "bg-white",
        };
    }
  }

  function handleBackToEmployeeDashboard() {
    allowProtectedNavigation("/employee");
    router.push("/employee");
  }

  function handleReportDateChange(date: string) {
    setReportDate(date);
    setIsReportCalendarOpen(false);
    requestAnimationFrame(() => {
      document.getElementById("date-wise-report")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050816] text-white">
      <div className="absolute left-[-10%] top-[-10%] h-[500px] w-[500px] rounded-full bg-blue-600/20 blur-3xl" />
      <div className="absolute bottom-[-20%] right-[-10%] h-[500px] w-[500px] rounded-full bg-violet-600/20 blur-3xl" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_35%)]" />

      <div className="absolute inset-0 opacity-[0.05]">
        <div className="h-full w-full bg-[linear-gradient(to_right,#ffffff_1px,transparent_1px),linear-gradient(to_bottom,#ffffff_1px,transparent_1px)] bg-[size:70px_70px]" />
      </div>

      <section className="relative z-10 px-6 py-10">
        <div className="mx-auto max-w-7xl">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-cyan-300">
              Analytics Dashboard
            </p>

            <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <h1 className="text-5xl font-semibold tracking-[-0.04em] text-white">
                Work Reports
              </h1>

              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="relative">
                  <button
                    aria-label="Select report date"
                    className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/6 text-cyan-100 hover:bg-white/10"
                    onClick={() => setIsReportCalendarOpen((open) => !open)}
                    type="button"
                  >
                    <CalendarDays size={18} />
                  </button>

                  {isReportCalendarOpen && (
                    <div className="absolute right-0 z-30 mt-3 w-64 rounded-lg border border-white/10 bg-slate-950 p-4 shadow-2xl shadow-black/40">
                      <label className="block">
                        <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                          Report Date
                        </span>
                        <input
                          className="h-10 w-full rounded-lg border border-white/10 bg-slate-900 px-3 text-sm font-semibold text-white outline-none [color-scheme:dark] focus:ring-2 focus:ring-cyan-300/40"
                          onChange={(event) => handleReportDateChange(event.target.value)}
                          type="date"
                          value={reportDate}
                        />
                      </label>
                      <button
                        className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-cyan-300 px-3 text-sm font-semibold text-slate-950 hover:bg-cyan-200"
                        onClick={() => {
                          handleExportDateCsv();
                          setIsReportCalendarOpen(false);
                        }}
                        type="button"
                      >
                        <CalendarDays size={16} />
                        Export Date Report
                      </button>
                    </div>
                  )}
                </div>

                <button
                  className="inline-flex h-11 items-center justify-center rounded-xl bg-cyan-300 px-4 text-sm font-semibold text-slate-950 hover:bg-cyan-200"
                  onClick={handleExportCsv}
                  type="button"
                >
                  Export Full History CSV
                </button>
                <button
                  className="inline-flex h-11 items-center justify-center rounded-xl border border-white/10 bg-white/6 px-4 text-sm font-semibold text-slate-200 hover:bg-white/10"
                  onClick={handleBackToEmployeeDashboard}
                  type="button"
                >
                  Back to dashboard
                </button>
              </div>
            </div>

            <p className="mt-4 max-w-2xl text-lg leading-8 text-slate-300">
              Full history from first recorded work activity to today.
            </p>
          </div>

          <div id="date-wise-report" className="mt-8 scroll-mt-8 rounded-lg border border-cyan-300/20 bg-cyan-300/8 p-5 backdrop-blur-2xl">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-200">
                  Date Wise Report
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-white">
                  Productivity, Attendance & Workflow Export
                </h2>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <button
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-white px-4 text-sm font-semibold text-slate-950 hover:bg-cyan-100"
                  onClick={handleExportDateCsv}
                  type="button"
                >
                  <CalendarDays size={17} />
                  Export Selected Date
                </button>
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {[
                {
                  title: "Worked",
                  value: formatMinutes(dateReport.totalWorkedMinutes),
                },
                {
                  title: "Productive Time",
                  value: formatMinutes(dateReport.productiveMinutes),
                },
                {
                  title: "Attendance",
                  value: `${dateReport.attendance.length} record${dateReport.attendance.length === 1 ? "" : "s"}`,
                },
                {
                  title: "Avg Productivity",
                  value: `${dateReport.averageProductivity}%`,
                },
                {
                  title: "Workflows",
                  value: `${dateReport.completedWorkflows}/${dateReport.workflows.length}`,
                },
              ].map((card) => (
                <div
                  className="rounded-lg border border-white/10 bg-slate-950/45 p-4"
                  key={card.title}
                >
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">{card.title}</p>
                  <p className="mt-2 text-lg font-semibold text-white">{card.value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-12 grid gap-6 md:grid-cols-3 xl:grid-cols-6">
            {[
              {
                title: "Since",
                value: formatDate(allTimeMetrics.firstActivityAt),
                color: "from-cyan-400 to-blue-500",
              },
              {
                title: "Total Worked",
                value: formatMinutes(allTimeMetrics.totalWorkedMinutes),
                color: "from-emerald-400 to-green-500",
              },
              {
                title: "Productive Time",
                value: formatMinutes(allTimeMetrics.productiveMinutes),
                color: "from-yellow-400 to-orange-500",
              },
              {
                title: "Attendance",
                value: `${attendanceRecords.length} days`,
                color: "from-red-400 to-pink-500",
              },
              {
                title: "Avg Productivity",
                value: `${allTimeMetrics.averageProductivity}%`,
                color: "from-violet-300 to-fuchsia-400",
              },
              {
                title: "Workflows",
                value: `${allTimeMetrics.completedWorkflows}/${workflowRecords.length}`,
                color: "from-sky-300 to-indigo-400",
              },
            ].map((card) => (
              <div
                key={card.title}
                className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-2xl"
              >
                <p className="text-sm text-slate-400">
                  {card.title}
                </p>

                <h2
                  className={`mt-5 bg-gradient-to-r ${card.color} bg-clip-text text-2xl font-semibold text-transparent`}
                >
                  {card.value}
                </h2>
              </div>
            ))}
          </div>

          <div className="mt-12 grid gap-6 xl:grid-cols-2">
            <div className="rounded-[32px] border border-white/10 bg-white/5 p-6 backdrop-blur-2xl">
              <h2 className="text-2xl font-semibold text-white">Attendance History</h2>
              <div className="mt-6 max-h-96 overflow-auto">
                <table className="w-full min-w-170 text-left text-sm">
                  <thead className="text-xs uppercase text-slate-400">
                    <tr className="border-b border-white/10">
                      <th className="py-3 pr-4">Date</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Clock In</th>
                      <th className="px-4 py-3">Clock Out</th>
                      <th className="py-3 pl-4">Late</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {attendanceRecords.map((record) => (
                      <tr key={record.id}>
                        <td className="py-3 pr-4 text-slate-200">{formatDate(record.date)}</td>
                        <td className="px-4 py-3 text-slate-300">{labelFromEnum(record.status)}</td>
                        <td className="px-4 py-3 text-slate-300">{formatTime(record.loginAt)}</td>
                        <td className="px-4 py-3 text-slate-300">{formatTime(record.logoutAt)}</td>
                        <td className="py-3 pl-4 text-slate-300">{record.lateMinutes}m</td>
                      </tr>
                    ))}
                    {attendanceRecords.length === 0 && (
                      <tr>
                        <td className="py-8 text-center text-slate-400" colSpan={5}>No attendance records yet.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-[32px] border border-white/10 bg-white/5 p-6 backdrop-blur-2xl">
              <h2 className="text-2xl font-semibold text-white">Productivity History</h2>
              <div className="mt-6 max-h-96 overflow-auto">
                <table className="w-full min-w-170 text-left text-sm">
                  <thead className="text-xs uppercase text-slate-400">
                    <tr className="border-b border-white/10">
                      <th className="py-3 pr-4">Date</th>
                      <th className="px-4 py-3">Worked</th>
                      <th className="px-4 py-3">Productive Time</th>
                      <th className="px-4 py-3">Idle</th>
                      <th className="py-3 pl-4">Score</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {records.map((record) => (
                      <tr key={record.id}>
                        <td className="py-3 pr-4 text-slate-200">{formatDate(record.date)}</td>
                        <td className="px-4 py-3 text-slate-300">{formatMinutes(record.loginMinutes)}</td>
                        <td className="px-4 py-3 text-slate-300">{formatMinutes(record.productiveMinutes)}</td>
                        <td className="px-4 py-3 text-slate-300">{formatMinutes(record.idleMinutes)}</td>
                        <td className="py-3 pl-4 font-semibold text-cyan-100">{Math.round(record.productivityPercent)}%</td>
                      </tr>
                    ))}
                    {records.length === 0 && (
                      <tr>
                        <td className="py-8 text-center text-slate-400" colSpan={5}>No productivity records yet.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="mt-12 rounded-[32px] border border-white/10 bg-white/5 p-6 backdrop-blur-2xl">
            <h2 className="text-2xl font-semibold text-white">Workflow History</h2>
            <div className="mt-6 max-h-96 overflow-auto">
              <table className="w-full min-w-220 text-left text-sm">
                <thead className="text-xs uppercase text-slate-400">
                  <tr className="border-b border-white/10">
                    <th className="py-3 pr-4">Workflow</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Priority</th>
                    <th className="px-4 py-3">Hours</th>
                    <th className="px-4 py-3">Due</th>
                    <th className="py-3 pl-4">Updated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {workflowRecords.map((workflow) => (
                    <tr key={workflow.id}>
                      <td className="py-3 pr-4 font-medium text-white">{workflow.title}</td>
                      <td className="px-4 py-3 text-slate-300">{labelFromEnum(workflow.status)}</td>
                      <td className="px-4 py-3 text-slate-300">{labelFromEnum(workflow.priority)}</td>
                      <td className="px-4 py-3 text-slate-300">
                        {workflow.actualHours ?? 0}/{workflow.estimatedHours ?? "--"}
                      </td>
                      <td className="px-4 py-3 text-slate-300">{formatDate(workflow.dueDate)}</td>
                      <td className="py-3 pl-4 text-slate-300">{formatDate(workflow.updatedAt)}</td>
                    </tr>
                  ))}
                  {workflowRecords.length === 0 && (
                    <tr>
                      <td className="py-8 text-center text-slate-400" colSpan={6}>No workflows assigned yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-12 rounded-[32px] border border-white/10 bg-white/5 p-8 backdrop-blur-2xl">
            <h2 className="text-2xl font-semibold text-white">
              Activity Timeline
            </h2>

            <div className="mt-8 space-y-6">
              {timelineEvents.length ? (
                timelineEvents.map((event) => {
                  const details = getEventDetails(event.type);
                  const duration = eventDurationLabel(timelineEvents, event);

                  return (
                    <div
                      key={event.id}
                      className="flex items-center gap-4"
                    >
                      <div
                        className={`h-3 w-3 rounded-full ${details.color}`}
                      />

                      <div>
                        <p className="font-medium text-white">
                          {details.label}
                        </p>

                        <p className="text-sm text-slate-400">
                          {new Date(event.createdAt).toLocaleTimeString("en-IN", {
                            hour: "numeric",
                            minute: "2-digit",
                            hour12: true,
                            timeZone: "Asia/Kolkata",
                          })}
                          {duration ? ` - ${duration}` : ""}
                        </p>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-sm text-slate-400">No activity logged yet.</p>
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
