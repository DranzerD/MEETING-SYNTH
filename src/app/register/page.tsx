"use client";
import { useState } from "react";
import Link from "next/link";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("");
  const [domain, setDomain] = useState("");
  const [email, setEmail] = useState("");

  const handleRegister = async (event: React.FormEvent) => {
    event.preventDefault();
    const cleanName = name.toLowerCase().trim().replace(/\s+/g, "");
    const cleanRole = role.toLowerCase().trim().replace(/\s+/g, "");
    const cleanDomain = domain.toLowerCase().trim();

    const emailGenerated =
      role === "Vice President"
        ? `${cleanName}@${cleanRole}.com`
        : `${cleanName}@${cleanRole}.${cleanDomain}.com`;

    setEmail(emailGenerated);

    await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        email: emailGenerated,
        phone,
        password,
        role,
        domain,
      }),
    });
  };

  return (
    <div className="relative isolate min-h-[80vh] bg-slate-950 px-6 py-10">
      <div className="pointer-events-none absolute inset-0 -z-10 opacity-70">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(236,72,153,0.2),_transparent_55%)]" />
      </div>
      <div className="mx-auto grid max-w-5xl gap-10 rounded-[32px] border border-white/10 bg-white/5 p-8 md:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6 text-slate-200">
          <p className="text-xs uppercase tracking-[0.4em] text-indigo-200">
            Create workspace
          </p>
          <h1 className="text-3xl font-semibold text-white">
            Spin up a pilot tenant in minutes.
          </h1>
          <p className="text-sm text-slate-300">
            Generate branded credentials for your team. We auto-issue workspace
            emails so you can invite exec sponsors, leads, or ICs with
            consistent naming.
          </p>
          <div className="grid gap-4 text-sm md:grid-cols-2">
            {["Thread memory", "SOC2 playbook", "Exports"].map((item) => (
              <div
                key={item}
                className="rounded-2xl border border-white/10 bg-white/5 p-4"
              >
                <p className="font-semibold text-white">{item}</p>
                <p className="text-slate-400">Included</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-400">
            Already onboarded?{" "}
            <Link href="/login" className="text-indigo-300">
              Sign in
            </Link>{" "}
            instead.
          </p>
        </div>

        <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-8 shadow-[0_25px_80px_rgba(2,6,23,0.7)]">
          <h2 className="text-2xl font-semibold text-white">Create account</h2>
          <form className="mt-6 space-y-4" onSubmit={handleRegister}>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-sm text-slate-400">
                Name
                <input
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-slate-500 focus:border-pink-300 focus:outline-none"
                  placeholder="Alicia Reynolds"
                  required
                />
              </label>
              <label className="text-sm text-slate-400">
                Phone
                <input
                  type="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-slate-500 focus:border-pink-300 focus:outline-none"
                  placeholder="+1 (555) 123-9901"
                  required
                />
              </label>
            </div>
            <label className="text-sm text-slate-400">
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-slate-500 focus:border-pink-300 focus:outline-none"
                placeholder="Secure passphrase"
                required
              />
            </label>
            <label className="text-sm text-slate-400">
              Role
              <select
                value={role}
                onChange={(event) => {
                  setRole(event.target.value);
                  if (event.target.value === "Vice President") {
                    setDomain("");
                  }
                }}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white focus:border-pink-300 focus:outline-none"
                required
              >
                <option value="">Select Role</option>
                <option>Vice President</option>
                <option>Team Lead</option>
                <option>Teammate</option>
              </select>
            </label>
            {role !== "Vice President" && (
              <label className="text-sm text-slate-400">
                Domain
                <select
                  value={domain}
                  onChange={(event) => setDomain(event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white focus:border-pink-300 focus:outline-none"
                  required
                >
                  <option value="">Select Domain</option>
                  <option>Frontend</option>
                  <option>Backend</option>
                  <option>Database</option>
                </select>
              </label>
            )}
            <button
              type="submit"
              className="w-full rounded-2xl bg-white py-3 text-sm font-semibold text-slate-900 shadow-lg shadow-fuchsia-900/30 transition hover:scale-[1.01]"
            >
              Create workspace access
            </button>
          </form>

          {email && (
            <p className="mt-5 text-center text-sm font-semibold text-emerald-300">
              Generated email: {email}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
