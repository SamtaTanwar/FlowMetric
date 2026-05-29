"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import {
  allowProtectedNavigation,
  apiRequest,
  canOpenProtectedRoute,
  clearAuth,
  getStoredUser,
  isEmployeeAccount,
} from "@/lib/api";

type ProductivityRecord = {
  id: number;
  date: string;
  loginMinutes: number;
  productiveMinutes: number;
  idleMinutes: number;
  loginSeconds?: number;
  productiveSeconds?: number;
  idleSeconds?: number;
  productivityPercent: number;
};

type TrackingSession = {
  id: number;
  loginAt: string;
  logoutAt?: string | null;
  status?: string;
  idleMinutes?: number;
  breakMinutes?: number;
  productiveMinutes?: number;
};

type ActiveSessionResponse = {
  activeSession: TrackingSession | null;
  breakStartedAt?: string | null;
  idleStartedAt?: string | null;
};

type TrackingEvent = {
  id: number;
  type: string;
  createdAt: string;
  durationSeconds?: number | null;
  appName?: string | null;
  windowTitle?: string | null;
  metadata?: Record<string, unknown> | null;
};

const BREAK_ALLOWANCE_SECONDS = 45 * 60;
const UNPRODUCTIVE_USAGE_KEYWORDS = [
  "youtube",
  "netflix",
  "prime video",
  "hotstar",
  "disney+",
  "spotify",
  "wynk",
  "gaana",
  "jiosaavn",
  "vlc",
  "media player",
  "movie",
  "music",
  "song",
  "game",
  "gaming",
  "steam",
  "epic games",
  "valorant",
  "pubg",
  "free fire",
  "minecraft",
  "roblox",
  "facebook",
  "instagram",
  "whatsapp",
  "telegram",
  "twitter",
  "x.com",
  "reddit",
  "snapchat",
  "pinterest",
  "tiktok",
  "reels",
  "shorts",
  "shopping",
  "amazon",
  "flipkart",
  "myntra",
];

