import type { Approval, AuditLog, Budget, Category, Comment, DB, Department, Notification, SpendRequest, Status, User } from "./types";
import { toISODate } from "./utils";

export const DB_VERSION = 4;
export const DEMO_PASSWORD = "demo1234";

const departments: Department[] = [
  { id: "d-mkt", name: "Marketing" },
  { id: "d-tech", name: "Technology" },
  { id: "d-ops", name: "Operations" },
  { id: "d-ppl", name: "People & Culture" },
  { id: "d-fin", name: "Finance" },
];

const users: User[] = [
  { id: "u-jeremia", name: "Jeremia N Mataniari Hutabarat", email: "jeremiamataniari@gmail.com", role: "finance", isDirector: true, title: "Finance Director", departmentId: "d-fin", avatarHue: 190, prefs: { email: true, whatsapp: false } },
  { id: "u-rina", name: "Rina Wijaya", email: "rina@expenseflow.demo", phone: "+62 812-1111-2201", role: "employee", title: "Marketing Executive", departmentId: "d-mkt", managerId: "u-budi", avatarHue: 12, prefs: { email: true, whatsapp: false } },
  { id: "u-andi", name: "Andi Pratama", email: "andi@expenseflow.demo", role: "employee", title: "Software Engineer", departmentId: "d-tech", managerId: "u-budi", avatarHue: 220, prefs: { email: true, whatsapp: false } },
  { id: "u-maya", name: "Maya Kusuma", email: "maya@expenseflow.demo", role: "employee", title: "Operations Lead", departmentId: "d-ops", managerId: "u-budi", avatarHue: 280, prefs: { email: true, whatsapp: false } },
  { id: "u-budi", name: "Budi Santoso", email: "budi@expenseflow.demo", phone: "+62 812-1111-2202", role: "manager", title: "Head of Commercial", departmentId: "d-mkt", managerId: "u-sari", avatarHue: 160, prefs: { email: true, whatsapp: true } },
  { id: "u-sari", name: "Sari Halim", email: "sari@expenseflow.demo", role: "manager", isDirector: true, title: "Finance & Operations Director", departmentId: "d-fin", avatarHue: 340, prefs: { email: true, whatsapp: false } },
  { id: "u-dewi", name: "Dewi Lestari", email: "dewi@expenseflow.demo", phone: "+62 812-1111-2203", role: "finance", title: "Finance Controller", departmentId: "d-fin", managerId: "u-sari", avatarHue: 40, prefs: { email: true, whatsapp: true } },
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
  { title: "Instagram & TikTok ads – year-end campaign", cat: "c-mkt", amount: 7_500_000, by: "u-rina", status: "pending_manager", daysAgo: 1, needIn: 6, type: "advance", priority: "urgent", vendor: "Meta Platforms Ireland", desc: "Paid social budget for the December awareness campaign targeting Jabodetabek, 3-week flight.", files: ["Media plan Dec.pdf"] },
  { title: "Snacks & drinks for product launch event", cat: "c-mkt", amount: 2_350_000, by: "u-rina", status: "approved", daysAgo: 2, needIn: 1, type: "reimbursement", vendor: "Kopi Kenangan Corporate", desc: "Catering for 60 guests at the product launch held at the Senayan office.", files: ["Receipt-launch.jpg"] },
  { title: "Taxi to client meeting (SCBD)", cat: "c-travel", amount: 185_000, by: "u-rina", status: "paid", daysAgo: 0, needIn: 0, type: "reimbursement", vendor: "Bluebird", desc: "Round trip to PT Nusantara Retail for the Q1 campaign pitch.", files: ["Bluebird-receipt.png"] },
  { title: "Brochure printing for INAPA expo", cat: "c-mkt", amount: 4_200_000, by: "u-rina", status: "rejected", daysAgo: 9, needIn: 7, type: "advance", vendor: "Percetakan Jaya Abadi", desc: "1.500 tri-fold brochures, art paper 150gsm.", files: ["Quotation-brochure.pdf"], reason: "Please use our existing vendor contract with PT Cetak Prima — pricing is ~20% lower." },
  { title: "Canva Pro team subscription", cat: "c-tech", amount: 1_650_000, by: "u-rina", status: "draft", daysAgo: 0, needIn: 10, type: "advance", vendor: "Canva", desc: "Annual Canva Pro for 3 marketing seats." },
  { title: "Expo booth rental – ICE BSD", cat: "c-mkt", amount: 18_500_000, by: "u-rina", status: "pending_director", daysAgo: 3, needIn: 9, type: "advance", priority: "urgent", vendor: "PT Pameran Nusantara", desc: "3x6m booth incl. basic construction, electricity and 2 exhibitor passes.", files: ["Booth-quotation.pdf", "Floor-plan.png"] },
  { title: "Flight Jakarta–Surabaya roadshow", cat: "c-travel", amount: 3_400_000, by: "u-rina", status: "revision", daysAgo: 4, needIn: 8, type: "advance", vendor: "Garuda Indonesia", desc: "Return flights for 2 people for the East Java distributor roadshow.", reason: "Please attach the flight quotation and the roadshow agenda." },
  { title: "AWS credits top-up", cat: "c-tech", amount: 12_800_000, by: "u-andi", status: "pending_finance", daysAgo: 2, needIn: 5, type: "advance", vendor: "Amazon Web Services", desc: "Prepaid credits for staging & production workloads for the next billing cycle.", files: ["AWS-estimate.pdf"] },
  { title: "Mechanical keyboards for dev team", cat: "c-office", amount: 3_750_000, by: "u-andi", status: "pending_manager", daysAgo: 1, needIn: 7, type: "advance", vendor: "Tokopedia – Rexus Official", desc: "5 units for new engineering hires joining this month." },
  { title: "JetBrains IDE licenses", cat: "c-tech", amount: 6_200_000, by: "u-andi", status: "paid", daysAgo: 62, needIn: 2, type: "advance", vendor: "JetBrains s.r.o.", desc: "All Products Pack renewal for 4 engineers.", files: ["JetBrains-invoice.pdf"] },
  { title: "Forklift maintenance – Cikarang warehouse", cat: "c-ops", amount: 9_800_000, by: "u-maya", status: "approved", daysAgo: 33, needIn: 3, type: "advance", vendor: "PT Mitra Forklift", desc: "Scheduled 2,000-hour service for 2 forklifts incl. hydraulic oil replacement.", files: ["Service-quotation.pdf"] },
  { title: "Courier services – June", cat: "c-ops", amount: 2_150_000, by: "u-maya", status: "paid", daysAgo: 150, needIn: 1, type: "reimbursement", vendor: "JNE Express", desc: "Sample shipments to distributors.", files: ["JNE-statement.pdf"] },
  { title: "Accounting software renewal", cat: "c-tech", amount: 8_900_000, by: "u-dewi", status: "pending_manager", daysAgo: 2, needIn: 12, type: "advance", vendor: "Jurnal by Mekari", desc: "Annual subscription renewal (Pro plan, 5 users).", files: ["Jurnal-quote.pdf"] },
  { title: "Fire safety training for warehouse staff", cat: "c-hr", amount: 5_500_000, by: "u-maya", status: "paid", daysAgo: 92, needIn: 4, type: "advance", vendor: "K3 Training Center", desc: "One-day certified training for 25 staff.", files: ["Training-invoice.pdf"] },
  { title: "Influencer collaboration – Q3 launch", cat: "c-mkt", amount: 15_000_000, by: "u-rina", status: "paid", daysAgo: 122, needIn: 5, type: "advance", vendor: "Kreator Kolektif", desc: "3 macro-influencers, 2 reels + 3 stories each.", files: ["Influencer-SOW.pdf"] },
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
    const steps: { step: Approval["step"]; actor: string; status: Status }[] = [
      { step: "manager", actor: managerId, status: "pending_manager" },
      ...(highValue && managerId !== "u-sari" ? [{ step: "director" as const, actor: "u-sari", status: "pending_director" as Status }] : []),
      { step: "finance", actor: "u-dewi", status: "pending_finance" },
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
      approvals.push({ id: id("ap"), requestId: rid, step: "payment", actorId: "u-dewi", decision: "paid", note: req.paymentRef, at: iso(t) });
      log("u-dewi", "paid", `Marked as paid · ref ${req.paymentRef}`);
    }
    req.updatedAt = iso(t);
    requests.push(req);
  });

  const c = (requestId: string, authorId: string, body: string, hoursAfter: number) => {
    const r = requests.find((x) => x.id === requestId)!;
    comments.push({ id: id("cm"), requestId, authorId, body, at: iso(new Date(r.createdAt).getTime() + hoursAfter * HOUR) });
  };
  c("r-006", "u-budi", "Approved from my side — this booth is key for Q1 pipeline. Needs director sign-off since it's above 10 jt.", 6);
  c("r-006", "u-rina", "Thanks Pak! Vendor needs the DP by Friday to hold the slot.", 7);
  c("r-007", "u-rina", "Noted, I'll upload the quotation from the travel agent today.", 30);
  c("r-008", "u-andi", "We're at 85% of current credits, so this is time-sensitive.", 1);
  c("r-004", "u-rina", "Understood, I'll re-quote with Cetak Prima.", 50);

  const note = (userId: string, title: string, body: string, requestId: string, hoursAgo: number, read = false) =>
    notifications.push({ id: id("nt"), userId, title, body, requestId, read, at: iso(now - hoursAgo * HOUR) });
  // Jeremia (Director + Finance)
  note("u-jeremia", "High-value approval needed", "“Expo booth rental – ICE BSD” (Rp 18.500.000) needs director approval.", "r-006", 60);
  note("u-jeremia", "Ready for finance review", "“AWS credits top-up” is waiting for final approval.", "r-008", 12);
  note("u-jeremia", "Awaiting payment", "“Snacks & drinks for product launch event” is approved and ready to pay.", "r-002", 70);
  // Others
  note("u-rina", "Revision requested", "Budi asked for changes on “Flight Jakarta–Surabaya roadshow”.", "r-007", 20);
  note("u-rina", "Request paid", "“Taxi to client meeting (SCBD)” has been paid.", "r-003", 2);
  note("u-rina", "Request rejected", "“Brochure printing for INAPA expo” was rejected by Budi.", "r-004", 150, true);
  note("u-budi", "New request to review", "Rina submitted “Instagram & TikTok ads – year-end campaign”.", "r-001", 22);
  note("u-budi", "New request to review", "Andi submitted “Mechanical keyboards for dev team”.", "r-009", 24);
  note("u-sari", "High-value approval needed", "“Expo booth rental – ICE BSD” (Rp 18.500.000) needs director approval.", "r-006", 60);
  note("u-sari", "New request to review", "Dewi submitted “Accounting software renewal”.", "r-013", 40);
  note("u-dewi", "Ready for finance review", "“AWS credits top-up” passed manager & director approval.", "r-008", 12);
  note("u-dewi", "Awaiting payment", "“Snacks & drinks for product launch event” is approved and ready to pay.", "r-002", 70, true);

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
