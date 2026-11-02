import { cn, initials } from "@/lib/utils";
import type { User } from "@/lib/types";

export function Avatar({ user, size = "md", className }: { user?: Pick<User, "name" | "avatarHue">; size?: "xs" | "sm" | "md" | "lg"; className?: string }) {
  const s = { xs: "size-6 text-[10px]", sm: "size-8 text-xs", md: "size-9 text-xs", lg: "size-12 text-sm" }[size];
  const hue = user?.avatarHue ?? 200;
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-semibold ring-2 ring-card", s, className)}
      style={{ background: `hsl(${hue} 70% 88%)`, color: `hsl(${hue} 45% 28%)` }}
      aria-hidden
    >
      {user ? initials(user.name) : "?"}
    </span>
  );
}
