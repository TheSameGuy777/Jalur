import { useState, type FormEvent } from "react";
import { ArrowRight, CheckCircle2, Grid3X3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { toast } from "@/components/ui/toast";
import { navigate } from "@/lib/router";
import { auth, errorMessage } from "@/lib/store";
import { roleLabel } from "@/lib/workflow";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const signIn = async (em: string, pw: string) => {
    setBusy(true);
    setError(undefined);
    try {
      const u = await auth.signIn(em, pw);
      toast.success(`Welcome back, ${u.name.split(" ")[0]}`, roleLabel(u));
      navigate("/dashboard", { replace: true });
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError("Masukkan email dan password.");
      return;
    }
    void signIn(email, password);
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
            <Field label="Email">
              {(a) => <Input {...a} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" />}
            </Field>
            <Field label="Password">
              {(a) => <Input {...a} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />}
            </Field>
            {error && (
              <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
                {error}
              </p>
            )}
            <Button type="submit" size="lg" variant="ink" className="w-full" loading={busy}>
              Sign in
            </Button>
          </form>
          <p className="mt-6 text-xs text-muted-foreground">Belum punya akun? Hubungi Finance/Admin.</p>
        </div>
      </div>
    </div>
  );
}
