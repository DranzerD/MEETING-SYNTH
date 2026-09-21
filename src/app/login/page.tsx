"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    alert(`Welcome ${name}! Logged in with ${email}`);
    router.push("/scheduler");
  };

  return (
    <div className="relative isolate min-h-[80vh] bg-slate-950 px-6 py-10">
      <div className="pointer-events-none absolute inset-0 -z-10 opacity-70">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.25),_transparent_60%)]" />
      </div>
      <div className="mx-auto grid max-w-5xl gap-10 rounded-[32px] border border-white/10 bg-white/5 p-8 md:grid-cols-2">
        <div className="space-y-6 text-slate-200">
          <p className="text-xs uppercase tracking-[0.4em] text-indigo-200">
            Account portal
          </p>
          <h1 className="text-3xl font-semibold text-white">
            Sign in to your Aura workspace.
          </h1>
          <p className="text-sm text-slate-300">
            Access the analyzer, review prior threads, and manage exports. SOC2
            controls and audit logs come baked in for enterprise pilots.
          </p>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm">
            <p className="font-semibold text-white">Need an account?</p>
            <p className="text-slate-300">
              Launch a self-serve tenant in minutes or talk to us about managed
              onboarding.
            </p>
            <Link href="/register" className="mt-3 inline-flex text-indigo-300">
              Request access →
            </Link>
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-8 shadow-[0_25px_80px_rgba(2,6,23,0.7)]">
          <h2 className="text-2xl font-semibold text-white">Welcome back</h2>
          <p className="text-sm text-slate-400">
            Use your pilot credentials or the generated email from registration.
          </p>
          <form className="mt-6 space-y-4" onSubmit={handleLogin}>
            <label className="block text-sm">
              <span className="text-slate-400">Name</span>
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Alicia Reynolds"
                className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none"
                required
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-400">Email</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="aura.ops@revteam.com"
                className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none"
                required
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-400">Password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none"
                required
              />
            </label>
            <button
              type="submit"
              className="mt-4 w-full rounded-2xl bg-white py-3 text-sm font-semibold text-slate-900 shadow-lg shadow-indigo-900/30 transition hover:scale-[1.01]"
            >
              Log in
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
