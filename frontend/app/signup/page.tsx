"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LockKeyhole, Mail } from "lucide-react";
import { apiRequest } from "@/lib/api";
import MagicButton from "../components/MagicButton";

export default function SignupPage() {
  const router = useRouter();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [designation, setDesignation] = useState("");
  const [department, setDepartment] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");

  async function handleSignup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (password !== confirmPassword) {
      setMessage("Passwords do not match");
      return;
    }

    try {
     await apiRequest("/api/auth/signup", {
  method: "POST",
  auth: false,
  body: JSON.stringify({
    firstName,
    lastName,
    designation,
    departmentId: Number(department),
    email,
    password,
  }),
});

setMessage("Account created successfully");

setTimeout(() => {
  router.push("/login");
}, 1500);
    } catch {
      setMessage("Signup failed");
    }
  }

return (
  <main className="relative min-h-screen overflow-hidden bg-[#030417] text-white">
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_35%)] pointer-events-none" />
    <div className="absolute inset-0 opacity-[0.03] pointer-events-none">
      <div className="h-full w-full bg-[linear-gradient(to_right,#ffffff_1px,transparent_1px),linear-gradient(to_bottom,#ffffff_1px,transparent_1px)] bg-[size:70px_70px]" />
    </div>

    <section className="relative z-10 mx-auto flex min-h-screen w-full max-w-[900px] items-center px-6 py-10">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="relative z-20 w-full overflow-hidden rounded-[38px] border border-white/10 bg-[#040a16] p-8 md:p-10 shadow-[0_50px_120px_rgba(0,0,0,0.45)]"
      >
        <div className="space-y-8">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400/80 font-medium">
              Account creation
            </p>
            <h2 className="mt-3 text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-white to-indigo-300">
              New employee registration
            </h2>
            <p className="mt-3 text-sm leading-7 text-slate-300">
              Fill out your details and set up secure access for your workforce portal.
            </p>
          </div>

          <form autoComplete="off" className="space-y-5" onSubmit={handleSignup}>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-base font-medium text-slate-300">First Name</span>
                <div className="flex h-14 items-center rounded-2xl border border-white/10 bg-white/5 px-4 transition focus-within:border-cyan-400/40 backdrop-blur-xl">
                  <input
                    className="w-full bg-transparent text-base text-white outline-none placeholder:text-slate-400"
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="First name"
                  />
                </div>
              </label>

              <label className="block">
                <span className="mb-2 block text-base font-medium text-slate-300">Last Name</span>
                <div className="flex h-14 items-center rounded-2xl border border-white/10 bg-white/5 px-4 transition focus-within:border-cyan-400/40 backdrop-blur-xl">
                  <input
                    className="w-full bg-transparent text-base text-white outline-none placeholder:text-slate-400"
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Last name"
                  />
                </div>
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-base font-medium text-slate-300">Department</span>
                <div className="flex h-14 items-center rounded-2xl border border-white/10 bg-white/5 px-4 transition focus-within:border-cyan-400/40 backdrop-blur-xl">
                  <select
                    className="w-full cursor-pointer bg-transparent text-base text-white outline-none"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                  >
                    <option value="" className="text-black">Select Department</option>
                    <option value="1" className="text-black">Engineering</option>
                    <option value="2" className="text-black">Quality</option>
                    <option value="3" className="text-black">Sales</option>
                    <option value="4" className="text-black">People Ops</option>
                    <option value="5" className="text-black">Support</option>
                  </select>
                </div>
              </label>

              <label className="block">
                <span className="mb-2 block text-base font-medium text-slate-300">Designation</span>
                <div className="flex h-14 items-center rounded-2xl border border-white/10 bg-white/5 px-4 transition focus-within:border-cyan-400/40 backdrop-blur-xl">
                  <input
                    className="w-full bg-transparent text-base text-white outline-none placeholder:text-slate-400"
                    type="text"
                    value={designation}
                    onChange={(e) => setDesignation(e.target.value)}
                    placeholder="Software Engineer"
                  />
                </div>
              </label>
            </div>

            <label className="block">
              <span className="mb-2 block text-base font-medium text-slate-300">Official Email</span>
              <div className="flex h-14 items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 transition focus-within:border-cyan-400/40 backdrop-blur-xl">
                <Mail size={18} className="text-slate-400" />
                <input
                  autoComplete="off"
                  className="flex-1 bg-transparent text-base text-white outline-none placeholder:text-slate-400"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                />
              </div>
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-base font-medium text-slate-300">Password</span>
                <div className="flex h-14 items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 transition focus-within:border-cyan-400/40 backdrop-blur-xl">
                  <LockKeyhole size={18} className="text-slate-400" />
                  <input
                    autoComplete="new-password"
                    className="flex-1 bg-transparent text-base text-white outline-none placeholder:text-slate-400"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Create password"
                  />
                </div>
              </label>

              <label className="block">
                <span className="mb-2 block text-base font-medium text-slate-300">Confirm Password</span>
                <div className="flex h-14 items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 transition focus-within:border-cyan-400/40 backdrop-blur-xl">
                  <LockKeyhole size={18} className="text-slate-400" />
                  <input
                    className="flex-1 bg-transparent text-base text-white outline-none placeholder:text-slate-400"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm password"
                  />
                </div>
              </label>
            </div>

            {message && (
              <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-4 text-sm text-cyan-100 backdrop-blur-xl">
                {message}
              </div>
            )}

            <motion.button
  whileHover={{
    scale: 1.02,
  }}
  whileTap={{
    scale: 0.98,
  }}
  type="submit"
  className="group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-2xl bg-gradient-to-r from-cyan-400 to-blue-500 px-6 py-4 text-lg font-semibold text-black transition-all duration-300 hover:shadow-[0_0_40px_rgba(34,211,238,0.35)]"
>
  {/* Glow Layer */}
  <div className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 bg-white/10" />

  <span className="relative z-10">
    Create account
  </span>

  <ArrowRight
    size={18}
    className="relative z-10 transition-transform duration-300 group-hover:translate-x-1"
  />
</motion.button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-400">
            Already registered? {" "}
            <Link href="/login" className="font-medium text-cyan-300 transition hover:text-cyan-200">
              Login
            </Link>
          </p>
        </div>
      </motion.div>
    </section>
  </main>
);
}
