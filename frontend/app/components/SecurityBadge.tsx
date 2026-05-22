"use client";

import { motion } from "framer-motion";
import { Lock } from "lucide-react";

export default function SecurityBadge() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="inline-flex items-center gap-3 rounded-full border border-white/8 bg-white/3 px-4 py-2 text-sm text-slate-100 backdrop-blur"
    >
      <span className="h-3 w-3 rounded-full bg-cyan-300 animate-pulse shadow-[0_0_12px_rgba(56,189,248,0.45)]" />
      <Lock size={14} className="text-slate-100" />
      Secure Login Portal
    </motion.div>
  );
}
