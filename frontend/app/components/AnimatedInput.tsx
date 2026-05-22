"use client";

import { motion } from "framer-motion";
import React, { InputHTMLAttributes, useState } from "react";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  icon?: React.ReactNode;
  isPassword?: boolean;
};

export default function AnimatedInput({
  label,
  icon,
  isPassword,
  ...props
}: Props) {
  const [focused, setFocused] = useState(false);
  const [show, setShow] = useState(false);

  return (
    <motion.label
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45 }}
      className="block"
    >
      <span className="mb-2 block text-base font-medium text-slate-300">
        {label}
      </span>

      <div
        className={`flex h-14 items-center gap-3 rounded-2xl border border-white/8 bg-white/3 px-4 backdrop-blur-xl transition-all duration-300 ${
          focused ? "ring-2 ring-cyan-400/40" : ""
        }`}
      >
        {icon && <div className="text-slate-300">{icon}</div>}

        <input
          {...props}
          className="min-w-0 flex-1 bg-transparent text-base text-white outline-none placeholder:text-slate-400"
          onFocus={(e) => {
            setFocused(true);
            props.onFocus?.(e as any);
          }}
          onBlur={(e) => {
            setFocused(false);
            props.onBlur?.(e as any);
          }}
          type={isPassword && show ? "text" : props.type}
        />

        {isPassword && (
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="text-slate-400"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <motion.path
                d={show ? "M3 3l18 18" : "M1 12c0 0 4-7 11-7s11 7 11 7-4 7-11 7S1 12 1 12z"}
                stroke="currentColor"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
      </div>
    </motion.label>
  );
}
