"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import CountUp from "react-countup";

const IMG = {
  hero: "https://images.unsplash.com/photo-1600880292089-90a7e086ee0c?auto=format&fit=crop&w=1600&q=80",
  realtime: "https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=1600&q=80",
  analytics: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=1600&q=80",
  performance: "https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&w=1600&q=80",
  cta: "https://images.unsplash.com/photo-1573164713988-8665fc963095?auto=format&fit=crop&w=1600&q=80",
};

const FEATURES = [
  {
    title: "Real-Time Tracking",
    body: "Live employee activity, attendance, idle time and workflow engagement — visible the moment it happens.",
    accent: "bg-gradient-to-br from-cyan-400 to-cyan-600",
    image: IMG.realtime,
  },
  {
    title: "Productivity Analytics",
    body: "Beautiful dashboards reveal productivity trends, focus patterns and team efficiency over time.",
    accent: "bg-gradient-to-br from-blue-400 to-blue-600",
    image: IMG.analytics,
  },
  {
    title: "Workforce Visibility",
    body: "Operational visibility across teams, projects and departments — from a single intelligent dashboard.",
    accent: "bg-gradient-to-br from-indigo-400 to-indigo-600",
    image: IMG.performance,
  },
];
  

export default function HomePage() {
  return (
    <main className="relative min-h-screen overflow-x-hidden bg-[#05070d] text-white">
      {/* ====================== MOVING BACKGROUND ====================== */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="orb orb-3" />
        <div className="orb orb-4" />

{/* Animated Logo Video Background */}
<div className="absolute inset-0 overflow-hidden">
  <video
    autoPlay
    muted
    loop
    playsInline
    className="h-full w-full object-cover opacity-60"
  >
    <source
      src="/videos/logo-animation.mp4"
      type="video/mp4"
    />
  </video>

  {/* Dark Overlay */}
  <div className="absolute inset-0 bg-[#05070d]/45" />

  {/* Soft Gradient */}
  <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-[#05070d]/50" />
</div>

        <div
          className="absolute inset-0 opacity-[0.05] mix-blend-overlay"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.7'/></svg>\")",
          }}
        />
      </div>

      {/* ====================== STYLES ====================== */}
      <style jsx global>{`
        @keyframes float1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50%      { transform: translate(120px, 80px) scale(1.1); }
        }
        @keyframes float2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50%      { transform: translate(-140px, 60px) scale(1.15); }
        }
        @keyframes float3 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50%      { transform: translate(80px, -90px) scale(1.05); }
        }
        @keyframes float4 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50%      { transform: translate(-100px, -120px) scale(1.2); }
        }
        .orb {
          position: absolute;
          border-radius: 9999px;
          filter: blur(120px);
          will-change: transform;
        }
        .orb-1 {
          width: 600px; height: 600px;
          top: -150px; left: -150px;
          background: rgba(34, 211, 238, 0.30); /* cyan */
          animation: float1 16s ease-in-out infinite;
        }
        .orb-2 {
          width: 700px; height: 700px;
          top: 20%; right: -200px;
          background: rgba(59, 130, 246, 0.28); /* blue */
          animation: float2 20s ease-in-out infinite;
        }
        .orb-3 {
          width: 550px; height: 550px;
          bottom: -150px; left: 25%;
          background: rgba(99, 102, 241, 0.25); /* indigo */
          animation: float3 18s ease-in-out infinite;
        }
        .orb-4 {
          width: 480px; height: 480px;
          bottom: 30%; left: -120px;
          background: rgba(168, 85, 247, 0.22); /* purple */
          animation: float4 22s ease-in-out infinite;
        }

        @keyframes shimmer {
          0%   { background-position: 0% 50%; }
          100% { background-position: 200% 50%; }
        }
        .brand-text {
          background: linear-gradient(90deg, #67e8f9, #ffffff, #93c5fd, #67e8f9);
          background-size: 200% auto;
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          animation: shimmer 6s linear infinite;
        }
      `}</style>

      {/* ====================== NAV ====================== */}
      <nav className="relative z-20 flex items-center justify-between px-6 py-6 md:px-16">
        <Link href="/" className="text-xl font-semibold tracking-tight">
          <span className="brand-text">Flow</span>
          <span className="text-white">Metric</span>
        </Link>
        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="rounded-full border border-white/15 px-5 py-2 text-sm text-white transition hover:bg-white/10"
          >
            Login
          </Link>
          <Link
            href="/signup"
            className="rounded-full bg-white px-5 py-2 text-sm font-medium text-black transition hover:scale-105"
          >
            Get Started
          </Link>
        </div>
      </nav>

      {/* ====================== HERO ====================== */}
      <section className="relative z-10 flex min-h-[88vh] flex-col items-center justify-center px-6 text-center">
        <motion.span
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          className="mb-8 rounded-full border border-white/15 bg-white/[0.06] px-5 py-2 text-xs uppercase tracking-[0.3em] text-slate-200 backdrop-blur"
        >
          Workforce Intelligence Platform
        </motion.span>

        <motion.h1
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9 }}
          className="brand-text text-6xl font-semibold tracking-[-0.06em] md:text-[8rem]"
        >
          FlowMetric
        </motion.h1>

        <motion.h2
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.9 }}
          className="mt-6 max-w-4xl text-3xl font-medium leading-tight tracking-tight text-white md:text-5xl"
        >
          Build a more productive, accountable workforce.
        </motion.h2>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.9 }}
          className="mt-6 max-w-2xl text-lg leading-8 text-slate-200 md:text-xl"
        >
          Real-time employee tracking, productivity analytics and workforce
          performance — in one intelligent dashboard.
        </motion.p>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
          className="mt-10 flex flex-col items-center gap-4 sm:flex-row"
        >
          <Link
            href="#story"
            className="rounded-2xl border border-white/15 bg-white/[0.06] px-8 py-4 text-base font-semibold text-white backdrop-blur transition-all duration-300 hover:bg-white/[0.12]"
          >
            See How It Works
          </Link>
        </motion.div>

        <motion.div
          animate={{ y: [0, 10, 0] }}
          transition={{ repeat: Infinity, duration: 2.4, ease: "easeInOut" }}
          className="mt-16 flex flex-col items-center gap-3 text-slate-300"
        >
          <p className="text-[10px] tracking-[0.4em]">SCROLL</p>
          <div className="h-12 w-[1px] bg-gradient-to-b from-cyan-300 to-transparent" />
        </motion.div>
      </section>

      {/* ====================== STORY SECTIONS (image + text rows) ====================== */}
      <div id="story" className="relative z-10">
        <StoryRow
          eyebrow="01 — Live Activity"
          title="See your workforce in real time."
          body="Live dashboards show who's active, idle, on break or in deep focus — instantly. Built for visibility, not surveillance: every metric is transparent to your team."
          image={IMG.realtime}
          imageAlt="Team collaborating at workstations"
          reverse={false}
        />
        <StoryRow
          eyebrow="02 — Productivity Analytics"
          title="Turn time into insight."
          body="Beautiful, real-time analytics reveal productivity patterns, focus hours and where time actually goes — across teams, projects and tools."
          image={IMG.analytics}
          imageAlt="Analytics charts on a screen"
          reverse={true}
        />
        <StoryRow
          eyebrow="03 — Workforce Performance"
          title="Coach with data, not guesswork."
          body="Identify top performers, spot burnout early, and rebalance workload with confidence — backed by data your managers can act on today."
          image={IMG.performance}
          imageAlt="Manager reviewing performance metrics"
          reverse={false}
        />
      </div>

      {/* ====================== STATS ====================== */}
      <section className="relative z-10 px-6 py-24">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-8 rounded-[32px] border border-white/10 bg-white/[0.04] p-10 backdrop-blur-2xl md:grid-cols-4">
          {[
  { end: 2.4, suffix: "×", decimals: 1, l: "Productivity lift" },
  { end: 98, suffix: "%", decimals: 0, l: "Tracking accuracy" },
  { end: 5, prefix: "<", suffix: "s", decimals: 0, l: "Live data latency" },
  { end: 10, suffix: "k+", decimals: 0, l: "Teams onboard" },
].map((s, i) => (
            <motion.div
              key={s.l}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.6, delay: i * 0.1 }}
              className="text-center"
            >
              <p className="brand-text text-5xl font-semibold tracking-tight md:text-6xl">
  <CountUp
    end={s.end}
    duration={2}
    decimals={s.decimals}
    prefix={s.prefix || ""}
    suffix={s.suffix || ""}
    enableScrollSpy
    scrollSpyOnce
  />
</p>
<p className="mt-3 text-sm text-slate-300">
  {s.l}
</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ====================== FEATURES ====================== */}
      <section className="relative z-10 px-6 py-20">
        <div className="mx-auto max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.8 }}
            className="max-w-3xl"
          >
            <p className="text-xs uppercase tracking-[0.4em] text-cyan-300">
              The FlowMetric Platform
            </p>
            <h2 className="mt-6 text-5xl font-semibold tracking-tight text-white md:text-6xl">
              Everything you need to understand how work
              <span className="text-slate-400"> really happens.</span>
            </h2>
          </motion.div>

          <div className="mt-16 grid gap-6 md:grid-cols-3">
            {FEATURES.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.6, delay: i * 0.1 }}
                whileHover={{ y: -8 }}
                className="group relative overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.04] p-8 backdrop-blur-2xl"
              >
                <div
                  className="absolute inset-0 -z-0 opacity-0 transition-opacity duration-500 group-hover:opacity-40"
                  style={{
                    backgroundImage: `url(${f.image})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                    filter: "brightness(0.4) saturate(1.1)",
                  }}
                />
                <div className="relative z-10">
                  <div className={`h-12 w-12 rounded-2xl ${f.accent}`} />
                  <h3 className="mt-8 text-2xl font-semibold text-white">{f.title}</h3>
                  <p className="mt-4 leading-7 text-slate-200">{f.body}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ====================== CTA ====================== */}
      {/* <section className="relative z-10 px-6 py-24"> */}
      <section className="relative z-10 px-6 py-14">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.9 }}
          className="relative mx-auto max-w-5xl px-8 py-24 text-center"
        >
          <div className="absolute left-1/2 top-1/2 -z-10 h-[400px] w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-500/10 blur-3xl" />
          <div className="relative z-10">
            <h2 className="text-4xl font-semibold tracking-tight text-white md:text-6xl">
              Ready to transform workforce productivity?
            </h2>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-slate-200">
              Start tracking employee workflow, productivity and team
              performance with FlowMetric — built for modern teams.
            </p>
            <div className="mt-12 flex flex-col items-center justify-center gap-4 md:flex-row">
              <Link
                href="/signup"
                className="rounded-2xl bg-gradient-to-r from-cyan-400 to-blue-500 px-10 py-4 text-lg font-semibold text-black shadow-lg shadow-cyan-500/20 transition-all duration-300 hover:scale-105"
              >
                Create Account
              </Link>
              <Link
                href="/login"
                className="rounded-2xl border border-white/15 bg-white/[0.06] px-10 py-4 text-lg font-semibold text-white backdrop-blur transition-all duration-300 hover:bg-white/[0.12]"
              >
                Login
              </Link>
            </div>
          </div>
        </motion.div>
      </section>

      {/* ====================== FOOTER ====================== */}
      <footer className="relative z-10 border-t border-white/10 px-6 py-10 text-center text-sm text-slate-400">
        © {new Date().getFullYear()} FlowMetric · Workforce Intelligence
      </footer>
    </main>
  );
}

/* -------------------- Story Row -------------------- */
function StoryRow({
  eyebrow,
  title,
  body,
  image,
  imageAlt,
  reverse,
}: {
  eyebrow: string;
  title: string;
  body: string;
  image: string;
  imageAlt: string;
  reverse: boolean;
}) {
  return (
    <section className="px-6 py-20 md:py-28">
      <div
        className={`mx-auto grid max-w-7xl items-center gap-12 md:grid-cols-2 ${
          reverse ? "md:[&>div:first-child]:order-2" : ""
        }`}
      >
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.8 }}
        >
          <p className="text-xs uppercase tracking-[0.4em] text-cyan-300">{eyebrow}</p>
          <h3 className="mt-5 text-4xl font-semibold tracking-tight text-white md:text-5xl">
            {title}
          </h3>
          <p className="mt-6 max-w-md text-lg leading-8 text-slate-200">{body}</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.9 }}
          className="relative h-[420px] w-full overflow-hidden rounded-[32px] border border-white/10 shadow-2xl shadow-cyan-500/10 md:h-[480px]"
        >
          <img src={image} alt={imageAlt} className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-tr from-[#05070d]/70 via-transparent to-transparent" />
          <div className="absolute bottom-5 left-5 rounded-2xl border border-white/15 bg-black/40 px-4 py-2 text-[10px] uppercase tracking-[0.3em] text-cyan-200 backdrop-blur-xl">
            Live · FlowMetric
          </div>
        </motion.div>
      </div>
    </section>
  );
}
