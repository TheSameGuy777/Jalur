import { useMemo, useState } from "react";
import { QueueCard } from "@/pages/Dashboard";
import { EmptyState, NoAccess, PageHeader, StatusBadge } from "@/components/shared";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ListSkeleton } from "@/components/ui/skeleton";
import { Tabs } from "@/components/ui/tabs";
import { useSimulatedLoading } from "@/lib/hooks";
import { navigate } from "@/lib/router";
import { useDB } from "@/lib/store";
import type { User } from "@/lib/types";
import { formatDateTime, formatIDR } from "@/lib/utils";
import { approverQueue } from "@/lib/workflow";

const DECISION_TONE = { approved: "green", rejected: "red", revision: "orange", paid: "blue" } as const;

export default function Approvals({ user }: { user: User }) {
  const db = useDB();
  const [tab, setTab] = useState<"waiting" | "history">("waiting");
  const loading = useSimulatedLoading(tab, 300);
  const queue = useMemo(() => approverQueue(db, user), [db, user]);
  const history = useMemo(() => db.approvals.filter((a) => a.actorId === user.id).sort((a, b) => b.at.localeCompare(a.at)), [db, user.id]);
  if (user.role === "employee") return <NoAccess />;

  return (
    <>
      <PageHeader
        eyebrow="Approvals"
        title="Waiting for my approval"
        description={user.role === "finance" ? "Final approvals and payments across the company." : user.isDirector ? "Team approvals and high-value (director) approvals." : "Requests from your direct reports."}
      />
      <Tabs
        className="mb-5"
        size="lg"
        value={tab}
        onChange={setTab}
        items={[
          { value: "waiting", label: "Waiting for me", count: queue.length },
          { value: "history", label: "Processed by me", count: history.length },
        ]}
      />
      {loading ? (
        <Card><ListSkeleton rows={4} /></Card>
      ) : tab === "waiting" ? (
        <QueueCard db={db} user={user} rows={queue} title="Queue" description="Urgent first, then oldest. Click a row for full details." />
      ) : (
        <Card>
          {history.length === 0 ? (
            <EmptyState title="No decisions yet" description="Requests you approve, reject or send back will appear here." />
          ) : (
            <ul className="divide-y divide-border">
              {history.map((a) => {
                const r = db.requests.find((x) => x.id === a.requestId);
                if (!r) return null;
                const requester = db.users.find((u) => u.id === r.requesterId);
                return (
                  <li key={a.id}>
                    <button type="button" onClick={() => navigate(`/requests/${r.id}`)} className="focus-ring flex w-full flex-col gap-2 px-5 py-4 text-left hover:bg-surface sm:flex-row sm:items-center">
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <Avatar user={requester} size="sm" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{r.title}</p>
                          <p className="truncate text-xs text-muted-foreground">{requester?.name} · {formatDateTime(a.at)}{a.note ? ` · “${a.note}”` : ""}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 pl-11 sm:pl-0">
                        <Badge tone={DECISION_TONE[a.decision]} className="capitalize">{a.decision === "revision" ? "Sent back" : a.decision}</Badge>
                        <span className="w-28 text-right text-sm font-medium tabular-nums">{formatIDR(r.amount)}</span>
                        <StatusBadge status={r.status} className="hidden md:inline-flex" />
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}
    </>
  );
}
