"use client";

import {
  Coffee,
  LogIn,
  LogOut,
  Sparkles,
  BarChart3,
  CalendarDays,
  Bell,
  X,
} from "lucide-react";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
  API_BASE_URL,
  apiRequest,
  allowProtectedNavigation,
  canOpenProtectedRoute,
  clearAuth,
  getStoredToken,
  getStoredUser,
  type StoredUser,
} from "@/lib/api";

type ActiveSessionResponse = {
  activeSession: {
    id: number;
    loginAt: string;
    breakMinutes?: number;
    idleMinutes?: number;
  } | null;
  isOnBreak: boolean;
  breakStartedAt?: string | null;
};

type TrackingSessionResponse = {
  message: string;
  session: {
    id: number;
    loginAt: string;
  };
};

type EmployeeNotification = {
  id: number;
  title: string;
  message: string;
  createdAt: string;
  isRead: boolean;
};

declare global {
  interface Window {
    desktopTracker?: {
      start(config: { apiBaseUrl: string; token: string; sessionId: number }): Promise<{ ok: boolean; status?: DesktopTrackerStatus }>;
      stop(): Promise<{ ok: boolean }>;
      status(): Promise<DesktopTrackerStatus>;
      captureNow(): Promise<DesktopTrackerStatus>;
    };
  }
}

const BREAK_ALLOWANCE_SECONDS = 45 * 60;

type DesktopTrackerStatus = {
  isRunning: boolean;
  lastUsage: { appName: string; windowTitle: string } | null;
  lastError: string;
  lastSentAt: string | null;
  lastResponseStatus: number | null;
};

export default function EmployeeDashboard() {
  const [currentUser, setCurrentUser] = useState<StoredUser | null>(null);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isTracking, setIsTracking] = useState(false);
  const [isOnBreak, setIsOnBreak] = useState(false);
  const [isIdle, setIsIdle] = useState(false);
  const [breakStartedAt, setBreakStartedAt] = useState<number | null>(null);
  const [breakSeconds, setBreakSeconds] = useState(0);
  const [idleSeconds, setIdleSeconds] = useState(0);
  const [idleStartedAt, setIdleStartedAt] = useState<number | null>(null);

  const [lastActivityTime, setLastActivityTime] =
  useState(() => Date.now());
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [currentTimestamp, setCurrentTimestamp] = useState(() => Date.now());
  const [lastProductivityPercent, setLastProductivityPercent] = useState<number | null>(null);
  const [notifications, setNotifications] = useState<EmployeeNotification[]>([]);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [markingNotificationId, setMarkingNotificationId] = useState<number | null>(null);
  const [trackerStatus, setTrackerStatus] = useState<DesktopTrackerStatus | null>(null);
  const [hasDesktopTracker, setHasDesktopTracker] = useState(false);
  const networkOfflineStartedAtRef = useRef<number | null>(null);
  const router = useRouter();

  const liveBreakSeconds =
    breakSeconds +
    (isOnBreak && breakStartedAt
      ? Math.max(0, Math.round((currentTimestamp - breakStartedAt) / 1000))
      : 0);
  const breakPenaltySeconds = Math.max(0, liveBreakSeconds - BREAK_ALLOWANCE_SECONDS);
  const activeSeconds = Math.max(0, elapsedSeconds - idleSeconds - liveBreakSeconds);
  const productiveSeconds = Math.max(0, elapsedSeconds - idleSeconds - breakPenaltySeconds);
  const productivityPercent = elapsedSeconds
    ? Math.min(100, Math.round((productiveSeconds / elapsedSeconds) * 100))
    : 0;
  const unreadCount = notifications.filter((item) => !item.isRead).length;

  useEffect(() => {
    setHasDesktopTracker(Boolean(window.desktopTracker));
  }, []);

  useEffect(() => {
    async function verifyEmployee() {
      const storedUser = getStoredUser();

      if (!canOpenProtectedRoute("/employee")) {
        clearAuth();
        router.replace("/login");
        return;
      }

      try {
        const response = await apiRequest<{ user: StoredUser }>("/api/auth/me");
        const user = response.user || storedUser;

        if (user?.role !== "EMPLOYEE") {
          allowProtectedNavigation("/dashboard");
          router.replace("/dashboard");
          return;
        }

        setCurrentUser(user);
        setIsAuthorized(true);
      } catch {
        clearAuth();
        router.replace("/login");
      }
    }

    verifyEmployee();
  }, [router]);

  useEffect(() => {
    async function loadNotifications() {
      try {
        const response = await apiRequest<{ notifications: EmployeeNotification[] }>("/api/notifications");
        setNotifications(response.notifications);
      } catch {
        setNotifications([]);
      }
    }

    if (currentUser) {
      loadNotifications();
    }
  }, [currentUser]);

  useEffect(() => {
  let interval: NodeJS.Timeout;

  if (isTracking) {
    interval = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
      setCurrentTimestamp(Date.now());
    }, 1000);
  }

  return () => clearInterval(interval);
}, [isTracking]);

