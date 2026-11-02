import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  BarChart3,
  Bell,
  CheckCircle2,
  FileText,
  Grid3X3,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Settings,
  Sun,
  UserRound,
  Wallet,
  X,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dropdown, MenuItem } from "@/components/ui/dropdown";
import { toast } from "@/components/ui/toast";
import { useTheme } from "@/lib/hooks";
import { navigate, useRoute } from "@/lib/router";
import { auth, notifications, useDB } from "@/lib/store";
import type { User } from "@/lib/types";
import { cn, relativeTime } from "@/lib/utils";
import { approverQueue, roleLabel } from "@/lib/workflow";

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  show: (u: User) => boolean;
  badge?: number;
}

export function AppShell({ user, children }: { user: User; children: ReactNode }) {
  const db = useDB();
  const { path, query } = useRoute();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("expenseflow.sidebar") === "collapsed");
  const queueCount = useMemo(() => approverQueue(db, user).length, [db, user]);

  useEffect(() => setMobileOpen(false), [path]);
  useEffect(() => {
    localStorage.setItem("expenseflow.sidebar", collapsed ? "collapsed" : "expanded");
  }, [collapsed]);

  const nav: NavItem[] = [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, show: () => true },
    { to: "/requests", label: "My Requests", icon: FileText, show: () => true },
    { to: "/approvals", label: "Approvals", icon: CheckCircle2, show: (u) => u.role !== "employee", badge: queueCount },
    { to: "/budgets", label: "Budgets", icon: Wallet, show: (u) => u.role !== "employee" },
    { to: "/reports", label: "Reports", icon: BarChart3, show: (u) => u.role === "finance" },
    { to: "/settings", label: "Settings", icon: Settings, show: () => true },
  ];
  const items = nav.filter((n) => n.show(user));
  const isActive = (to: string) => path === to || (to !== "/dashboard" && path.startsWith(to + "/")) || (to === "/requests" && path.startsWith("/requests"));

  const NavList = ({ rail }: { rail?: boolean }) => (
    <nav aria-label="Main" className="flex flex-col gap-1">
      {items.map((it) => {
        const active = isActive(it.to);
        const Icon = it.icon;
        return (
          <a
            key={it.to}
            href={`#${it.to}`}
            aria-current={active ? "page" : undefined}
            title={rail ? it.label : undefined}
            className={cn(
              "focus-ring group relative flex items-center gap-3 rounded-full text-sm transition-colors",
              rail ? "mx-auto size-11 justify-center" : "h-11 px-4",
              active ? "bg-ink text-ink-foreground shadow-sm" : "text-muted-foreground hover:bg-card hover:text-foreground",
            )}
          >
            <Icon className="size-[18px] shrink-0" aria-hidden />
            {!rail && <span className="flex-1 truncate font-medium">{it.label}</span>}
            {!!it.badge && (
              <span
                className={cn(
                  "flex min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold",
                  rail ? "absolute -right-0.5 -top-0.5 h-5 bg-primary text-primary-foreground ring-2 ring-background" : "h-5",
                  !rail && (active ? "bg-white/20 text-white" : "bg-primary text-primary-foreground"),
                )}
              >
                {it.badge}
                <span className="sr-only"> waiting</span>
              </span>
            )}
          </a>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-dvh">
      <a href="#main" onClick={(e) => { e.preventDefault(); document.getElementById("main")?.focus(); }} className="sr-only z-[70] rounded-full bg-ink px-4 py-2 text-ink-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
        Skip to content
      </a>
      <TopBar user={user} onMenu={() => setMobileOpen(true)} initialQuery={path === "/requests" ? query.get("q") ?? "" : ""} />

      <div className="flex">
        {/* Desktop sidebar */}
        <aside className={cn("sticky top-16 hidden h-[calc(100dvh-4rem)] shrink-0 flex-col justify-between py-6 transition-[width] lg:flex", collapsed ? "w-[84px] px-3" : "w-64 px-4")}>
          <div className="space-y-6">
            {!collapsed && (
              <Button className="w-full" size="lg" onClick={() => navigate("/requests/new")}>
                <Plus /> New request
              </Button>
            )}
            {collapsed && (
              <Button size="icon" className="mx-auto flex size-11" onClick={() => navigate("/requests/new")} aria-label="New request" title="New request">
                <Plus />
              </Button>
            )}
            <NavList rail={collapsed} />
          </div>
          <div className={cn("space-y-3", collapsed && "flex flex-col items-center")}>
            {!collapsed && (
              <div className="rounded-xl border border-border/70 bg-card p-3 shadow-soft">
                <div className="flex items-center gap-2.5">
                  <Avatar user={user} size="sm" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{user.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{roleLabel(user)}</p>
                  </div>
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={() => setCollapsed((c) => !c)}
              className="focus-ring flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-card hover:text-foreground"
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
            </button>
          </div>
        </aside>

        {/* Mobile drawer */}
        {mobileOpen && (
          <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
            <div className="animate-fade-in absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
            <div className="animate-pop-in absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col gap-6 bg-background p-4 shadow-2xl">
              <div className="flex items-center justify-between">
                <Brand />
                <button type="button" onClick={() => setMobileOpen(false)} className="focus-ring rounded-full p-2 hover:bg-card" aria-label="Close navigation">
                  <X className="size-5" />
                </button>
              </div>
              <NavList />
              <div className="mt-auto flex items-center gap-3 rounded-xl bg-card p-3">
                <Avatar user={user} size="sm" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{user.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{roleLabel(user)}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        <main id="main" tabIndex={-1} className="min-w-0 flex-1 px-4 pb-28 pt-6 outline-none md:px-8 md:pt-8 lg:pb-12">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>

      {/* Mobile FAB for submitting on the go */}
      {(path === "/dashboard" || path === "/requests" || path === "/approvals") && (
        <button
          type="button"
          onClick={() => navigate("/requests/new")}
          className="focus-ring fixed bottom-5 right-5 z-30 flex h-14 items-center gap-2 rounded-full bg-ink px-5 text-sm font-medium text-ink-foreground shadow-2xl lg:hidden"
          aria-label="New request"
        >
          <Plus className="size-5" /> New
        </button>
      )}
    </div>
  );
}

function Brand() {
  return (
    <a href="#/dashboard" className="focus-ring flex items-center gap-3 rounded-full">
      <Grid3X3 className="size-4 text-muted-foreground" aria-hidden />
      <span className="text-[15px] font-semibold tracking-tight">ExpenseFlow</span>
      <span className="hidden h-5 w-px bg-border sm:block" aria-hidden />
      <span className="hidden text-[15px] font-light text-muted-foreground sm:block">Spend Hub</span>
    </a>
  );
}

function TopBar({ user, onMenu, initialQuery }: { user: User; onMenu: () => void; initialQuery: string }) {
  const db = useDB();
  const { dark, toggle } = useTheme();
  const [q, setQ] = useState(initialQuery);
  const [searchOpen, setSearchOpen] = useState(false);
  useEffect(() => setQ(initialQuery), [initialQuery]);

  const mine = db.notifications.filter((n) => n.userId === user.id).sort((a, b) => b.at.localeCompare(a.at));
  const unread = mine.filter((n) => !n.read).length;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    navigate(`/requests${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`);
    setSearchOpen(false);
  };

  const demoUsers = db.users.filter((u) => ["u-rina", "u-budi", "u-sari", "u-dewi"].includes(u.id));

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur-md">
      <div className="flex h-16 items-center gap-3 px-4 md:px-6">
        <button type="button" onClick={onMenu} className="focus-ring -ml-1 rounded-full p-2 hover:bg-card lg:hidden" aria-label="Open navigation">
          <Menu className="size-5" />
        </button>
        <Brand />

        <form onSubmit={submit} role="search" className={cn("mx-auto w-full max-w-md", searchOpen ? "absolute inset-x-3 top-3 z-10 md:static" : "hidden md:block")}>
          <label htmlFor="global-search" className="sr-only">Search requests</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input
              id="global-search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search requests, codes, vendors…"
              className="h-10 w-full rounded-full border border-border bg-card pl-10 pr-4 text-sm shadow-soft placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
        </form>

        <div className="ml-auto flex items-center gap-1 md:ml-0">
          <button type="button" onClick={() => setSearchOpen((s) => !s)} className="focus-ring rounded-full p-2.5 hover:bg-card md:hidden" aria-label="Search">
            {searchOpen ? <X className="size-[18px]" /> : <Search className="size-[18px]" />}
          </button>
          <button type="button" onClick={toggle} className="focus-ring hidden rounded-full p-2.5 hover:bg-card sm:block" aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}>
            {dark ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
          </button>

          <Dropdown
            label="Notifications"
            className="w-[min(22rem,calc(100vw-2rem))] p-0"
            trigger={(t) => (
              <button type="button" onClick={t.toggle} aria-expanded={t["aria-expanded"]} aria-haspopup="menu" className="focus-ring relative rounded-full p-2.5 hover:bg-card" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}>
                <Bell className="size-[18px]" />
                {unread > 0 && <span className="absolute right-1.5 top-1.5 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground ring-2 ring-background">{unread}</span>}
              </button>
            )}
          >
            {(close) => (
              <div>
                <div className="flex items-center justify-between border-b border-border px-4 py-3">
                  <p className="text-sm font-semibold">Notifications</p>
                  {unread > 0 && (
                    <button type="button" className="focus-ring rounded text-xs font-medium text-primary hover:underline" onClick={() => notifications.markAllRead()}>
                      Mark all as read
                    </button>
                  )}
                </div>
                <div className="max-h-96 overflow-y-auto p-1.5">
                  {mine.length === 0 && <p className="px-3 py-8 text-center text-sm text-muted-foreground">You’re all caught up 🎉</p>}
                  {mine.slice(0, 12).map((n) => (
                    <button
                      key={n.id}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        notifications.markRead(n.id);
                        close();
                        if (n.requestId) navigate(`/requests/${n.requestId}`);
                      }}
                      className="flex w-full gap-3 rounded-lg px-2.5 py-2.5 text-left outline-none hover:bg-muted focus-visible:bg-muted"
                    >
                      <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-primary")} aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className={cn("block text-sm", !n.read && "font-semibold")}>{n.title}</span>
                        <span className="line-clamp-2 block text-xs text-muted-foreground">{n.body}</span>
                        <span className="mt-1 block text-[11px] text-muted-foreground">{relativeTime(n.at)}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </Dropdown>

          <Dropdown
            label="Account"
            trigger={(t) => (
              <button type="button" onClick={t.toggle} aria-expanded={t["aria-expanded"]} aria-haspopup="menu" className="focus-ring ml-1 flex items-center gap-2 rounded-full p-0.5 pr-0.5 hover:bg-card md:pr-3" aria-label="Account menu">
                <Avatar user={user} size="sm" />
                <span className="hidden text-left md:block">
                  <span className="block text-sm font-medium leading-tight">{user.name.split(" ")[0]}</span>
                  <span className="block text-[11px] leading-tight text-muted-foreground">{roleLabel(user)}</span>
                </span>
              </button>
            )}
          >
            {(close) => (
              <>
                <div className="px-2.5 pb-2 pt-1.5">
                  <p className="text-sm font-semibold">{user.name}</p>
                  <p className="text-xs text-muted-foreground">{user.email}</p>
                </div>
                <MenuItem icon={<UserRound />} onClick={() => { close(); navigate("/settings"); }}>Profile & notifications</MenuItem>
                <MenuItem icon={dark ? <Sun /> : <Moon />} onClick={toggle}>{dark ? "Light mode" : "Dark mode"}</MenuItem>
                <div className="my-1.5 border-t border-border" />
                <p className="px-2.5 pb-1 pt-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Switch demo account</p>
                {demoUsers.map((u) => (
                  <MenuItem
                    key={u.id}
                    onClick={() => {
                      close();
                      auth.switchTo(u.id);
                      navigate("/dashboard");
                      toast.info(`Signed in as ${u.name}`, roleLabel(u));
                    }}
                    className={cn(u.id === user.id && "bg-muted")}
                    icon={<Avatar user={u} size="xs" />}
                  >
                    <span className="flex-1">
                      <span className="block leading-tight">{u.name}</span>
                      <span className="block text-[11px] text-muted-foreground">{roleLabel(u)}</span>
                    </span>
                  </MenuItem>
                ))}
                <div className="my-1.5 border-t border-border" />
                <MenuItem icon={<LogOut />} danger onClick={() => { close(); auth.signOut(); navigate("/login"); }}>Sign out</MenuItem>
              </>
            )}
          </Dropdown>
        </div>
      </div>
    </header>
  );
}
