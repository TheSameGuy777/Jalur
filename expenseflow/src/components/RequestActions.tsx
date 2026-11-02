import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, Banknote, RotateCcw, Trash2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/form";
import { toast } from "@/components/ui/toast";
import { navigate } from "@/lib/router";
import { errorMessage, getDB, requests } from "@/lib/store";
import type { SpendRequest } from "@/lib/types";
import { formatIDR } from "@/lib/utils";
import { nextStatus, STATUS_META } from "@/lib/workflow";

type Kind = "reject" | "revise" | "pay" | "cancel" | "delete";

const REJECT_PRESETS = ["Outside budget", "Missing documents", "Use preferred vendor", "Not a business expense"];

function IconBubble({ tone, children }: { tone: "red" | "amber" | "blue"; children: ReactNode }) {
  const c = { red: "bg-red-50 text-red-600 dark:bg-red-950/50", amber: "bg-amber-50 text-amber-600 dark:bg-amber-950/50", blue: "bg-blue-50 text-blue-600 dark:bg-blue-950/50" }[tone];
  return <span className={`flex size-10 shrink-0 items-center justify-center rounded-full [&_svg]:size-5 ${c}`}>{children}</span>;
}

function ActionDialog({ kind, req, onClose }: { kind: Kind | null; req: SpendRequest | null; onClose: () => void }) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setText(kind === "pay" ? `TRF-${Math.floor(100000 + Math.random() * 899999)}` : "");
    setError(undefined);
    setBusy(false);
  }, [kind, req?.id]);
  if (!kind || !req) return null;

  const run = (fn: () => void, msg: string, desc?: string, after?: () => void) => {
    setBusy(true);
    // small delay so the loading state is perceptible (mimics a network call)
    window.setTimeout(() => {
      try {
        fn();
        toast.success(msg, desc);
        onClose();
        after?.();
      } catch (e) {
        toast.error("Action failed", errorMessage(e));
        setBusy(false);
      }
    }, 350);
  };

  const requireText = (min: number, label: string) => {
    if (text.trim().length < min) {
      setError(`${label} (min. ${min} characters).`);
      return false;
    }
    return true;
  };

  const common = { open: true, onClose };
  switch (kind) {
    case "reject":
      return (
        <Dialog
          {...common}
          icon={<IconBubble tone="red"><XCircle /></IconBubble>}
          title="Reject request?"
          description={<>“{req.title}” · {formatIDR(req.amount)}. The requester will be notified with your reason.</>}
          footer={
            <>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button variant="destructive" loading={busy} onClick={() => requireText(5, "Please give a reason") && run(() => requests.reject(req.id, text.trim()), "Request rejected", req.title)}>
                Reject request
              </Button>
            </>
          }
        >
          <div className="mb-3 flex flex-wrap gap-2">
            {REJECT_PRESETS.map((p) => (
              <button key={p} type="button" onClick={() => { setText(p + ": "); setError(undefined); }} className="focus-ring rounded-full border border-border px-3 py-1 text-xs hover:bg-muted">
                {p}
              </button>
            ))}
          </div>
          <Field label="Reason" required error={error}>
            {(a) => <Textarea {...a} data-autofocus value={text} onChange={(e) => { setText(e.target.value); setError(undefined); }} placeholder="e.g. Please use the existing vendor contract — pricing is lower." />}
          </Field>
        </Dialog>
      );
    case "revise":
      return (
        <Dialog
          {...common}
          icon={<IconBubble tone="amber"><RotateCcw /></IconBubble>}
          title="Request revision"
          description="The request goes back to the requester. They can edit and resubmit it."
          footer={
            <>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button variant="ink" loading={busy} onClick={() => requireText(5, "Tell the requester what to change") && run(() => requests.requestRevision(req.id, text.trim()), "Revision requested", req.title)}>
                Send back for revision
              </Button>
            </>
          }
        >
          <Field label="What needs to change?" required error={error}>
            {(a) => <Textarea {...a} data-autofocus value={text} onChange={(e) => { setText(e.target.value); setError(undefined); }} placeholder="e.g. Please attach the vendor quotation and split hotel vs. flight costs." />}
          </Field>
        </Dialog>
      );
    case "pay":
      return (
        <Dialog
          {...common}
          icon={<IconBubble tone="blue"><Banknote /></IconBubble>}
          title="Mark as paid"
          description={<>Confirm that {formatIDR(req.amount)} has been transferred for “{req.title}”.</>}
          footer={
            <>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button loading={busy} onClick={() => run(() => requests.markPaid(req.id, text), "Marked as paid", `${req.code} · ${formatIDR(req.amount)}`)}>Confirm payment</Button>
            </>
          }
        >
          <Field label="Payment / transfer reference" optional hint="Shown to the requester and stored in the audit log.">
            {(a) => <Input {...a} data-autofocus value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. TRF-882011" />}
          </Field>
        </Dialog>
      );
    case "cancel":
      return (
        <Dialog
          {...common}
          icon={<IconBubble tone="amber"><AlertTriangle /></IconBubble>}
          title="Cancel this request?"
          description="Approvers will no longer see it in their queue. This can’t be undone — you’d need to create a new request."
          footer={
            <>
              <Button variant="outline" onClick={onClose}>Keep request</Button>
              <Button variant="destructive" loading={busy} onClick={() => run(() => requests.cancel(req.id), "Request cancelled", req.title)}>Cancel request</Button>
            </>
          }
        />
      );
    case "delete":
      return (
        <Dialog
          {...common}
          icon={<IconBubble tone="red"><Trash2 /></IconBubble>}
          title="Delete draft?"
          description={<>“{req.title}” and its attachments will be permanently deleted.</>}
          footer={
            <>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button variant="destructive" loading={busy} onClick={() => run(() => requests.deleteDraft(req.id), "Draft deleted", undefined, () => navigate("/requests"))}>Delete draft</Button>
            </>
          }
        />
      );
  }
}

/** Hook bundling quick actions + their confirmation dialogs. */
export function useRequestActions() {
  const [state, setState] = useState<{ kind: Kind; req: SpendRequest } | null>(null);
  const approve = (req: SpendRequest) => {
    try {
      const next = nextStatus(getDB(), req);
      requests.approve(req.id);
      toast.success("Approved", next === "approved" ? `${req.code} is fully approved` : `${req.code} → ${STATUS_META[next].label}`);
    } catch (e) {
      toast.error("Couldn’t approve", errorMessage(e));
    }
  };
  return {
    approve,
    open: (kind: Kind, req: SpendRequest) => setState({ kind, req }),
    dialogs: <ActionDialog kind={state?.kind ?? null} req={state?.req ?? null} onClose={() => setState(null)} />,
  };
}
