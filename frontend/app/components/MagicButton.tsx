"use client";

import { motion } from "framer-motion";
import React from "react";

type MagicButtonProps = Omit<React.ComponentProps<typeof motion.button>, "children"> & {
  children: React.ReactNode;
  loading?: boolean;
};

export default function MagicButton({ children, loading = false, ...props }: MagicButtonProps) {
  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
      className="group relative overflow-hidden flex h-14 w-full items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-cyan-400 to-indigo-500 px-6 py-3 text-sm font-semibold text-black shadow-2xl"
      {...props}
    >
      <span className="absolute inset-0 opacity-40 bg-gradient-to-r from-white/5 via-white/2 to-white/5 transform -translate-x-32 group-hover:translate-x-0 transition-transform duration-700"></span>

      <span className="relative z-10 flex items-center gap-2">
        {loading ? (
          <svg className="h-5 w-5 animate-spin text-slate-800" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeDasharray="60" strokeDashoffset="0" fill="none" />
          </svg>
        ) : null}

        {children}
      </span>
    </motion.button>
  );
}
