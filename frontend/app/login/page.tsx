"use client";

import { useState } from "react";
import Link from "next/link";
import { GraduationCap, ChevronDown } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { ApiRequestError } from "@/lib/api";

const DEMO_ACCOUNTS = [
  { role: "School Admin", email: "admin@sunriseschool.in" },
  { role: "Principal", email: "principal@sunriseschool.in" },
  { role: "Accountant", email: "accountant@sunriseschool.in" },
  { role: "Teacher", email: "teacher@sunriseschool.in" },
  { role: "Parent", email: "parent@sunriseschool.in" },
  { role: "Super Admin", email: "superadmin@schoolerp.dev" },
];

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showDemo, setShowDemo] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Unable to sign in");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-primary px-10 py-10 text-white lg:flex">
        <div className="absolute -right-24 -top-24 size-80 rounded-full bg-white/10" />
        <div className="absolute -bottom-32 -left-16 size-96 rounded-full bg-white/10" />
        <div className="relative flex items-center gap-2 text-lg font-semibold">
          <GraduationCap className="size-6" />
          Sunrise School ERP
        </div>
        <div className="relative max-w-md">
          <h1 className="text-3xl font-semibold leading-tight">
            One platform for admissions, attendance, fees and report cards.
          </h1>
          <p className="mt-4 text-sm text-white/80">
            Built for Indian K-12 schools &mdash; UDISE+/APAAR ready, DPDP-aligned,
            with UPI fee collection and WhatsApp/SMS parent alerts.
          </p>
        </div>
        <p className="relative text-xs text-white/60">
          &copy; {new Date().getFullYear()} Sunrise School ERP &mdash; a multi-tenant SaaS platform
        </p>
      </div>

      <div className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2 lg:hidden">
            <GraduationCap className="size-6 text-primary" />
            <span className="text-lg font-semibold">Sunrise School ERP</span>
          </div>

          <h2 className="text-xl font-semibold text-foreground">Sign in to your account</h2>
          <p className="mt-1 text-sm text-foreground-muted">Enter your school email and password.</p>

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@school.in"
              />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>

            {error && (
              <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>
            )}

            <Button type="submit" className="w-full" loading={loading}>
              {loading ? "Signing in" : "Sign in"}
            </Button>
          </form>

          <div className="mt-6 rounded-xl border border-border bg-surface-muted/60">
            <button
              type="button"
              onClick={() => setShowDemo((s) => !s)}
              className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-foreground-muted"
            >
              Demo accounts (password: Password@123)
              <ChevronDown className={`size-4 transition-transform ${showDemo ? "rotate-180" : ""}`} />
            </button>
            {showDemo && (
              <div className="space-y-1.5 px-4 pb-4">
                {DEMO_ACCOUNTS.map((acc) => (
                  <button
                    key={acc.email}
                    type="button"
                    onClick={() => setEmail(acc.email)}
                    className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs hover:bg-surface"
                  >
                    <span className="text-foreground-muted">{acc.role}</span>
                    <span className="font-mono text-foreground">{acc.email}</span>
                  </button>
                ))}
                <p className="px-2 pt-1 text-[11px] text-foreground-muted">
                  Super Admin password: SuperAdmin@123
                </p>
              </div>
            )}
          </div>

          <p className="mt-6 text-center text-xs text-foreground-muted">
            <Link href="/" className="hover:text-foreground">
              Back to home
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
