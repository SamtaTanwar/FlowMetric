
"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest, getStoredToken, getStoredUser } from "@/lib/api";

type ProductivityRecord = {
  id: number;
  loginMinutes: number;
  productiveMinutes: number;
  breakMinutes: number;
  idleMinutes: number;
};

type TrackingEvent = {
  id: number;
  type: string;
  createdAt: string;
};

export default function EmployeeReportsPage() {
  const router = useRouter();
  const [records, setRecords] = useState<ProductivityRecord[]>([]);
  const [events, setEvents] = useState<TrackingEvent[]>([]);
  const latestRecord = records[0];

  useEffect(() => {
  async function fetchProductivity() {
    try {
      const token = getStoredToken();
      const storedUser = getStoredUser();

      if (!token) {
        router.replace("/login");
        return;
      }

      if (!storedUser || storedUser.role !== "EMPLOYEE") {
        router.replace("/dashboard");
        return;
      }

      const data = await apiRequest<{ records: ProductivityRecord[] }>(
        `/api/productivity/employee/${storedUser.id}`,
      );

      setRecords(data.records || []);
      const latestSessionData = await apiRequest<{
        latestSession: { id: number } | null;
      }>("/api/tracking/latest-session");

if (!latestSessionData.latestSession) return;

const latestSessionId =
  latestSessionData.latestSession.id;

const eventsData = await apiRequest<{ events: TrackingEvent[] }>(
  `/api/tracking/events/${latestSessionId}`,
);

setEvents(eventsData.events || []);
   
    } catch (error) {
      console.error(error);
    }
  }

  fetchProductivity();
}, [router]);
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

    default:
      return {
        label: type,
        color: "bg-white",
      };
  }
}
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050816] text-white">
      {/* Background */}
      <div className="absolute left-[-10%] top-[-10%] h-[500px] w-[500px] rounded-full bg-blue-600/20 blur-3xl" />

      <div className="absolute bottom-[-20%] right-[-10%] h-[500px] w-[500px] rounded-full bg-violet-600/20 blur-3xl" />

      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_35%)]" />

      {/* Grid */}
      <div className="absolute inset-0 opacity-[0.05]">
        <div className="h-full w-full bg-[linear-gradient(to_right,#ffffff_1px,transparent_1px),linear-gradient(to_bottom,#ffffff_1px,transparent_1px)] bg-[size:70px_70px]" />
      </div>

      {/* Content */}
      <section className="relative z-10 px-6 py-10">
        <div className="mx-auto max-w-7xl">
          {/* Heading */}
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

          {/* Top Analytics */}
          <div className="mt-12 grid gap-6 md:grid-cols-4">
            {[
  {
    title: "Total Worked",
    value: latestRecord
      ? `${Math.floor(latestRecord.loginMinutes / 60)}h ${
          latestRecord.loginMinutes % 60
        }m`
      : "00h 00m",

    color: "from-cyan-400 to-blue-500",
  },

  {
    title: "Productive Time",
    value: latestRecord
      ? `${Math.floor(latestRecord.productiveMinutes / 60)}h ${
          latestRecord.productiveMinutes % 60
        }m`
      : "00h 00m",

    color: "from-emerald-400 to-green-500",
  },

  {
    title: "Break Time",
    value: latestRecord
      ? `${Math.floor(latestRecord.breakMinutes / 60)}h ${
          latestRecord.breakMinutes % 60
        }m`
      : "00h 00m",

    color: "from-yellow-400 to-orange-500",
  },

  {
    title: "Idle Time",
    value: latestRecord
      ? `${Math.floor(latestRecord.idleMinutes / 60)}h ${
          latestRecord.idleMinutes % 60
        }m`
      : "00h 00m",

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
                  className={`mt-5 bg-gradient-to-r ${card.color} bg-clip-text text-4xl font-semibold text-transparent`}
                >
                  {card.value}
                </h2>
              </div>
            ))}
          </div>

          {/* Activity Timeline */}
          <div className="mt-12 rounded-[32px] border border-white/10 bg-white/5 p-8 backdrop-blur-2xl">
            <h2 className="text-2xl font-semibold text-white">
              Activity Timeline
            </h2>

            <div className="mt-8 space-y-6">
  {events.map((event) => {
    const details = getEventDetails(event.type);

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
            {new Date(event.createdAt).toLocaleTimeString(
              "en-IN",
              {
                hour: "numeric",
                minute: "2-digit",
                hour12: true,
                timeZone: "Asia/Kolkata",
              }
            )}
          </p>
        </div>
      </div>
    );
  })}
</div>
          </div>
        </div>
      </section>
    </main>
  );
}
