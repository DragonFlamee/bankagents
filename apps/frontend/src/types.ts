export type View =
  "dashboard" | "workspace" | "analytics" | "approvals" | "activity";
export type Period = "month" | "last_month" | "year";
export interface Session {
  user: { id: string; name: string };
  csrf_token: string;
  planner_mode: string;
  role: string;
}
export interface Account {
  id: string;
  name: string;
  balance_cents: number;
  currency: string;
}
export interface Card {
  id: string;
  last4: string;
  status: string;
}
export interface Contact {
  id: string;
  name: string;
  phone: string;
}
export interface Overview {
  accounts: Account[];
  cards: Card[];
  contacts: Contact[];
  daily_transfer_cents: number;
  goals: Record<string, unknown>[];
}
export interface Transaction {
  id: string;
  merchant: string;
  amount_cents: number;
  category: string;
  occurred_at: string;
  description: string;
}
export interface Category {
  category: string;
  total_cents: number;
  count: number;
}
export interface BillAnalysis {
  period: Period;
  categories: Category[];
  total_expense_cents: number;
  income_cents: number;
  transaction_count: number;
  anomalies: { transaction_id: string; amount_cents: number; reason: string }[];
  source_transaction_ids: string[];
}
export interface Analytics {
  analysis: BillAnalysis;
  transactions: Transaction[];
  period: Period;
}
export interface Receipt {
  id: string;
  status: string;
  amount_cents?: number;
  recipient?: string;
  last4?: string;
  card_status?: string;
  occurred_at: string;
  [key: string]: unknown;
}
export interface Operation {
  id: string;
  tool: string;
  params: Record<string, string | number>;
  status: string;
  risk: string;
  message: string;
  expires_at: string;
  receipt?: Receipt | null;
}
export interface PlanNode {
  id: string;
  tool: string;
  params: Record<string, string | number>;
  depends_on: string[];
  status: string;
  result?: Record<string, any>;
  operation?: Operation;
  error?: string;
}
export interface Answer {
  title: string;
  paragraphs: string[];
  source: string;
  evidence: Record<string, unknown>[];
}
export interface Plan {
  id: string;
  message: string;
  status: string;
  created_at: string;
  conversation_id: string;
  run_id?: string;
  nodes: PlanNode[];
  answer?: Answer;
}
export interface Usage {
  model: string;
  http_status?: number;
  request_id?: string;
  completion_id?: string;
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  reasoning_tokens?: number;
}
export interface RunEvent {
  seq: number;
  type: string;
  at: string;
  data: Record<string, any>;
}
export interface Run {
  id: string;
  message: string;
  status: string;
  created_at: string;
  updated_at: string;
  conversation_id: string;
  reply: string | null;
  events: RunEvent[];
  plan: Plan | null;
}
export interface ConversationPage {
  conversation_id: string;
  runs: Run[];
  has_more: boolean;
}
export interface Audit {
  id: number;
  action: string;
  occurred_at: string;
  details: Record<string, unknown>;
  event_hash: string;
}
