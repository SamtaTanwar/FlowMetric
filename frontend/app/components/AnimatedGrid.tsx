"use client";

import React from "react";

export default function AnimatedGrid() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-grid-animated opacity-30" />
      <div className="absolute inset-0 bg-gradient-to-br from-[#001026] via-[#050816] to-[#000000] opacity-60 mix-blend-overlay" />
    </div>
  );
}
