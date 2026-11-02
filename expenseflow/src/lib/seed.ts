import type { Approval, AuditLog, Budget, Category, Comment, DB, Department, Notification, SpendRequest, Status, User } from "./types";
import { toISODate } from "./utils";

export const DB_VERSION = 4; // bumped so browsers reload the new accounts
export const DEMO_PASSWORD = "demo1234"; // default for everyone without their own password

// Per-user passwords. Anyone not listed here uses DEMO_PASSWORD.
export const USER_PASSWORDS: Record<string, string> = {
  "u-jeremia": "Lameloball23$",
};
export const getPassword = (userId: string): string => USER_PASSWORDS[userId] ?? DEMO_PASSWORD;

const ADMIN_ID = "u-jeremia";

const departments: Department[] = [
  { id: "d-mkt", name: "Marketing" },
  { id: "d-tech", name: "Technology" },
  { id: "d-ops", name: "Operations" },
  { id: "d-ppl", name: "People & Culture" },
  { id: "d-fin", name: "Finance" },
];

const users: User[] = [
  { id: "u-jeremia", name: "Jeremia", email: "jeremia@yourcompany.com", role: "finance", isDirector: true, title: "Admin", departmentId: "d-fin", avatarHue: 160, prefs: { email: true, whatsapp: false } },
  { id: "u-robby", name: "Robby", email: "robby@yourcompany.com", role: "employee", title: "Team Member", departmentId: "d-mkt", managerId: "u-jeremia", avatarHue: 12, prefs: { email: true, whatsapp: false } },
  { id: "u-abui", name: "Abui", email: "abui@yourcompany.com", role: "employee", title: "Team Member", departmentId: "d-tech", managerId: "u-jeremia", avatarHue: 220, prefs: { email: true, whatsapp: false } },
  { id: "u-a", name: "A", email: "a@yourcompany.com", role: "employee", title: "Team Member", departmentId: "d-ops", managerId: "u-jeremia", avatarHue: 280, prefs: { email: true, whatsapp: false } },
  { id: "u-b", name: "B", email: "b@yourcompany.com", role: "employee", title: "Team Member", departmentId: "d-ppl", managerId: "u-jeremia", avatarHue: 40, prefs: { email: true, whatsapp: false } },
];

const categories: Category[] = [
  { id: "c-mkt", name: "Marketing", color: "#14b8a6", active: true },
  { id: "c-tech", name: "Tech", color: "#6366f1", active: true },
  { id: "c-ops", name: "Operations", color: "#f59e0b", active: true },
  { id: "c-hr", name: "HR", color: "#ec4899", active: true },
  { id: "c-travel", name: "Travel", color: "#0ea5e9", active: true },
  { id: "c-office", name: "Office Supplies", color: "#84cc16", active: true },
  { id: "c-other", name: "Other", color: "#94a3b8", active: true },
];

const budgets: Budget[] = [
  { id: "b-1", scope: "category", refId: "c-mkt", period: "monthly", amount: 45_000_000 },
  { id: "b-2", scope: "category", refId: "c-tech", period: "monthly", amount: 30_000_000 },
  { id: "b-3", scope: "category", refId: "c-ops", period: "monthly", amount: 20_000_000 },
  { id: "b-4", scope: "category", refId: "c-hr", period: "monthly", amount: 10_000_000 },
  { id: "b-5", scope: "category", refId: "c-travel", period: "monthly", amount: 8_000_000 },
  { id: "b-6", scope: "category", refId: "c-office", period: "monthly", amount: 5_000_000 },
  { id: "b-7", scope: "category", refId: "c-other", period: "monthly", amount: 3_000_000 },
  { id: "b-8", scope: "department", refId: "d-mkt", period: "quarterly", amount: 120_000_000 },
  { id: "b-9", scope: "department", refId: "d-tech", period: "quarterly", amount: 90_000_000 },
  { id: "b-10", scope: "department", refId: "d-ops", period: "quarterly", amount: 60_000_000 },
  { id: "b-11", scope: "department", refId: "d-ppl", period: "quarterly", amount: 30_000_000 },
  { id: "b-12", scope: "department", refId: "d-fin", period: "quarterly", amount: 25_000_000 },
];