function formatTime(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);

  const minutes = Math.floor((totalSeconds % 3600) / 60);

  const seconds = totalSeconds % 60;

  return `${String(hours).padStart(2, "0")}h ${String(
    minutes
  ).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
}

useEffect(() => {
  if (!isAuthorized) return;

  async function restoreSession() {
    try {
      const data = await apiRequest<ActiveSessionResponse>("/api/tracking/active-session");

      if (!data.activeSession) return;

      setIsTracking(true);

      setSessionId(data.activeSession.id);

      setIsOnBreak(data.isOnBreak);
      setBreakStartedAt(data.breakStartedAt ? new Date(data.breakStartedAt).getTime() : null);

    const loginTime = new Date(
  data.activeSession.loginAt
).getTime();

      const now = Date.now();
      setCurrentTimestamp(now);

      const diffSeconds = Math.floor(
        (now - loginTime) / 1000
      );

      setElapsedSeconds(diffSeconds);
      setBreakSeconds((data.activeSession.breakMinutes || 0) * 60);
      setIdleSeconds((data.activeSession.idleMinutes || 0) * 60);
    } catch (error) {
      console.error(error);
    }
  }

  restoreSession();
}, [isAuthorized]);

useEffect(() => {
  if (!isTracking || !sessionId) {
    return;
  }

  window.desktopTracker?.start({
    apiBaseUrl: API_BASE_URL,
    token: getStoredToken(),
    sessionId,
  })
    .then((result) => {
      setTrackerStatus(result.status ?? null);
      return window.desktopTracker?.captureNow();
    })
    .then((status) => {
      if (status) {
        setTrackerStatus(status);
      }
    })
    .catch((error) => {
      setTrackerStatus({
        isRunning: false,
        lastUsage: null,
        lastError: error instanceof Error ? error.message : "Desktop tracker failed to start",
        lastSentAt: null,
        lastResponseStatus: null,
      });
    });

  const statusInterval = window.setInterval(() => {
    window.desktopTracker?.status()
      .then(setTrackerStatus)
      .catch(() => null);
  }, 5000);

  return () => {
    window.clearInterval(statusInterval);
    window.desktopTracker?.stop().catch(() => null);
  };
}, [isTracking, sessionId]);

useEffect(() => {
  if (!isTracking || !sessionId) {
    return;
  }

  const recordNetworkInterruption = (startedAt: number, endedAt = Date.now()) => {
    const durationSeconds = Math.max(1, Math.round((endedAt - startedAt) / 1000));

    apiRequest("/api/tracking/event", {
      method: "POST",
      body: JSON.stringify({
        sessionId,
        type: "APP_USAGE",
        durationSeconds,
        appName: "Network interruption",
        windowTitle: "Offline / disconnected",
        metadata: {
          category: "NETWORK_INTERRUPTION",
          source: "browser-network-status",
        },
      }),
    }).catch(() => null);
  };

  const handleOffline = () => {
    if (!networkOfflineStartedAtRef.current) {
      networkOfflineStartedAtRef.current = Date.now();
    }
  };

  const handleOnline = () => {
    if (!networkOfflineStartedAtRef.current) {
      return;
    }

    recordNetworkInterruption(networkOfflineStartedAtRef.current);
    networkOfflineStartedAtRef.current = null;
  };

  if (!navigator.onLine) {
    handleOffline();
  }

  window.addEventListener("offline", handleOffline);
  window.addEventListener("online", handleOnline);

  return () => {
    window.removeEventListener("offline", handleOffline);
    window.removeEventListener("online", handleOnline);
  };
}, [isTracking, sessionId]);

useEffect(() => {
  if (!isTracking || !sessionId || window.desktopTracker) {
    return;
  }

  const recordBrowserActivity = () => {
    if (document.visibilityState !== "visible") {
      return;
    }

    apiRequest("/api/tracking/event", {
      method: "POST",
      body: JSON.stringify({
        sessionId,
        type: "APP_USAGE",
        durationSeconds: 5,
        appName: "Browser",
        windowTitle: document.title || "Employee dashboard",
        metadata: {
          category: "PRODUCTIVE",
          source: "browser-page-fallback",
          url: window.location.href,
        },
      }),
    }).catch(() => null);
  };

  recordBrowserActivity();
  const browserActivityInterval = window.setInterval(recordBrowserActivity, 5000);

  return () => {
    window.clearInterval(browserActivityInterval);
  };
}, [isTracking, sessionId]);

  useEffect(() => {
  if (!isTracking || isOnBreak) return;
  if (window.desktopTracker) return;

  const handleActivity = () => {
    setLastActivityTime(Date.now());

    if (isIdle) {
      const idleDurationSeconds = idleStartedAt
        ? Math.max(1, Math.round((Date.now() - idleStartedAt) / 1000))
        : 0;

      if (idleDurationSeconds > 0 && sessionId) {
        setIdleSeconds((prev) => prev + idleDurationSeconds);
        apiRequest("/api/tracking/event", {
          method: "POST",
          body: JSON.stringify({
            sessionId,
            type: "IDLE_END",
            durationSeconds: idleDurationSeconds,
          }),
        }).catch(() => null);
      }

      setIsIdle(false);
      setIdleStartedAt(null);

      console.log("USER ACTIVE AGAIN");
    }
  };

  window.addEventListener(
    "mousemove",
    handleActivity
  );

  window.addEventListener(
    "keydown",
    handleActivity
  );

  window.addEventListener(
    "click",
    handleActivity
  );

  const interval = setInterval(() => {
    const now = Date.now();

    const diff =
      now - lastActivityTime;

    const idleThreshold =
    
      5 * 60 * 1000;

    if (
      diff >= idleThreshold &&
      !isIdle
    ) {
      setIsIdle(true);
      setIdleStartedAt(Date.now());
      if (sessionId) {
        apiRequest("/api/tracking/event", {
          method: "POST",
          body: JSON.stringify({
            sessionId,
            type: "IDLE_START",
          }),
        }).catch(() => null);
      }

      console.log("USER IS IDLE");
    }
  }, 5000);

  return () => {
    window.removeEventListener(
      "mousemove",
      handleActivity
    );

    window.removeEventListener(
      "keydown",
      handleActivity
    );

    window.removeEventListener(
      "click",
      handleActivity
    );

    clearInterval(interval);
  };
}, [
  isTracking,
  isOnBreak,
  isIdle,
  lastActivityTime,
  idleStartedAt,
  sessionId,
]);
  async function handleClockIn() {
  try {
    setLoading(true);

    const data = await apiRequest<TrackingSessionResponse>("/api/tracking/start", {
      method: "POST",
    });

    setIsTracking(true);
    setSessionId(data.session.id);
    setElapsedSeconds(0);
    setBreakSeconds(0);
    setIdleSeconds(0);
    setCurrentTimestamp(Date.now());
    setLastProductivityPercent(null);

    toast.success("Work session started successfully");
  } catch (error) {
    console.error(error);

    toast.error(error instanceof Error ? error.message : "Something went wrong");
  } finally {
    setLoading(false);
  }
}
async function handleClockOut() {
  try {
    if (!sessionId) {
      toast.error("No active session found");
      return;
    }

    setLoading(true);

    await window.desktopTracker?.stop().catch(() => null);

    const result = await apiRequest<{ productivity?: { productivityPercent?: number } }>("/api/tracking/stop", {
      method: "POST",
      body: JSON.stringify({
        sessionId,
        activeMinutes: Math.round(activeSeconds / 60),
        idleMinutes: Math.round(idleSeconds / 60),
        breakMinutes: Math.round(liveBreakSeconds / 60),
      }),
    });

    setIsTracking(false);
    setSessionId(null);
    setElapsedSeconds(0);
    setIsOnBreak(false);
    setBreakStartedAt(null);
    setBreakSeconds(0);
    setIdleSeconds(0);
    setCurrentTimestamp(Date.now());
    setLastProductivityPercent(
      typeof result.productivity?.productivityPercent === "number"
        ? Math.round(result.productivity.productivityPercent)
        : null,
    );

    toast.success("Work session ended successfully");
  } catch (error) {
    console.error(error);

    toast.error(error instanceof Error ? error.message : "Something went wrong");
  } finally {
    setLoading(false);
  }
}
async function handleBreakToggle() {
  try {
    if (!sessionId) {
      toast.error("No active session");
      return;
    }

    const durationSeconds =
      isOnBreak && breakStartedAt
        ? Math.max(1, Math.round((Date.now() - breakStartedAt) / 1000))
        : undefined;

    await apiRequest("/api/tracking/event", {
      method: "POST",
      body: JSON.stringify({
        sessionId,
        type: isOnBreak ? "BREAK_END" : "BREAK_START",
        durationSeconds,
      }),
    });

    if (isOnBreak && durationSeconds) {
      setBreakSeconds((prev) => prev + durationSeconds);
      setBreakStartedAt(null);
    } else {
      setBreakStartedAt(Date.now());
    }

    setIsOnBreak(!isOnBreak);

    toast.success(
      isOnBreak
        ? "Work session resumed"
        : "Break mode activated"
    );
  } catch (error) {
    console.error(error);

    toast.error(error instanceof Error ? error.message : "Something went wrong");
  }
}

function handleLogout() {
  window.desktopTracker?.stop().catch(() => null);
  clearAuth();
  router.push("/login");
}

function openProtectedPage(path: string) {
  allowProtectedNavigation(path);
  router.push(path);
}

async function handleMarkAsRead(id: number) {
  setMarkingNotificationId(id);

  try {
    await apiRequest(`/api/notifications/${id}/read`, {
      method: "PATCH",
    });

    setNotifications((items) =>
      items.map((item) => (item.id === id ? { ...item, isRead: true } : item)),
    );
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Could not mark notification as read");
  } finally {
    setMarkingNotificationId(null);
  }
}

if (!isAuthorized) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#020617] px-6 text-center text-white">
      <div className="rounded-2xl border border-white/10 bg-white/6 p-6 shadow-2xl shadow-black/30 backdrop-blur-xl">
        <p className="text-sm font-medium text-slate-300">Checking session...</p>
      </div>
    </main>
  );
}

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#020617] text-white">
      {/* Background gradients */}
      <div className="absolute left-[-10%] top-[-10%] h-[500px] w-[500px] rounded-full bg-blue-600/20 blur-3xl" />
      <div className="absolute bottom-[-20%] right-[-10%] h-[500px] w-[500px] rounded-full bg-violet-600/20 blur-3xl" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_35%)]" />

      <section className="relative z-10 px-6 py-10">
        {/* Top Header */}
        <div className="mx-auto max-w-7xl">
          {/* Pill */}
          <div className="flex items-center justify-between gap-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-400/20 bg-gradient-to-r from-blue-500/10 to-cyan-400/10 px-6 py-2 text-sm font-semibold tracking-wide text-blue-100 shadow-lg shadow-blue-500/10 backdrop-blur-2xl">
              <Sparkles
                size={16}
                className="text-cyan-300"
              />

              Employee Workspace
            </div>

            <div className="flex items-center gap-2">
              <button
                className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/6 text-slate-300 hover:bg-white/10"
                onClick={() => setNotificationOpen(true)}
                type="button"
                aria-label="Open notifications"
              >
                <Bell size={17} />
                {unreadCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-cyan-300 px-1.5 text-xs font-bold text-slate-950">
                    {unreadCount}
                  </span>
                )}
              </button>

              <button
                className="flex h-10 items-center gap-2 rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-3 text-sm font-semibold text-cyan-100 hover:bg-cyan-300/15"
                onClick={() => openProtectedPage("/employee/leave")}
                type="button"
              >
                <CalendarDays size={17} />
                Leave
              </button>

              <button
                className="flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/6 px-3 text-sm font-semibold text-slate-300 hover:bg-white/10"
                onClick={handleLogout}
                type="button"
              >
                <LogOut size={17} />
                Logout
              </button>
            </div>
          </div>
          

          {/* Heading */}
          <div className="mt-8">
            <h1 className="text-5xl font-semibold tracking-[-0.04em] text-white md:text-6xl">
              Welcome back{currentUser ? `, ${currentUser.firstName}` : ""}.
            </h1>

            <p className="mt-4 max-w-2xl text-lg leading-8 text-slate-300">
              Track attendance, manage work activity and monitor productivity
              through your intelligent employee workspace.
            </p>
          </div>

           {/* Status Cards */}
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {/* Today's Status */}
            <div className="group rounded-[28px] border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur-2xl transition-all duration-300 hover:-translate-y-1 hover:border-green-400/30">
              <p className="text-sm font-medium text-slate-400">
                Today&apos;s Status
              </p>

              <div className="mt-5 flex items-center gap-3">
               <div
  className={`h-3 w-3 rounded-full ${
    isOnBreak
      ? "bg-yellow-400 animate-pulse"
      : isTracking
      ? "bg-green-400 animate-pulse"
      : "bg-red-400"
  }`}
/>

<h2
  className={`text-3xl font-semibold ${
    isOnBreak
      ? "text-yellow-400"
      : isTracking
      ? "text-green-400"
      : "text-red-400"
  }`}
>
  {isOnBreak
    ? "On Break"
    : isTracking
    ? "Active"
    : "Inactive"}
</h2>
            </div>
            </div>

       

            {/* Card */}
            <div className="group rounded-[28px] border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur-2xl transition-all duration-300 hover:-translate-y-1 hover:border-cyan-400/30">
              <p className="text-sm font-medium text-slate-400">
                Working Hours
              </p>

              <h2 className="mt-5 text-3xl font-semibold text-white">
                {formatTime(elapsedSeconds)}
              </h2>
            </div>

            {/* Card */}
            <div className="group rounded-[28px] border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur-2xl transition-all duration-300 hover:-translate-y-1 hover:border-violet-400/30">
              <p className="text-sm font-medium text-slate-400">
                Productivity
              </p>

              <h2 className="mt-5 text-3xl font-semibold bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent">
                {isTracking
                  ? `${productivityPercent}%`
                  : lastProductivityPercent !== null
                    ? `${lastProductivityPercent}%`
                    : "--"}
              </h2>
            </div>
          </div>

          {isTracking && hasDesktopTracker && (
            <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="font-semibold text-white">
                  App tracker: {trackerStatus?.isRunning ? "Running" : "Starting"}
                </p>
                <button
                  className="rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-3 py-2 text-xs font-semibold text-cyan-100 hover:bg-cyan-300/15"
                  onClick={() => window.desktopTracker?.captureNow().then(setTrackerStatus)}
                  type="button"
                >
                  Capture now
                </button>
              </div>
              <p className="mt-2">
                Last app: {trackerStatus?.lastUsage
                  ? `${trackerStatus.lastUsage.appName} - ${trackerStatus.lastUsage.windowTitle}`
                  : "Waiting for active window"}
              </p>
              <p className="mt-1">
                Backend: {trackerStatus?.lastResponseStatus ?? "--"}
                {trackerStatus?.lastSentAt ? ` at ${new Date(trackerStatus.lastSentAt).toLocaleTimeString("en-IN")}` : ""}
              </p>
              {trackerStatus?.lastError && (
                <p className="mt-1 text-amber-200">{trackerStatus.lastError}</p>
              )}
            </div>
          )}

                           {/* Action Panel */}
          <div
            className={`mt-12 grid gap-6 ${
              isTracking ? "md:grid-cols-3" : "md:grid-cols-2"
            }`}
          >
            {/* Clock In / Clock Out */}
            <button
              onClick={isTracking ? handleClockOut : handleClockIn}
              disabled={loading}
              className={`group relative w-full overflow-hidden rounded-[32px] border p-8 text-left backdrop-blur-2xl transition-all duration-300 hover:-translate-y-1 ${
                isTracking
                  ? "border-red-400/20 bg-red-500/10 hover:border-red-400/40 hover:bg-red-500/15"
                  : "border-green-400/20 bg-green-500/10 hover:border-green-400/40 hover:bg-green-500/15"
              }`}
            >
              <div
                className={`absolute right-[-30px] top-[-30px] h-32 w-32 rounded-full blur-3xl transition-all duration-500 group-hover:scale-150 ${
                  isTracking ? "bg-red-400/10" : "bg-green-400/10"
                }`}
              />

              <div className="relative z-10">
                <div
                  className={`flex h-16 w-16 items-center justify-center rounded-2xl ${
                    isTracking
                      ? "bg-red-400/15 text-red-300"
                      : "bg-green-400/15 text-green-300"
                  }`}
                >
                  {isTracking ? (
                    <LogOut size={32} />
                  ) : (
                    <LogIn size={32} />
                  )}
                </div>

                <h2 className="mt-8 text-2xl font-semibold text-white">
                  {isTracking ? "Clock Out" : "Clock In"}
                </h2>

                <p className="mt-3 text-sm leading-7 text-slate-300">
                  {isTracking
                    ? "End your work session and save today's activity logs."
                    : "Start your work session and begin activity tracking."}
                </p>
              </div>
            </button>

            {/* Break Mode */}
            {isTracking && (
  <button
    onClick={handleBreakToggle}
    disabled={loading}
    className={`group relative overflow-hidden rounded-[32px] border p-8 text-left backdrop-blur-2xl transition-all duration-300 hover:-translate-y-1 ${
      isOnBreak
        ? "border-cyan-400/20 bg-cyan-500/10 hover:border-cyan-400/40 hover:bg-cyan-500/15"
        : "border-yellow-400/20 bg-yellow-500/10 hover:border-yellow-400/40 hover:bg-yellow-500/15"
    }`}
  >
    <div
      className={`absolute right-[-30px] top-[-30px] h-32 w-32 rounded-full blur-3xl transition-all duration-500 group-hover:scale-150 ${
        isOnBreak ? "bg-cyan-400/10" : "bg-yellow-400/10"
      }`}
    />

    <div className="relative z-10">
      <div
        className={`flex h-16 w-16 items-center justify-center rounded-2xl ${
          isOnBreak
            ? "bg-cyan-400/15 text-cyan-300"
            : "bg-yellow-400/15 text-yellow-300"
        }`}
      >
        <Coffee size={32} />
      </div>

      <h2 className="mt-8 text-2xl font-semibold text-white">
        {isOnBreak ? "Resume Work" : "Break Mode"}
      </h2>

      <p className="mt-3 text-sm leading-7 text-slate-300">
        {isOnBreak
          ? "Resume your active work session and continue productivity tracking."
          : "Pause your active work session temporarily."}
      </p>
    </div>
  </button>
)}

                        {/* View Reports */}
            <button
  onClick={() => openProtectedPage("/employee/reports")}
  className="group relative overflow-hidden rounded-[32px] border border-blue-400/20 bg-blue-500/10 p-8 text-left backdrop-blur-2xl transition-all duration-300 hover:-translate-y-1 hover:border-blue-400/40 hover:bg-blue-500/15"
>
              <div className="absolute right-[-30px] top-[-30px] h-32 w-32 rounded-full bg-blue-400/10 blur-3xl transition-all duration-500 group-hover:scale-150" />

              <div className="relative z-10">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-400/15 text-blue-300">
                  <BarChart3 size={32} />
                </div>

                <h2 className="mt-8 text-2xl font-semibold text-white">
                  View Work Reports
                </h2>

                <p className="mt-3 text-sm leading-7 text-slate-300">
                  View attendance history, productivity insights and activity reports.
                </p>
              </div>
            </button>

          </div>
          </div>
      </section>

      {notificationOpen && (
        <div className="fixed inset-0 z-50">
          <button
            className="absolute inset-0 bg-black/50"
            onClick={() => setNotificationOpen(false)}
            type="button"
            aria-label="Close notifications"
          />

          <aside className="absolute right-0 top-0 h-full w-full max-w-md border-l border-white/10 bg-[#020617] p-6 shadow-2xl">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-white">Notifications</h2>
                <p className="mt-1 text-sm text-slate-400">
                  {unreadCount} unread update{unreadCount === 1 ? "" : "s"}
                </p>
              </div>

              <button
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/6 text-slate-300 hover:bg-white/10"
                onClick={() => setNotificationOpen(false)}
                type="button"
                aria-label="Close notifications"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-6 space-y-3 overflow-y-auto pr-1">
              {notifications.length ? (
                notifications.map((item) => (
                  <div
                    className={`rounded-2xl border p-4 ${
                      item.isRead
                        ? "border-white/10 bg-white/4"
                        : "border-cyan-300/20 bg-cyan-300/10"
                    }`}
                    key={item.id}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-white">{item.title}</p>
                        <p className="mt-1 text-sm text-slate-400">{item.message}</p>
                      </div>
                      {!item.isRead && (
                        <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-cyan-300" />
                      )}
                    </div>

                    {!item.isRead && (
                      <button
                        className="mt-4 rounded-xl border border-white/10 bg-white/6 px-3 py-2 text-sm font-semibold text-cyan-100 hover:bg-white/10 disabled:opacity-60"
                        disabled={markingNotificationId === item.id}
                        onClick={() => handleMarkAsRead(item.id)}
                        type="button"
                      >
                        {markingNotificationId === item.id ? "Marking..." : "Mark as read"}
                      </button>
                    )}
                  </div>
                ))
              ) : (
                <p className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-400">
                  No notifications yet.
                </p>
              )}
            </div>
          </aside>
        </div>
      )}
    </main>
  );
}
