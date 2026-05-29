"use client";

import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, CalendarDays, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { allowProtectedNavigation, apiRequest, canOpenProtectedRoute, clearAuth, getStoredUser, isEmployeeAccount } from "@/lib/api";

function todayInputValue() {
  const today = new Date();
  const offsetToday = new Date(today.getTime() - today.getTimezoneOffset() * 60 * 1000);
  return offsetToday.toISOString().slice(0, 10);
}

function daysBetweenDates(fromDate: string, toDate: string) {
  if (!fromDate || !toDate) {
    return 0;
  }

  const start = new Date(`${fromDate}T00:00:00`);
  const end = new Date(`${toDate}T00:00:00`);
  const difference = end.getTime() - start.getTime();

  if (difference < 0) {
    return 0;
  }

  return Math.floor(difference / (24 * 60 * 60 * 1000)) + 1;
}

export default function LeaveRequestPage() {
  const router = useRouter();
  const [type, setType] = useState("SICK");
  const [reason, setReason] = useState("");
  const [fromDate, setFromDate] = useState(todayInputValue);
  const [toDate, setToDate] = useState(todayInputValue);
  const [isSending, setIsSending] = useState(false);
  const days = daysBetweenDates(fromDate, toDate);

  useEffect(() => {
    if (fromDate && toDate && fromDate > toDate) {
      setToDate(fromDate);
    }
  }, [fromDate, toDate]);

  useEffect(() => {
    const user = getStoredUser();

    if (!canOpenProtectedRoute("/employee/leave")) {
      clearAuth();
      router.replace("/login");
      return;
    }

    if (!isEmployeeAccount(user)) {
      allowProtectedNavigation("/dashboard");
      router.replace("/dashboard");
    }
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!reason.trim() || days <= 0) {
      toast.error("Reason and valid leave dates are required");
      return;
    }

    setIsSending(true);

    try {
      await apiRequest("/api/leave-requests", {
        method: "POST",
        body: JSON.stringify({
          reason: reason.trim(),
          days,
          type,
        }),
      });

      toast.success("Leave request sent to admin");
      allowProtectedNavigation("/employee");
      router.push("/employee");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send leave request");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#020617] px-6 py-10 text-white">
      <div className="absolute left-[-10%] top-[-10%] h-[500px] w-[500px] rounded-full bg-blue-600/20 blur-3xl" />
      <div className="absolute bottom-[-20%] right-[-10%] h-[500px] w-[500px] rounded-full bg-violet-600/20 blur-3xl" />

      <section className="relative z-10 mx-auto max-w-3xl">
        <button
          className="mb-8 flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/6 px-3 text-sm font-semibold text-slate-300 hover:bg-white/10"
          onClick={() => {
            allowProtectedNavigation("/employee");
            router.push("/employee");
          }}
          type="button"
        >
          <ArrowLeft size={17} />
          Back
        </button>

        <div className="rounded-[32px] border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur-2xl">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-400/15 text-cyan-300">
              <CalendarDays size={28} />
            </div>
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-200">
                Leave Request
              </p>
              <h1 className="mt-1 text-3xl font-semibold text-white">Request Time Off</h1>
            </div>
          </div>

          <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-300">Leave type</span>
              <select
                className="h-14 w-full rounded-2xl border border-white/10 bg-[#0f172a] px-4 text-white outline-none focus:ring-2 focus:ring-cyan-400/40"
                onChange={(event) => setType(event.target.value)}
                value={type}
              >
                <option value="SICK">Sick Leave</option>
                <option value="CASUAL">Casual Leave</option>
                <option value="PERSONAL">Personal Leave</option>
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-300">Reason of leave</span>
              <textarea
                className="min-h-36 w-full resize-none rounded-2xl border border-white/10 bg-white/5 p-4 text-white outline-none placeholder:text-slate-500 focus:ring-2 focus:ring-cyan-400/40"
                onChange={(event) => setReason(event.target.value)}
                placeholder="Write your leave reason"
                required
                value={reason}
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-300">From</span>
                <input
                  className="h-14 w-full rounded-2xl border border-white/10 bg-white/5 px-4 text-white outline-none placeholder:text-slate-500 focus:ring-2 focus:ring-cyan-400/40 [color-scheme:dark]"
                  onChange={(event) => setFromDate(event.target.value)}
                  required
                  type="date"
                  value={fromDate}
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-300">To</span>
                <input
                  className="h-14 w-full rounded-2xl border border-white/10 bg-white/5 px-4 text-white outline-none placeholder:text-slate-500 focus:ring-2 focus:ring-cyan-400/40 [color-scheme:dark]"
                  min={fromDate}
                  onChange={(event) => setToDate(event.target.value)}
                  required
                  type="date"
                  value={toDate}
                />
              </label>
            </div>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-300">Days</span>
              <input
                className="h-14 w-full rounded-2xl border border-white/10 bg-white/5 px-4 text-white outline-none"
                readOnly
                type="number"
                value={days}
              />
            </label>

            <button
              className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-cyan-300 font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:opacity-60"
              disabled={isSending}
              type="submit"
            >
              {isSending ? "Sending..." : "Send Request"}
              <Send size={18} />
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
