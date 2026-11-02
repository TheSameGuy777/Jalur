import { useEffect, useState, type AnchorHTMLAttributes } from "react";

/** Tiny hash router — no server config needed, works on any static host. */
function read() {
  const raw = window.location.hash.replace(/^#/, "") || "/dashboard";
  const [path, qs = ""] = raw.split("?");
  return { path: path || "/dashboard", query: new URLSearchParams(qs) };
}

export function useRoute() {
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const on = () => setRoute(read());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return route;
}

export function navigate(to: string, opts?: { replace?: boolean }) {
  if (opts?.replace) window.location.replace(`#${to}`);
  else window.location.hash = to;
  window.scrollTo({ top: 0 });
}

export function match(pattern: string, path: string): Record<string, string> | null {
  const p = pattern.split("/").filter(Boolean);
  const a = path.split("/").filter(Boolean);
  if (p.length !== a.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i]!.startsWith(":")) params[p[i]!.slice(1)] = decodeURIComponent(a[i]!);
    else if (p[i] !== a[i]) return null;
  }
  return params;
}

export function Link({ to, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) {
  return <a href={`#${to}`} {...props} />;
}
