import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Toaster } from "@/components/ui/toast";
import { match, navigate, useRoute } from "@/lib/router";
import { useAuthReady, useCurrentUser } from "@/lib/store";
import Approvals from "@/pages/Approvals";
import Budgets from "@/pages/Budgets";
import Dashboard from "@/pages/Dashboard";
import Login from "@/pages/Login";
import Reports from "@/pages/Reports";
import RequestDetail from "@/pages/RequestDetail";
import RequestForm from "@/pages/RequestForm";
import Requests from "@/pages/Requests";
import Settings from "@/pages/Settings";
import { NoAccess } from "@/components/shared";

export default function App() {
  const ready = useAuthReady();
  const user = useCurrentUser();
  const { path } = useRoute();

  useEffect(() => {
    if (!ready) return;
    if (!user && path !== "/login") navigate("/login", { replace: true });
    if (user && (path === "/login" || path === "/")) navigate("/dashboard", { replace: true });
  }, [ready, user, path]);

  useEffect(() => {
    const titles: [string, string][] = [["/dashboard", "Dashboard"], ["/requests/new", "New request"], ["/requests", "Requests"], ["/approvals", "Approvals"], ["/budgets", "Budgets"], ["/reports", "Reports"], ["/settings", "Settings"], ["/login", "Sign in"]];
    const t = titles.find(([p]) => path.startsWith(p))?.[1] ?? "ExpenseFlow";
    document.title = `${t} · ExpenseFlow`;
  }, [path]);

  if (!ready) {
    return (
      <div className="flex min-h-dvh items-center justify-center gap-3 text-sm text-muted-foreground" role="status">
        <Loader2 className="size-5 animate-spin" /> Loading…
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <Login />
        <Toaster />
      </>
    );
  }

  let page;
  let m: Record<string, string> | null;
  if (path === "/dashboard" || path === "/") page = <Dashboard user={user} />;
  else if (path === "/requests") page = <Requests user={user} />;
  else if (path === "/requests/new") page = <RequestForm key="new" user={user} />;
  else if ((m = match("/requests/:id/edit", path))) page = <RequestForm key={m.id} user={user} id={m.id} />;
  else if ((m = match("/requests/:id", path))) page = <RequestDetail key={m.id} user={user} id={m.id!} />;
  else if (path === "/approvals") page = <Approvals user={user} />;
  else if (path === "/budgets") page = <Budgets user={user} />;
  else if (path === "/reports") page = <Reports user={user} />;
  else if (path === "/settings") page = <Settings user={user} />;
  else page = <NoAccess />;

  return (
    <>
      <AppShell user={user}>
        <div key={`${user.id}:${path}`} className="animate-fade-in">{page}</div>
      </AppShell>
      <Toaster />
    </>
  );
}
