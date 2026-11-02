import { useState, type FormEvent } from "react";
import { ArrowRight, CheckCircle2, Grid3X3, ShieldCheck } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { toast } from "@/components/ui/toast";
import { navigate } from "@/lib/router";
import { DEMO_PASSWORD } from "@/lib/seed";
import { auth, errorMessage, useDB } from "@/lib/store";
import { roleLabel } from "@/lib/workflow";

const DEMO_IDS = ["u-rina", "u-budi", "u-sari", "u-dewi"];
const DEMO_BLURB: Record<string, string> = {
  "u-rina": "Create & track requests",
  "u-budi": "Approve team requests",
  "u-sari": "Approves requests > Rp 10 jt",
  "u-dewi": "Final approval, payments, budgets",
};

export default function Login() {
  const db = useDB();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const signIn = (em: string, pw: string) => {
    setBusy(true);
    setError(undefined);
    window.setTimeout(() => {
      try {
        const u = auth.signIn(em, pw);
        toast.success(`Welcome back, ${u.name.split(" ")[0]}`, roleLabel(u));
        navigate("/dashboard", { replace: true });
      } catch (e) {
        setError(errorMessage(e));
        setBusy(false);
      }
    }, 400);
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    signIn(email, password);
  };

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      {/* Visual panel */}
      <div className="bg-hero relative hidden overflow-hidden p-10 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3">
          <Grid3X3 className="size-4 opacity-80" />
          <span className="font-semibold">ExpenseFlow</span>
          <span className="h-5 w-px bg-white/30" />
          <span className="font-light opacity-80">Spend Hub</span>
        </div>
        <div className="max-w-lg">
          <h1 className="text-5xl font-light leading-[1.1] tracking-tight">Spend requests, approved in minutes.</h1>
          <p className="mt-4 text-white/80">Submit on the go, route to the right approver automatically, and keep every rupiah tracked against budget.</p>
          <div className="mt-10 grid max-w-md grid-cols-3 gap-3">
            {[
              ["1,8", "days avg. approval"],
              ["98", "% on-budget"],
              ["0", "lost receipts"],
            ].map(([v, l]) => (
              <div key={l} className="rounded-xl bg-white/12 p-4 ring-1 ring-white/20 backdrop-blur">
                <p className="text-3xl font-light">{v}</p>
                <p className="mt-1 text-xs text-white/75">{l}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-4 text-sm text-white/80">
          {["Draft", "Manager", "Finance", "Paid"].map((s, i) => (
            <span key={s} className="flex items-center gap-2">
              <CheckCircle2 className="size-4" />
              {s}
              {i < 3 && <ArrowRight className="size-3.5 opacity-60" />}
            </span>
          ))}
        </div>
      </div>

      {/* Form */}
      <div className="flex items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <Grid3X3 className="size-4 text-muted-foreground" />
            <span className="font-semibold">ExpenseFlow</span>
            <span className="h-5 w-px bg-border" />
            <span className="font-light text-muted-foreground">Spend Hub</span>
          </div>
          <p className="text-sm text-muted-foreground">Welcome back</p>
          <h2 className="mt-1 text-4xl font-light tracking-tight">Sign in</h2>

          <form onSubmit={onSubmit} className="mt-8 space-y-4" noValidate>
            <Field label="Work email" error={error && !email ? error : undefined}>
              {(a) => <Input {...a} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" />}
            </Field>
            <Field label="Password">
              {(a) => <Input {...a} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />}
            </Field>
            {error && email && (
              <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
                {error}
              </p>
            )}
            <Button type="submit" size="lg" variant="ink" className="w-full" loading={busy}>
              Sign in
            </Button>
          </form>

          <div className="mt-10">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-medium">Demo accounts</p>
              <p className="text-xs text-muted-foreground">
                Password: <code className="rounded bg-muted px-1.5 py-0.5">{DEMO_PASSWORD}</code>
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {DEMO_IDS.map((id) => {
                const u = db.users.find((x) => x.id === id);
                if (!u) return null;
                return (
                  <button
                    key={id}
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setEmail(u.email);
                      setPassword(DEMO_PASSWORD);
                      signIn(u.email, DEMO_PASSWORD);
                    }}
                    className="focus-ring group flex items-center gap-3 rounded-xl border border-border/70 bg-card p-3 text-left shadow-soft transition hover:-translate-y-0.5 hover:border-primary/40"
                  >
                    <Avatar user={u} size="md" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{u.name}</span>
                      <span className="block truncate text-xs text-primary">{roleLabel(u)}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">{DEMO_BLURB[id]}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="size-4" /> Demo mode — data is stored in this browser only.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
