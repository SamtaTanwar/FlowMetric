"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { allowProtectedNavigation, apiRequest, canOpenProtectedRoute, clearAuth, getStoredUser } from "@/lib/api";

type ProductivityRecord = {
  id: number;
  loginMinutes: number;
  productiveMinutes: number;
  breakMinutes: number;
  idleMinutes: number;
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

function formatDuration(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  return `${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
}

function productiveSecondsWithBreakAllowance(totalSeconds: number, idleSeconds: number, breakSeconds: number) {
  const excessBreakSeconds = Math.max(0, breakSeconds - BREAK_ALLOWANCE_SECONDS);
  return Math.max(0, totalSeconds - idleSeconds - excessBreakSeconds);
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
  const [activeSession, setActiveSession] = useState<TrackingSession | null>(null);
  const [latestSession, setLatestSession] = useState<TrackingSession | null>(null);
  const [breakStartedAt, setBreakStartedAt] = useState<number | null>(null);
  const [idleStartedAt, setIdleStartedAt] = useState<number | null>(null);
  const [currentTimestamp, setCurrentTimestamp] = useState(() => Date.now());

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

        if (!storedUser || storedUser.role !== "EMPLOYEE") {
          allowProtectedNavigation("/dashboard");
          router.replace("/dashboard");
          return;
        }

        const [productivityData, activeSessionData, latestSessionData] = await Promise.all([
          apiRequest<{ records: ProductivityRecord[] }>(`/api/productivity/employee/${storedUser.id}`),
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

            <h1 className="mt-4 text-5xl font-semibold tracking-[-0.04em] text-white">
              Work Reports
            </h1>

            <p className="mt-4 max-w-2xl text-lg leading-8 text-slate-300">
              Monitor productivity, work activity, attendance insights and session analytics.
            </p>
          </div>

          <div className="mt-12 grid gap-6 md:grid-cols-4">
            {[
              {
                title: "Total Worked",
                value: formatDuration(metrics.totalSeconds),
                color: "from-cyan-400 to-blue-500",
              },
              {
                title: "Productive Time",
                value: formatDuration(metrics.productiveSeconds),
                color: "from-emerald-400 to-green-500",
              },
              {
                title: "Break Time",
                value: formatDuration(metrics.breakSeconds),
                color: "from-yellow-400 to-orange-500",
              },
              {
                title: "Idle Time",
                value: formatDuration(metrics.idleSeconds),
                color: "from-red-400 to-pink-500",
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
                  className={`mt-5 bg-gradient-to-r ${card.color} bg-clip-text text-3xl font-semibold text-transparent`}
                >
                  {card.value}
                </h2>
              </div>
            ))}
          </div>

          <div className="mt-12 rounded-[32px] border border-white/10 bg-white/5 p-8 backdrop-blur-2xl">
            <h2 className="text-2xl font-semibold text-white">
              Activity Timeline
            </h2>

            <div className="mt-8 space-y-6">
              {events.length ? (
                events.map((event) => {
                  const details = getEventDetails(event.type);
                  const duration = eventDurationLabel(events, event);

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
                          {duration ? ` • ${duration}` : ""}
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