interface SeedSpec {
  title: string;
  cat: string;
  amount: number;
  by: string;
  status: Status;
  daysAgo: number; // created
  needIn: number; // dateNeeded offset from created
  type: "advance" | "reimbursement";
  priority?: "urgent";
  vendor?: string;
  desc: string;
  files?: string[];
  reason?: string;
}

const specs: SeedSpec[] = [
  { title: "Instagram & TikTok ads – year-end campaign", cat: "c-mkt", amount: 7_500_000, by: "u-robby", status: "pending_manager", daysAgo: 1, needIn: 6, type: "advance", priority: "urgent", vendor: "Meta Platforms Ireland", desc: "Paid social budget for the December awareness campaign targeting Jabodetabek, 3-week flight.", files: ["Media plan Dec.pdf"] },
  { title: "Snacks & drinks for product launch event", cat: "c-mkt", amount: 2_350_000, by: "u-robby", status: "approved", daysAgo: 2, needIn: 1, type: "reimbursement", vendor: "Kopi Kenangan Corporate", desc: "Catering for 60 guests at the product launch held at the Senayan office.", files: ["Receipt-launch.jpg"] },
  { title: "Taxi to client meeting (SCBD)", cat: "c-travel", amount: 185_000, by: "u-robby", status: "paid", daysAgo: 0, needIn: 0, type: "reimbursement", vendor: "Bluebird", desc: "Round trip to PT Nusantara Retail for the Q1 campaign pitch.", files: ["Bluebird-receipt.png"] },
  { title: "Brochure printing for INAPA expo", cat: "c-mkt", amount: 4_200_000, by: "u-robby", status: "rejected", daysAgo: 9, needIn: 7, type: "advance", vendor: "Percetakan Jaya Abadi", desc: "1.500 tri-fold brochures, art paper 150gsm.", files: ["Quotation-brochure.pdf"], reason: "Please use our existing vendor contract with PT Cetak Prima — pricing is ~20% lower." },
  { title: "Canva Pro team subscription", cat: "c-tech", amount: 1_650_000, by: "u-robby", status: "draft", daysAgo: 0, needIn: 10, type: "advance", vendor: "Canva", desc: "Annual Canva Pro for 3 marketing seats." },
  { title: "Expo booth rental – ICE BSD", cat: "c-mkt", amount: 18_500_000, by: "u-robby", status: "pending_finance", daysAgo: 3, needIn: 9, type: "advance", priority: "urgent", vendor: "PT Pameran Nusantara", desc: "3x6m booth incl. basic construction, electricity and 2 exhibitor passes.", files: ["Booth-quotation.pdf", "Floor-plan.png"] },
  { title: "Flight Jakarta–Surabaya roadshow", cat: "c-travel", amount: 3_400_000, by: "u-robby", status: "revision", daysAgo: 4, needIn: 8, type: "advance", vendor: "Garuda Indonesia", desc: "Return flights for 2 people for the East Java distributor roadshow.", reason: "Please attach the flight quotation and the roadshow agenda." },
  { title: "AWS credits top-up", cat: "c-tech", amount: 12_800_000, by: "u-abui", status: "pending_finance", daysAgo: 2, needIn: 5, type: "advance", vendor: "Amazon Web Services", desc: "Prepaid credits for staging & production workloads for the next billing cycle.", files: ["AWS-estimate.pdf"] },
  { title: "Mechanical keyboards for dev team", cat: "c-office", amount: 3_750_000, by: "u-abui", status: "pending_manager", daysAgo: 1, needIn: 7, type: "advance", vendor: "Tokopedia – Rexus Official", desc: "5 units for new engineering hires joining this month." },
  { title: "JetBrains IDE licenses", cat: "c-tech", amount: 6_200_000, by: "u-abui", status: "paid", daysAgo: 62, needIn: 2, type: "advance", vendor: "JetBrains s.r.o.", desc: "All Products Pack renewal for 4 engineers.", files: ["JetBrains-invoice.pdf"] },
  { title: "Forklift maintenance – Cikarang warehouse", cat: "c-ops", amount: 9_800_000, by: "u-a", status: "approved", daysAgo: 33, needIn: 3, type: "advance", vendor: "PT Mitra Forklift", desc: "Scheduled 2,000-hour service for 2 forklifts incl. hydraulic oil replacement.", files: ["Service-quotation.pdf"] },
  { title: "Courier services – June", cat: "c-ops", amount: 2_150_000, by: "u-a", status: "paid", daysAgo: 150, needIn: 1, type: "reimbursement", vendor: "JNE Express", desc: "Sample shipments to distributors.", files: ["JNE-statement.pdf"] },
  { title: "Accounting software renewal", cat: "c-tech", amount: 8_900_000, by: "u-b", status: "pending_manager", daysAgo: 2, needIn: 12, type: "advance", vendor: "Jurnal by Mekari", desc: "Annual subscription renewal (Pro plan, 5 users).", files: ["Jurnal-quote.pdf"] },
  { title: "Fire safety training for warehouse staff", cat: "c-hr", amount: 5_500_000, by: "u-a", status: "paid", daysAgo: 92, needIn: 4, type: "advance", vendor: "K3 Training Center", desc: "One-day certified training for 25 staff.", files: ["Training-invoice.pdf"] },
  { title: "Influencer collaboration – Q3 launch", cat: "c-mkt", amount: 15_000_000, by: "u-robby", status: "paid", daysAgo: 122, needIn: 5, type: "advance", vendor: "Kreator Kolektif", desc: "3 macro-influencers, 2 reels + 3 stories each.", files: ["Influencer-SOW.pdf"] },
];

