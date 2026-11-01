export type View =
  | "dashboard"
  | "workspace"
  | "analytics"
  | "wealth"
  | "cards"
  | "subscriptions"
  | "planner"
  | "approvals"
  | "security"
  | "activity";
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
  held_cents?: number;
  available_cents?: number;
}
export interface Card {
  id: string;
  last4: string;
  status: string;
  kind?: "debit" | "credit" | "virtual";
  name?: string;
  limit_cents?: number | null;
  max_limit_cents?: number | null;
  used_cents?: number;
  available_cents?: number;
  controls?: Record<string, boolean>;
  statement_date?: string;
  due_date?: string;
  pin_set?: boolean;
}
export interface Contact {
  id: string;
  name: string;
  phone: string;
  alias?: string;
  relation?: string;
  next_birthday?: string;
  days_until_birthday?: number;
}
export interface Hold {
  id: string;
  name: string;
  amount_cents: number;
  used_cents: number;
  status: string;
  release_date: string;
  created_at: string;
}
export interface Schedule {
  id: string;
  kind: "transfer" | "order";
  execute_date: string;
  repeat: string;
  status: string;
  params: Record<string, any>;
  item?: { id: string; name: string; merchant: string; price_cents: number };
  last_result?: { status: string; message: string; run_date: string; operation_id?: string } | null;
}
export interface Holding {
  id: string;
  product_id: string;
  product_name: string;
  risk: number;
  type: string;
  principal_cents: number;
  income_cents: number;
  value_cents: number;
  days_held: number;
  redeemable: boolean;
  days_to_redeemable: number;
  yesterday_income_cents: number;
  liquidity: string;
}
export interface RiskProfile {
  score: number;
  level: number;
  name: string;
  answers: number[];
  notes: string[];
  assessed_at: string;
  expires_at: string;
  expired: boolean;
}
export interface Product {
  id: string;
  name: string;
  type: string;
  risk: number;
  risk_name: string;
  yield_label: string;
  yield_bp: number;
  benchmark_range?: string;
  one_year_bp: number;
  volatility_bp: number;
  max_drawdown_bp: number;
  min_cents: number;
  liquidity: string;
  liquidity_days: number;
  holding_days: number;
  fee_bp: number;
  benchmark: string;
  issuer: string;
  fit: string;
  suitable: boolean;
  nav: number[];
}
export interface WealthData {
  products: Product[];
  profile: RiskProfile | null;
  disclaimer: string;
  holdings: { holdings: Holding[]; total_value_cents: number; total_income_cents: number; valuation: string };
  questionnaire: { id: string; title: string; options: string[] }[];
}
export interface Recurring {
  merchant: string;
  category: string;
  count: number;
  cadence_days: number;
  last_amount_cents: number;
  previous_amount_cents: number;
  price_change_cents: number;
  annual_cents: number;
  last_charged: string;
  next_expected: string;
  days_until: number;
  confidence: number;
  transaction_ids: string[];
  mandate: { id: string; status: string; remind_days: number | null } | null;
}
export interface Split {
  id: string;
  total_cents: number;
  note: string;
  self_share_cents: number;
  created_at: string;
  shares: { contact_id: string; name: string; amount_cents: number; status: string; paid_at: string | null }[];
}
export interface LifeEvent {
  type: string;
  contact_id: string;
  name: string;
  relation: string;
  date: string;
  days_until: number;
}
export interface ScheduleData {
  available_cents: number;
  recurring_flows: {
    merchant: string;
    category: string;
    inflow: boolean;
    last_amount_cents: number;
    cadence_days: number;
    next_expected: string;
    confidence: number;
  }[];
  schedules: Schedule[];
  holds: Hold[];
  subscriptions: { id: string; name: string; amount_cents: number; status: string; remind_days: number | null; next_charge: string }[];
  splits: Split[];
  contacts: Contact[];
  events: LifeEvent[];
  today: string;
}
export interface SecurityData {
  locked: boolean;
  locked_until: string | null;
  lock_reason: string | null;
  otp_failures: number;
  otp_failure_limit: number;
  suspicious_hits: number;
  suspicious_limit: number;
  operations_last_minute: number;
  velocity_limit: number;
  channel_failures: number;
  channel_open: boolean;
  daily_transfer_cents: number;
  daily_limit_cents: number;
  operations: { risk: string; status: string; n: number }[];
  events: { action: string; occurred_at: string; details: Record<string, any> }[];
  tiers: { tool: string; label: string; tier: "green" | "yellow" | "red"; condition: string | null }[];
}
export interface Overview {
  subscription_offers?: SubscriptionOffer[];
  scheduled_operations?: Operation[];
  accounts: Account[];
  cards: Card[];
  contacts: Contact[];
  daily_transfer_cents: number;
  daily_limit_cents?: number;
  goals: Record<string, unknown>[];
  holds?: Hold[];
  schedules?: Schedule[];
  holdings?: Holding[];
  wealth_total_cents?: number;
  risk_profile?: RiskProfile | null;
}
export interface SubscriptionOffer {
  id: string;
  name: string;
  description: string;
  amount_cents: number;
  terms: string;
  subscription_id: string;
  status: "not_subscribed" | "active" | "cancelled";
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
  previous_cents?: number;
}
export interface BillAnalysis {
  period: Period;
  categories: Category[];
  total_expense_cents: number;
  income_cents: number;
  transaction_count: number;
  anomalies: {
    transaction_id: string;
    amount_cents: number;
    reason: string;
    merchant?: string;
    occurred_at?: string;
    category?: string;
    rules?: { code: string; reason: string }[];
  }[];
  source_transaction_ids: string[];
  period_start?: string;
  period_end?: string;
  consumption_cents?: number;
  savings_rate_bp?: number | null;
  previous_expense_cents?: number;
  monthly?: { month: string; income_cents: number; expense_cents: number; transfer_cents: number }[];
  daily?: { day: string; expense_cents: number }[];
  top_merchants?: { merchant: string; total_cents: number; count: number }[];
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
  schedule_id?: string;
  run_date?: string;
  id: string;
  tool: string;
  params: Record<string, any>;
  status: string;
  risk: string;
  message: string;
  expires_at: string;
  receipt?: Receipt | null;
}
export interface PlanNode {
  id: string;
  tool: string;
  params: Record<string, any>;
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
