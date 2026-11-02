import { ChevronRight, Paperclip, Zap } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { CategoryTag, StatusBadge } from "@/components/shared";
import { navigate } from "@/lib/router";
import { useDB } from "@/lib/store";
import type { SpendRequest } from "@/lib/types";
import { cn, formatDate, formatIDR } from "@/lib/utils";

/** Responsive request list: table on ≥md, stacked cards on mobile. */
export function RequestList({ rows, showRequester, dense }: { rows: SpendRequest[]; showRequester?: boolean; dense?: boolean }) {
  const db = useDB();
  const cat = (id: string) => db.categories.find((c) => c.id === id);
  const user = (id: string) => db.users.find((u) => u.id === id);
  const open = (r: SpendRequest) => navigate(`/requests/${r.id}`);

  return (
    <>
      {/* Desktop table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th scope="col" className="px-5 py-3 font-medium">Request</th>
              {showRequester && <th scope="col" className="px-3 py-3 font-medium">Requester</th>}
              {!dense && <th scope="col" className="px-3 py-3 font-medium">Category</th>}
              <th scope="col" className="whitespace-nowrap px-3 py-3 font-medium">Date needed</th>
              <th scope="col" className="px-3 py-3 font-medium">Status</th>
              <th scope="col" className="px-5 py-3 text-right font-medium">Amount</th>
              <th scope="col" className="w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr
                key={r.id}
                tabIndex={0}
                onClick={() => open(r)}
                onKeyDown={(e) => e.key === "Enter" && open(r)}
                className="focus-ring group cursor-pointer transition-colors hover:bg-surface"
                aria-label={`Open ${r.title}`}
              >
                <td className={cn("px-5", dense ? "py-3" : "py-4")}>
                  <div className="flex items-center gap-2">
                    <span className={cn("truncate font-medium", dense ? "max-w-[16rem]" : "max-w-[22rem]")}>{r.title}</span>
                    {r.priority === "urgent" && (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-red-600 dark:bg-red-950/40 dark:text-red-400">
                        <Zap className="size-3" aria-hidden />
                        Urgent
                      </span>
                    )}
                    {r.attachments.length > 0 && <Paperclip className="size-3.5 text-muted-foreground" aria-label={`${r.attachments.length} attachments`} />}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {r.code} · {dense ? cat(r.categoryId)?.name : r.type === "advance" ? "Advance" : "Reimbursement"}
                  </div>
                </td>
                {showRequester && (
                  <td className="px-3">
                    <div className="flex items-center gap-2 whitespace-nowrap">
                      <Avatar user={user(r.requesterId)} size="xs" />
                      <span className="truncate">{user(r.requesterId)?.name}</span>
                    </div>
                  </td>
                )}
                {!dense && <td className="px-3"><CategoryTag category={cat(r.categoryId)} className="whitespace-nowrap" /></td>}
                <td className="whitespace-nowrap px-3 tabular-nums text-muted-foreground">{formatDate(r.dateNeeded)}</td>
                <td className="px-3"><StatusBadge status={r.status} /></td>
                <td className="whitespace-nowrap px-5 text-right font-medium tabular-nums">{formatIDR(r.amount)}</td>
                <td className="pr-4"><ChevronRight className="size-4 text-muted-foreground opacity-0 transition group-hover:opacity-100" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <ul className="divide-y divide-border md:hidden">
        {rows.map((r) => (
          <li key={r.id}>
            <button type="button" onClick={() => open(r)} className="focus-ring flex w-full items-start gap-3 px-4 py-4 text-left active:bg-surface">
              {showRequester ? <Avatar user={user(r.requesterId)} size="sm" /> : <span className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ background: cat(r.categoryId)?.color }} aria-hidden />}
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="truncate font-medium">{r.title}</p>
                  <p className="shrink-0 font-medium tabular-nums">{formatIDR(r.amount)}</p>
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {showRequester ? `${user(r.requesterId)?.name} · ` : ""}
                  {cat(r.categoryId)?.name} · {formatDate(r.dateNeeded)}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <StatusBadge status={r.status} />
                  {r.priority === "urgent" && <span className="text-[10px] font-semibold uppercase text-red-600 dark:text-red-400">Urgent</span>}
                </div>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
