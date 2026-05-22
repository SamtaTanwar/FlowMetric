"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";

export default function InitialLoader({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setLoading(false), 1500);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <>
      <AnimatePresence>
        {loading && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-[#05070d] px-6 text-center text-white"
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: "easeInOut" }}
          >
            <div className="relative flex w-full max-w-xl flex-col items-center gap-6">
              <div className="relative flex h-44 w-44 items-center justify-center">
                <div className="loader-ring absolute" />
                <div className="loader-ring absolute loader-ring-2" />
                <div className="loader-ring absolute loader-ring-3" />
                <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-white/5 ring-1 ring-white/10 backdrop-blur">
                  <div className="h-4 w-4 rounded-full bg-cyan-300 shadow-[0_0_30px_rgba(56,189,248,0.65)] animate-pulse" />
                </div>
              </div>

              <div className="space-y-8">
                <p className="text-sm uppercase tracking-[0.38em] text-slate-300 pt-7">
                  Loading FlowMetric
                </p>
                <h1 className="text-4xl font-semibold tracking-tight text-white  md:text-5xl">
                  Workforce Intelligence
                </h1>
                <p className="max-w-md text-sm leading-7 text-slate-300 md:text-base">
                  Preparing your dashboard with live analytics, productivity insights, and a seamless experience.
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className={loading ? "pointer-events-none opacity-0" : "opacity-100 transition-opacity duration-500"}>
        {children}
      </div>
    </>
  );
}