function formatDuration(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  return `${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
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
  return value ? dateInputValue(new Date(value)) : "";
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
        : Math.max(0, Math.round((new Date(event.createdAt).getTime() - startedAt) / 1000));
      startedAt = null;
    }
  }

  if (startedAt) {
    totalSeconds += Math.max(0, Math.round((currentTimestamp - startedAt) / 1000));
  }

  return totalSeconds;
}

function productivityPercent(productiveSeconds: number, totalSeconds: number) {
  if (totalSeconds <= 0) {
    return 0;
  }

  return Math.min(100, Math.round((productiveSeconds / totalSeconds) * 100));
}

function metadataText(metadata: TrackingEvent["metadata"], key: string) {
  const value = metadata?.[key];
  return typeof value === "string" ? value : "";
}

function appUsageCategory(event: TrackingEvent) {
  const explicitCategory = metadataText(event.metadata, "category").toLowerCase();

  if (explicitCategory.includes("network")) {
    return "NETWORK";
  }

  if (explicitCategory.includes("unproductive")) {
    return "UNPRODUCTIVE";
  }

  if (explicitCategory.includes("productive")) {
    return "PRODUCTIVE";
  }

  const text = [
    event.appName,
    event.windowTitle,
    metadataText(event.metadata, "url"),
    metadataText(event.metadata, "domain"),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return UNPRODUCTIVE_USAGE_KEYWORDS.some((keyword) => text.includes(keyword))
    ? "UNPRODUCTIVE"
    : "PRODUCTIVE";
}

export default function EmployeeReportsPage() {
  const router = useRouter();
  const [records, setRecords] = useState<ProductivityRecord[]>([]);
  const [events, setEvents] = useState<TrackingEvent[]>([]);
  const [activeSession, setActiveSession] = useState<TrackingSession | null>(null);
  const [latestSession, setLatestSession] = useState<TrackingSession | null>(null);
  const [breakStartedAt, setBreakStartedAt] = useState<number | null>(null);
  const [idleStartedAt, setIdleStartedAt] = useState<number | null>(null);
  const [currentTimestamp, setCurrentTimestamp] = useState(() => Date.now());

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

    async function fetchReports() {
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

        const [productivityData, activeSessionData, latestSessionData] = await Promise.all([
          apiRequest<{ records: ProductivityRecord[] }>(`/api/productivity/employee/${storedUser.id}?all=true`),
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

    fetchReports();
    const refresh = setInterval(fetchReports, 5000);

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
      const breakSecondsFromEvents = secondsFromEventPairs(events, "BREAK_START", "BREAK_END", endTimestamp);
      const idleSecondsFromEvents = secondsFromEventPairs(events, "IDLE_START", "IDLE_END", endTimestamp);
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
      const excessBreakSeconds = Math.max(0, breakSeconds - BREAK_ALLOWANCE_SECONDS);
      const unusefulAppSeconds = events
        .filter((event) => event.type === "APP_USAGE" && appUsageCategory(event) === "UNPRODUCTIVE")
        .reduce((sum, event) => sum + (event.durationSeconds || 0), 0);
      const unproductiveSeconds = excessBreakSeconds + unusefulAppSeconds + idleSeconds;
      const productiveSeconds = Math.max(0, totalSeconds - unproductiveSeconds);

      return {
        clockIn: session.loginAt,
        clockOut: activeSession ? null : session.logoutAt,
        totalSeconds,
        productiveSeconds,
        idleSeconds,
        unproductiveSeconds,
        excessBreakSeconds,
        unusefulAppSeconds,
        unusefulAppPercent: productivityPercent(unusefulAppSeconds, totalSeconds),
        productivity: productivityPercent(productiveSeconds, totalSeconds),
        idlePercent: productivityPercent(idleSeconds, totalSeconds),
      };
    }

    const latestRecord = records[0];
    const totalSeconds = latestRecord?.loginSeconds ?? (latestRecord?.loginMinutes || 0) * 60;
    const savedProductiveSeconds = latestRecord?.productiveSeconds ?? (latestRecord?.productiveMinutes || 0) * 60;
    const idleSeconds = latestRecord?.idleSeconds ?? (latestRecord?.idleMinutes || 0) * 60;
    const unproductiveSeconds = Math.max(0, totalSeconds - savedProductiveSeconds);
    const productiveSeconds = Math.max(0, totalSeconds - unproductiveSeconds);

    return {
      clockIn: null,
      clockOut: null,
      totalSeconds,
      productiveSeconds,
      idleSeconds,
      unproductiveSeconds,
      excessBreakSeconds: 0,
      unusefulAppSeconds: unproductiveSeconds,
      unusefulAppPercent: productivityPercent(unproductiveSeconds, totalSeconds),
      productivity: productivityPercent(productiveSeconds, totalSeconds),
      idlePercent: productivityPercent(idleSeconds, totalSeconds),
    };
  }, [activeSession, breakStartedAt, currentTimestamp, events, idleStartedAt, latestSession, records]);

  function handleBackToEmployeeDashboard() {
    allowProtectedNavigation("/employee");
    router.push("/employee");
  }

  const statusLabel = activeSession ? "Active" : "Inactive";
  const cards = [
    {
      title: "Status",
      value: statusLabel,
      tone: activeSession ? "from-emerald-300 to-green-400" : "from-rose-300 to-red-400",
    },
    {
      title: "Clock In",
      value: formatTime(metrics.clockIn),
      tone: "from-sky-300 to-cyan-400",
    },
    {
      title: "Clock Out",
      value: activeSession ? "Running" : formatTime(metrics.clockOut),
      tone: activeSession ? "from-lime-300 to-emerald-400" : "from-slate-300 to-slate-400",
    },
    {
      title: "Total Time",
      value: formatDuration(metrics.totalSeconds),
      tone: "from-blue-300 to-indigo-400",
    },
    {
      title: "Productivity",
      value: `${metrics.productivity}%`,
      tone: "from-cyan-300 to-blue-400",
    },
    {
      title: "Productive Time",
      value: formatDuration(metrics.productiveSeconds),
      tone: "from-emerald-300 to-teal-400",
    },
    {
      title: "Idle Time",
      value: `${formatDuration(metrics.idleSeconds)} (${metrics.idlePercent}%)`,
      tone: "from-amber-300 to-orange-400",
    },
    {
      title: "Unproductive Time",
      value: formatDuration(metrics.unproductiveSeconds),
      tone: "from-violet-300 to-fuchsia-400",
    },
    {
      title: "Unproductive Apps",
      value: `${metrics.unusefulAppPercent}%`,
      detail: formatDuration(metrics.unusefulAppSeconds),
      tone: "from-rose-300 to-pink-400",
    },
  ];

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050816] text-white">
      <div className="absolute left-[-10%] top-[-10%] h-[500px] w-[500px] rounded-full bg-blue-600/20 blur-3xl" />
      <div className="absolute bottom-[-20%] right-[-10%] h-[500px] w-[500px] rounded-full bg-violet-600/20 blur-3xl" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_35%)]" />

      <section className="relative z-10 px-6 py-10">
        <div className="mx-auto max-w-5xl">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-cyan-300">
                Work Reports
              </p>
              <h1 className="mt-4 text-5xl font-semibold tracking-[-0.04em] text-white">
                Today&apos;s Work
              </h1>
            </div>

            <button
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/6 px-4 text-sm font-semibold text-slate-200 hover:bg-white/10"
              onClick={handleBackToEmployeeDashboard}
              type="button"
            >
              <ArrowLeft size={17} />
              Back
            </button>
          </div>

          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map((card) => (
              <div
                className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-2xl"
                key={card.title}
              >
                <p className="text-sm text-slate-400">{card.title}</p>
                <h2 className={`mt-5 bg-gradient-to-r ${card.tone} bg-clip-text text-3xl font-semibold text-transparent`}>
                  {card.value}
                </h2>
                {"detail" in card && card.detail && (
                  <p className="mt-3 text-xs font-medium text-slate-400">{card.detail}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
