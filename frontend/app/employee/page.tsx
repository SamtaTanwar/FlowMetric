"use client";

import {
  Coffee,
  LogIn,
  LogOut,
  Sparkles,
  BarChart3,
} from "lucide-react";

import { useEffect , useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

export default function EmployeeDashboard() {
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
  const router = useRouter();

  const productiveSeconds = Math.max(0, elapsedSeconds - breakSeconds - idleSeconds);
  const productivityPercent = elapsedSeconds
    ? Math.min(100, Math.round((productiveSeconds / elapsedSeconds) * 100))
    : 0;

  useEffect(() => {
  let interval: NodeJS.Timeout;

  if (isTracking && !isOnBreak) {
    interval = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
  }

  return () => clearInterval(interval);
}, [isTracking, isOnBreak]);

function formatTime(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);

  const minutes = Math.floor((totalSeconds % 3600) / 60);

  const seconds = totalSeconds % 60;

  return `${String(hours).padStart(2, "0")}h ${String(
    minutes
  ).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
}

useEffect(() => {
  async function restoreSession() {
    try {
      const token = localStorage.getItem("ewtpma_token");

      const response = await fetch(
        "http://localhost:5000/api/tracking/active-session",
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await response.json();

      if (!data.activeSession) return;

      setIsTracking(true);

      setSessionId(data.activeSession.id);

      setIsOnBreak(data.isOnBreak);

    const loginTime = new Date(
  data.activeSession.loginAt
).getTime();

      const now = Date.now();

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
}, []);
  useEffect(() => {
  if (!isTracking || isOnBreak) return;

  const handleActivity = () => {
    setLastActivityTime(Date.now());

    if (isIdle) {
      const idleDurationSeconds = idleStartedAt
        ? Math.max(1, Math.round((Date.now() - idleStartedAt) / 1000))
        : 0;

      if (idleDurationSeconds > 0 && sessionId) {
        setIdleSeconds((prev) => prev + idleDurationSeconds);
        fetch("http://localhost:5000/api/tracking/event", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("ewtpma_token")}`,
          },
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
        fetch("http://localhost:5000/api/tracking/event", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("ewtpma_token")}`,
          },
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

    const token = localStorage.getItem("ewtpma_token");

    const response = await fetch(
      "http://localhost:5000/api/tracking/start",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      }
    );

    const data = await response.json();

    if (!response.ok) {
      toast.error(data.message || "Failed to start tracking");
      return;
    }

    setIsTracking(true);
    setSessionId(data.session.id);
    setElapsedSeconds(0);
    setBreakSeconds(0);
    setIdleSeconds(0);

    toast.success("Work session started successfully");
  } catch (error) {
    console.error(error);

    toast.error("Something went wrong");
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

    const token = localStorage.getItem("ewtpma_token");

    const response = await fetch(
      "http://localhost:5000/api/tracking/stop",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          sessionId,
          activeMinutes: Math.round(productiveSeconds / 60),
          idleMinutes: Math.round(idleSeconds / 60),
          breakMinutes: Math.round(breakSeconds / 60),
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      toast.error(data.message || "Failed to stop tracking");
      return;
    }

    setIsTracking(false);
    setSessionId(null);
    setElapsedSeconds(0);
setIsOnBreak(false);
    setBreakStartedAt(null);
    setBreakSeconds(0);
    setIdleSeconds(0);

    toast.success("Work session ended successfully");
  } catch (error) {
    console.error(error);

    toast.error("Something went wrong");
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

    const token = localStorage.getItem("ewtpma_token");

    const durationSeconds =
      isOnBreak && breakStartedAt
        ? Math.max(1, Math.round((Date.now() - breakStartedAt) / 1000))
        : undefined;

    const response = await fetch(
      "http://localhost:5000/api/tracking/event",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },

        body: JSON.stringify({
          sessionId,
          type: isOnBreak ? "BREAK_END" : "BREAK_START",
          durationSeconds,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      toast.error(data.message || "Failed to update break status");
      return;
    }

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

    toast.error("Something went wrong");
  }
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
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-400/20 bg-gradient-to-r from-blue-500/10 to-cyan-400/10 px-6 py-2 text-sm font-semibold tracking-wide text-blue-100 shadow-lg shadow-blue-500/10 backdrop-blur-2xl">
            <Sparkles
              size={16}
              className="text-cyan-300"
            />

            Employee Workspace
          </div>
          

          {/* Heading */}
          <div className="mt-8">
            <h1 className="text-5xl font-semibold tracking-[-0.04em] text-white md:text-6xl">
              Welcome back.
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
                {productivityPercent}%
              </h2>
            </div>
          </div>

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
  onClick={() => router.push("/employee/reports")}
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
    </main>
  );
}
