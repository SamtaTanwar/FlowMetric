"use client";

import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, CalendarDays, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { apiRequest, getStoredToken, getStoredUser } from "@/lib/api";

export default function LeaveRequestPage() {
  const router = useRouter();
  const [type, setType] = useState("SICK");
  const [reason, setReason] = useState("");
  const [days, setDays] = useState(1);
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    const token = getStoredToken();
    const user = getStoredUser();

    if (!token) {
      router.replace("/login");
      return;
    }

    if (user?.role !== "EMPLOYEE") {
      router.replace("/dashboard");
    }
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!reason.trim() || days <= 0) {
      toast.error("Reason and leave days are required");
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
          onClick={() => router.push("/employee")}
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

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-300">Days</span>
              <input
                className="h-14 w-full rounded-2xl border border-white/10 bg-white/5 px-4 text-white outline-none placeholder:text-slate-500 focus:ring-2 focus:ring-cyan-400/40"
                min={1}
                onChange={(event) => setDays(Number(event.target.value))}
                required
                type="number"
                value={days}
              />
            </label>

            {type === "SICK" && (
              <p className="rounded-2xl border border-cyan-300/20 bg-cyan-300/10 p-4 text-sm text-cyan-100">
                1 sick leave day is paid per month. Extra sick leave days in the same month are unpaid.
              </p>
            )}

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
