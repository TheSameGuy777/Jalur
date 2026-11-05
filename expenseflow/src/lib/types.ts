export type Role = "employee" | "manager" | "finance";

export type Status =
  | "draft"
  | "pending_manager"
  | "pending_director"
  | "pending_finance"
  | "approved"
  | "paid"
  | "rejected"
  | "cancelled"
  | "revision";

export type Priority = "normal" | "urgent";
export type RequestType = "advance" | "reimbursement";
export type Channel = "in_app" | "email" | "whatsapp";
export type BudgetScope = "category" | "department";
export type BudgetPeriod = "monthly" | "quarterly";
export type ApprovalStep = "manager" | "director" | "finance" | "payment";

export interface Department {
  id: string;
  name: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: Role;
  title: string;
  departmentId: string;
  managerId?: string;
  /** Can approve the extra high-value step */
  isDirector?: boolean;
  avatarHue: number;
  prefs: { email: boolean; whatsapp: boolean };
}

export interface Category {
  id: string;
  name: string;
  color: string;
  active: boolean;
}

export interface Budget {
  id: string;
  scope: BudgetScope;
  refId: string;
  period: BudgetPeriod;
  amount: number;
}

export interface Attachment {
  id: string;
  name: string;
  size: number;
  type: string;
  dataUrl?: string;
}

export interface SpendRequest {
  id: string;
  code: string;
  title: string;
  categoryId: string;
  amount: number;
  dateNeeded: string; // YYYY-MM-DD
  description: string;
  vendor: string;
  attachments: Attachment[];
  priority: Priority;
  type: RequestType;
  status: Status;
  requesterId: string;
  departmentId: string;
  createdAt: string;
  updatedAt: string;
  submittedAt?: string;
  paidAt?: string;
  paymentRef?: string;
  rejectionReason?: string;
  revisionNote?: string;
}

export interface Approval {
  id: string;
  requestId: string;
  step: ApprovalStep;
  actorId: string;
  decision: "approved" | "rejected" | "revision" | "paid";
  note?: string;
  at: string;
}

export interface Comment {
  id: string;
  requestId: string;
  authorId: string;
  body: string;
  at: string;
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  body: string;
  requestId?: string;
  read: boolean;
  at: string;
}

export interface OutboxItem {
  id: string;
  channel: "email" | "whatsapp";
  to: string;
  subject: string;
  at: string;
}

export type AuditAction =
  | "created"
  | "updated"
  | "submitted"
  | "approved"
  | "rejected"
  | "revision_requested"
  | "resubmitted"
  | "cancelled"
  | "deleted"
  | "paid"
  | "commented"
  | "category_created"
  | "category_updated"
  | "budget_created"
  | "budget_updated"
  | "budget_deleted"
  | "settings_updated"
  | "signed_in"
  | "password_changed"
  | "exported";

export interface AuditLog {
  id: string;
  at: string;
  actorId: string;
  action: AuditAction;
  entity: "request" | "category" | "budget" | "settings" | "auth" | "report";
  entityId?: string;
  requestId?: string;
  details: string;
}

export interface Settings {
  highValueRuleEnabled: boolean;
  highValueThreshold: number;
  emailEnabled: boolean;
  whatsappEnabled: boolean;
}

export interface DB {
  version: number;
  currentUserId: string | null;
  seq: number;
  users: User[];
  departments: Department[];
  categories: Category[];
  budgets: Budget[];
  requests: SpendRequest[];
  approvals: Approval[];
  comments: Comment[];
  notifications: Notification[];
  auditLogs: AuditLog[];
  outbox: OutboxItem[];
  settings: Settings;
}
