"use client";

import { ArrowRight, Mail, Zap, Shield, Lock } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { apiRequest, storeAuth } from "@/lib/api";
import type { StoredUser } from "@/lib/api";

import AnimatedGrid from "../components/AnimatedGrid";
import FloatingOrbs from "../components/FloatingOrbs";
import CursorEffects from "../components/CursorEffects";
import AnimatedInput from "../components/AnimatedInput";
import MagicButton from "../components/MagicButton";
import SecurityBadge from "../components/SecurityBadge";

type LoginResponse = {
  message: string;
  token: string;
  user: StoredUser;
};

export default function LoginPage() {
  const router = useRouter();
  const cardRef = useRef<HTMLDivElement | null>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [formVisible, setFormVisible] = useState(false);
  const [showMessage, setShowMessage] = useState(true);
  const [messageStep, setMessageStep] = useState(0);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setIsLoading(true);
    setMessage("");

    try {
      const response = await apiRequest<LoginResponse>(
        "/api/auth/login",
        {
          method: "POST",
          auth: false,
          body: JSON.stringify({
            email,
            password,
            deviceInfo: "Browser dashboard",
          }),
        }
      );

      storeAuth(response.token, response.user);

      const destination =
        response.user.role === "ADMIN" ||
        response.user.role === "MANAGER" ||
        response.user.role === "HR"
          ? "/dashboard"
          : "/employee";

      router.replace(destination);
      // window.location.assign(destination);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Login failed"
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function handleForgotPassword() {
    setMessage("");

    try {
      const response = await apiRequest<{
        message: string;
      }>("/api/auth/forgot-password", {
        method: "POST",
        auth: false,
        body: JSON.stringify({ email }),
      });

      setMessage(response.message);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not request reset OTP"
      );
    }
  }

  function handleBeginLogin() {
    setShowMessage(true);

    // Keep the portal message visible briefly before transition
    setTimeout(() => {
      setMessageStep(1);
    }, 1450);

    // Show form closer after the message exit animation
    setTimeout(() => {
      setIsReady(true);
      setFormVisible(true);
    }, 2450);
  }

  useEffect(() => {
    const entryTimeout = window.setTimeout(() => {
      handleBeginLogin();
    }, 50);

    return () => {
      window.clearTimeout(entryTimeout);
    };
  }, []);

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#030417] text-white">
      <AnimatedGrid />
      <FloatingOrbs />
      <CursorEffects />

      {/* Enhanced animated background gradients */}
      <motion.div
        animate={{
          x: [0, 50, -50, 0],
          y: [0, 30, -30, 0],
        }}
        transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
        className="absolute left-[-10%] top-[-10%] h-[500px] w-[500px] rounded-full bg-blue-600/20 blur-3xl"
      />
      <motion.div
        animate={{
          x: [0, -50, 50, 0],
          y: [0, -30, 30, 0],
        }}
        transition={{ duration: 25, repeat: Infinity, ease: "easeInOut" }}
        className="absolute bottom-[-20%] right-[-10%] h-[500px] w-[500px] rounded-full bg-violet-600/20 blur-3xl"
      />

      {/* Additional accent orbs */}
      <motion.div
        animate={{
          scale: [1, 1.2, 1],
          opacity: [0.3, 0.6, 0.3],
        }}
        transition={{ duration: 8, repeat: Infinity }}
        className="absolute top-1/4 left-1/3 h-64 w-64 rounded-full bg-cyan-500/10 blur-3xl"
      />
      <motion.div
        animate={{
          scale: [1.2, 1, 1.2],
          opacity: [0.3, 0.5, 0.3],
        }}
        transition={{ duration: 10, repeat: Infinity, delay: 1 }}
        className="absolute bottom-1/3 right-1/4 h-80 w-80 rounded-full bg-indigo-500/10 blur-3xl"
      />

      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_35%)]" />

      {/* Grid Overlay */}
      <div className="absolute inset-0 opacity-[0.03]">
        <div className="h-full w-full bg-[linear-gradient(to_right,#ffffff_1px,transparent_1px),linear-gradient(to_bottom,#ffffff_1px,transparent_1px)] bg-[size:70px_70px]" />
      </div>

      {/* Floating code elements decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(3)].map((_, i) => (
          <motion.div
            key={i}
            animate={{
              y: [0, -20, 0],
              opacity: [0.1, 0.3, 0.1],
            }}
            transition={{
              duration: 6 + i * 2,
              repeat: Infinity,
              delay: i * 2,
            }}
            className="absolute text-cyan-400/20 font-mono text-xs whitespace-nowrap"
            style={{
              left: `${20 + i * 35}%`,
              top: `${10 + i * 20}%`,
            }}
          >
            &lt;authentication /&gt;
          </motion.div>
        ))}
      </div>

      {/* Main content */}
      <section className="relative z-10 flex min-h-screen items-center justify-center px-4 py-16 sm:px-6 md:px-8">
        <AnimatePresence mode="wait">
          {/* STEP 2: Full-Screen Message Animation */}
          {showMessage && messageStep === 0 ? (
            <motion.div
              key="portal-message"
              initial={{ opacity: 0, scale: 0.8, y: 50 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.8, type: "spring", stiffness: 60, damping: 12 }}
              className="fixed inset-0 flex items-center justify-center z-50"
            >
              {/* Animated background grid */}
              <motion.div
                animate={{
                  opacity: [0, 0.3, 0],
                  scale: [0.8, 1.2, 1.5],
                }}
                transition={{
                  duration: 1.5,
                  ease: "easeOut",
                }}
                className="absolute inset-0 bg-[radial-gradient(circle,rgba(34,211,238,0.2),transparent_70%)]"
              />

              {/* Center message container */}
              <div className="relative z-10 text-center space-y-6 px-6">
                {/* Animated circles around text */}
                <motion.div
                  animate={{
                    rotate: 360,
                    scale: [1, 1.1, 1],
                  }}
                  transition={{
                    rotate: { duration: 4, repeat: Infinity, ease: "linear" },
                    scale: { duration: 2, repeat: Infinity },
                  }}
                  className="absolute -inset-32 border border-cyan-400/30 rounded-full"
                />
                <motion.div
                  animate={{
                    rotate: -360,
                    scale: [1.1, 1, 1.1],
                  }}
                  transition={{
                    rotate: { duration: 5, repeat: Infinity, ease: "linear" },
                    scale: { duration: 2.5, repeat: Infinity, delay: 0.5 },
                  }}
                  className="absolute -inset-40 border border-indigo-400/20 rounded-full"
                />

                {/* Main message */}
                <motion.div
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.2, duration: 0.6, type: "spring" }}
                  className="relative z-20"
                >
                  <motion.h2
                    animate={{
                      textShadow: [
                        "0 0 20px rgba(34, 211, 238, 0.4), 0 0 40px rgba(34, 211, 238, 0.2)",
                        "0 0 40px rgba(34, 211, 238, 0.6), 0 0 80px rgba(34, 211, 238, 0.3)",
                        "0 0 20px rgba(34, 211, 238, 0.4), 0 0 40px rgba(34, 211, 238, 0.2)",
                      ],
                    }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="text-6xl md:text-8xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-white to-indigo-300 mb-4"
                  >
                    SECURE LOGIN PORTAL
                  </motion.h2>
                  <motion.p
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4, duration: 0.6 }}
                    className="text-lg md:text-2xl text-slate-300 font-light tracking-wider"
                  >
                    Preparing your authentication gateway...
                  </motion.p>
                </motion.div>

                {/* Loading indicator */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.6 }}
                  className="flex justify-center gap-3 pt-8 relative z-20"
                >
                  {[0, 1, 2].map((i) => (
                    <motion.div
                      key={i}
                      animate={{
                        scale: [1, 1.5, 1],
                        opacity: [0.5, 1, 0.5],
                      }}
                      transition={{
                        duration: 1.2,
                        repeat: Infinity,
                        delay: i * 0.2,
                      }}
                      className="w-3 h-3 rounded-full bg-gradient-to-r from-cyan-400 to-indigo-400"
                    />
                  ))}
                </motion.div>
              </div>
            </motion.div>
          ) : null}

          {/* STEP 3: Message Exit + Form Entry */}
          {showMessage && messageStep === 1 ? (
            <motion.div
              key="message-exit"
              initial={{ opacity: 1, scale: 1 }}
              animate={{ opacity: 0, scale: 1.5, y: -100 }}
              transition={{ duration: 0.6, ease: "easeIn" }}
              className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none"
            >
              <div className="text-center">
                <motion.h2
                  animate={{
                    filter: [
                      "blur(0px)",
                      "blur(10px)",
                      "blur(20px)",
                    ],
                  }}
                  transition={{ duration: 0.6 }}
                  className="text-6xl md:text-8xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-white to-indigo-300"
                >
                  SECURE LOGIN PORTAL
                </motion.h2>
              </div>
            </motion.div>
          ) : null}

          {/* STEP 4: Login Form - Full Screen */}
          {isReady && formVisible ? (
            <motion.div
              key="form-container"
              initial={{ opacity: 0, scale: 0.95, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.7, type: "spring", stiffness: 60 }}
              className="w-full max-w-[1100px] mx-auto"
            >
              <div className="rounded-[38px] border border-white/10 bg-white/[0.03] p-8 md:p-12 lg:p-16 shadow-[0_50px_150px_rgba(3,7,22,0.9)] backdrop-blur-3xl">
                <div className="grid md:grid-cols-[1fr_1.1fr] gap-8 lg:gap-12 items-stretch">
                  {/* Left Section - Welcome Message */}
                  <motion.div
                    initial={{ opacity: 0, x: -30 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3, duration: 0.6 }}
                    className="flex flex-col justify-center space-y-6"
                  >
                    <div>
                      <motion.div
                        animate={{
                          textShadow: [
                            "0 0 15px rgba(34, 211, 238, 0.3)",
                            "0 0 30px rgba(34, 211, 238, 0.6)",
                            "0 0 15px rgba(34, 211, 238, 0.3)",
                          ],
                        }}
                        transition={{ duration: 2, repeat: Infinity }}
                      >
                        <p className="text-xs md:text-sm uppercase tracking-[0.3em] text-cyan-300/70 font-medium mb-3">
                          Welcome back
                        </p>
                      </motion.div>
                      <h2 className="text-4xl md:text-5xl lg:text-6xl font-extrabold leading-tight text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-white to-indigo-300">
                        Ready to continue?
                      </h2>
                    </div>

                    <p className="text-base md:text-lg text-slate-300 leading-relaxed max-w-md">
                      Enter your credentials to access your AI-powered workforce dashboard.
                    </p>

                    <motion.div
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.4, duration: 0.6 }}
                      className="space-y-3 pt-4"
                    >
                      {[
                        { icon: "🔒", text: "Military-grade encryption" },
                        { icon: "⚡", text: "Lightning-fast processing" },
                        { icon: "✓", text: "Real-time verification" },
                      ].map((item, i) => (
                        <motion.div
                          key={i}
                          whileHover={{ x: 5 }}
                          className="flex items-center gap-3 text-slate-300"
                        >
                          <span className="text-xl">{item.icon}</span>
                          <span className="text-sm md:text-base">{item.text}</span>
                        </motion.div>
                      ))}
                    </motion.div>
                  </motion.div>

                  {/* Right Section - Login Form */}
                  <motion.div
                    initial={{ opacity: 0, x: 30 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3, duration: 0.6 }}
                    className="relative overflow-hidden rounded-[32px] border border-white/10 bg-gradient-to-br from-[#040a16]/95 to-[#050d1a]/90 p-8 md:p-10 shadow-inner shadow-violet-500/5 backdrop-blur-2xl"
                  >
                    {/* Decorative top line */}
                    <div className="absolute inset-x-6 top-6 h-[1px] bg-gradient-to-r from-transparent via-cyan-400/30 to-transparent" />

                    {/* Glow effect */}
                    <motion.div
                      animate={{
                        scale: [1, 1.1, 1],
                        opacity: [0.3, 0.6, 0.3],
                      }}
                      transition={{ duration: 4, repeat: Infinity }}
                      className="absolute right-10 bottom-10 h-24 w-24 rounded-full bg-cyan-400/20 blur-3xl"
                    />

                    <div className="relative z-10 space-y-7">
                      <div>
                        <p className="text-xs uppercase tracking-[0.3em] text-slate-400/80 font-medium mb-2">
                          Authentication
                        </p>
                        <p className="text-lg md:text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-200">
                          Enter Your Credentials
                        </p>
                      </div>

                      <form autoComplete="off" className="space-y-6" onSubmit={handleLogin}>
                        <motion.div
                          initial={{ opacity: 0, y: 15 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.45, duration: 0.5 }}
                        >
                          <AnimatedInput
                            label="Official Email"
                            icon={<Mail size={18} />}
                            placeholder="name@company.com"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                          />
                        </motion.div>

                        <motion.div
                          initial={{ opacity: 0, y: 15 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.5, duration: 0.5 }}
                        >
                          <AnimatedInput
                            label="Password"
                            isPassword
                            placeholder="Enter your password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                          />
                        </motion.div>

                        <motion.div
                          initial={{ opacity: 0, y: 15 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.55, duration: 0.5 }}
                          className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between text-xs md:text-sm pt-2"
                        >
                          <label className="flex items-center gap-2 text-slate-400 hover:text-slate-300 transition cursor-pointer">
                            <input
                              className="h-4 w-4 rounded border border-white/20 bg-transparent text-cyan-400 accent-cyan-400"
                              defaultChecked
                              type="checkbox"
                            />
                            Keep me signed in
                          </label>

                          <button
                            className="font-medium text-cyan-300 transition hover:text-cyan-200 hover:underline text-left"
                            onClick={handleForgotPassword}
                            type="button"
                          >
                            Forgot password?
                          </button>
                        </motion.div>

                        {message && (
                          <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="rounded-2xl border border-cyan-400/30 bg-cyan-400/10 p-4 text-sm text-cyan-100 backdrop-blur-xl"
                          >
                            {message}
                          </motion.div>
                        )}

                        <motion.div
                          initial={{ opacity: 0, y: 15 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.6, duration: 0.5 }}
                        >
                          <MagicButton type="submit" {...{ loading: isLoading }}>
                            {isLoading ? "Authenticating..." : "Continue"}
                            <ArrowRight size={18} />
                          </MagicButton>
                        </motion.div>
                      </form>

                      {/* Footer */}
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.7 }}
                        className="border-t border-white/10 pt-6 text-center text-xs text-slate-500"
                      >
                        <p>
                          🔐 Encrypted with{" "}
                          <span className="text-cyan-400 font-semibold">256-bit SSL</span> security
                        </p>
                      </motion.div>
                    </div>
                  </motion.div>
                </div>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </section>
    </main>
  );
}