const HOUR = 3_600_000;

export function createSeed(): DB {
  const now = Date.now();
  const requests: SpendRequest[] = [];
  const approvals: Approval[] = [];
  const auditLogs: AuditLog[] = [];
  const comments: Comment[] = [];
  const notifications: Notification[] = [];
  let n = 0;
  const id = (p: string) => `${p}-${++n}`;
  const iso = (t: number) => new Date(Math.min(t, now - 60_000)).toISOString();

  specs.forEach((s, i) => {
    const requester = users.find((u) => u.id === s.by)!;
    const created = now - s.daysAgo * 24 * HOUR - 6 * HOUR + i * 7 * 60_000;
    const needed = new Date(created + s.needIn * 24 * HOUR);
    const rid = `r-${String(i + 1).padStart(3, "0")}`;
    const req: SpendRequest = {
      id: rid,
      code: `SR-${new Date(created).getFullYear().toString().slice(2)}-${String(i + 1).padStart(4, "0")}`,
      title: s.title,
      categoryId: s.cat,
      amount: s.amount,
      dateNeeded: toISODate(needed),
      description: s.desc,
      vendor: s.vendor ?? "",
      attachments: (s.files ?? []).map((f, k) => ({ id: `${rid}-a${k}`, name: f, size: 120_000 + k * 48_000 + i * 3_100, type: f.endsWith(".pdf") ? "application/pdf" : "image/png" })),
      priority: s.priority ?? "normal",
      type: s.type,
      status: s.status,
      requesterId: s.by,
      departmentId: requester.departmentId,
      createdAt: iso(created),
      updatedAt: iso(created),
    };
    let t = created;
    const log = (actorId: string, action: AuditLog["action"], details: string) => {
      auditLogs.push({ id: id("log"), at: iso(t), actorId, action, entity: "request", entityId: rid, requestId: rid, details });
    };
    log(s.by, "created", `Created request ${req.code}`);
    if (s.status !== "draft") {
      t += 0.5 * HOUR;
      req.submittedAt = iso(t);
      log(s.by, "submitted", "Submitted for approval");
    }
    const highValue = s.amount > 10_000_000;
    const managerId = requester.managerId!;
    // Jeremia is both manager and director, so the extra director step is skipped.
    const steps: { step: Approval["step"]; actor: string; status: Status }[] = [
      { step: "manager", actor: managerId, status: "pending_manager" },
      ...(highValue && managerId !== ADMIN_ID ? [{ step: "director" as const, actor: ADMIN_ID, status: "pending_director" as Status }] : []),
      { step: "finance", actor: ADMIN_ID, status: "pending_finance" },
    ];
    const reached = (st: Status) => {
      const order: Status[] = ["pending_manager", "pending_director", "pending_finance", "approved", "paid"];
      return order.indexOf(s.status) > order.indexOf(st);
    };
    for (const st of steps) {
      if (s.status === "rejected" || s.status === "revision") {
        if (st.step === "manager") {
          t += 5 * HOUR;
          const decision = s.status === "rejected" ? "rejected" : "revision";
          approvals.push({ id: id("ap"), requestId: rid, step: st.step, actorId: st.actor, decision, note: s.reason, at: iso(t) });
          log(st.actor, s.status === "rejected" ? "rejected" : "revision_requested", s.reason ?? "");
          if (s.status === "rejected") req.rejectionReason = s.reason;
          else req.revisionNote = s.reason;
        }
        continue;
      }
      if (reached(st.status)) {
        t += 6 * HOUR;
        approvals.push({ id: id("ap"), requestId: rid, step: st.step, actorId: st.actor, decision: "approved", at: iso(t) });
        log(st.actor, "approved", `Approved at ${st.step} step`);
      }
    }
    if (s.status === "paid") {
      t += 20 * HOUR;
      req.paidAt = iso(t);
      req.paymentRef = `TRF-${String(880120 + i * 37)}`;
      approvals.push({ id: id("ap"), requestId: rid, step: "payment", actorId: ADMIN_ID, decision: "paid", note: req.paymentRef, at: iso(t) });
      log(ADMIN_ID, "paid", `Marked as paid · ref ${req.paymentRef}`);
    }
    req.updatedAt = iso(t);
    requests.push(req);
  });

  const c = (requestId: string, authorId: string, body: string, hoursAfter: number) => {
    const r = requests.find((x) => x.id === requestId)!;
    comments.push({ id: id("cm"), requestId, authorId, body, at: iso(new Date(r.createdAt).getTime() + hoursAfter * HOUR) });
  };
  c("r-006", "u-jeremia", "Approved at manager level. This booth is key for Q1 pipeline, moving on to finance.", 6);
  c("r-006", "u-robby", "Thanks! The vendor needs the DP by Friday to hold the slot.", 7);
  c("r-007", "u-robby", "Noted, I'll upload the quotation from the travel agent today.", 30);
  c("r-008", "u-abui", "We're at 85% of current credits, so this is time-sensitive.", 1);
  c("r-004", "u-robby", "Understood, I'll re-quote with Cetak Prima.", 50);

  const note = (userId: string, title: string, body: string, requestId: string, hoursAgo: number, read = false) =>
    notifications.push({ id: id("nt"), userId, title, body, requestId, read, at: iso(now - hoursAgo * HOUR) });
  note("u-robby", "Revision requested", "Jeremia asked for changes on “Flight Jakarta–Surabaya roadshow”.", "r-007", 20);
  note("u-robby", "Request paid", "“Taxi to client meeting (SCBD)” has been paid.", "r-003", 2);
  note("u-robby", "Request rejected", "“Brochure printing for INAPA expo” was rejected by Jeremia.", "r-004", 150, true);
  note("u-jeremia", "New request to review", "Robby submitted “Instagram & TikTok ads – year-end campaign”.", "r-001", 22);
  note("u-jeremia", "New request to review", "Abui submitted “Mechanical keyboards for dev team”.", "r-009", 24);
  note("u-jeremia", "New request to review", "B submitted “Accounting software renewal”.", "r-013", 40);
  note("u-jeremia", "Ready for finance review", "“AWS credits top-up” is ready for finance review.", "r-008", 12);
  note("u-jeremia", "Awaiting payment", "“Snacks & drinks for product launch event” is approved and ready to pay.", "r-002", 70, true);

  auditLogs.sort((a, b) => a.at.localeCompare(b.at));

  return {
    version: DB_VERSION,
    currentUserId: null,
    seq: specs.length,
    users,
    departments,
    categories,
    budgets,
    requests,
    approvals,
    comments,
    notifications,
    auditLogs,
    outbox: [],
    settings: { highValueRuleEnabled: true, highValueThreshold: 10_000_000, emailEnabled: true, whatsappEnabled: false },
  };
}
