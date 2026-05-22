"use client";

import { useEffect } from "react";

export default function CursorEffects() {
  useEffect(() => {
    const root = document.documentElement;

    function move(e: MouseEvent) {
      const x = e.clientX;
      const y = e.clientY;
      root.style.setProperty("--cursor-x", `${x}px`);
      root.style.setProperty("--cursor-y", `${y}px`);
    }

    window.addEventListener("mousemove", move);
    return () => window.removeEventListener("mousemove", move);
  }, []);

  return (
    <>
      <div className="pointer-events-none fixed left-0 top-0 z-40 h-full w-full">
        <div className="spotlight" />
      </div>
    </>
  );
}
