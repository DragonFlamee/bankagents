import { useEffect, useRef, useState } from "react";
import { AnimatePresence } from "motion/react";
import { PageSurface } from "./motion";
import { BankMark } from "./BankMark";
import {
  LayoutDashboard,
  Workflow,
  ChartNoAxesCombined,
  ShieldCheck,
  History,
  Menu,
  Plus,
  ArrowUpRight,
  ArrowRight,
  RefreshCw,
  LogOut,
  Search,
  Check,
  LockKeyhole,
  X,
  CreditCard,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import {
  api,
  setCsrf,
  money,
  time,
  labels,
  active,
  pending,
  auditLabel,
} from "./api";
import type {
  Session,
  Overview,
  Plan,
  Run,
  ConversationPage,
  View,
  Analytics,
  Period,
  Operation,
  Audit,
} from "./types";
import {
  Button,
  Badge,
  Empty,
  Modal,
  SectionHead,
  TaskRows,
  OperationPanel,
  OperationFields,
  maskPhone,
} from "./components";
import {
  CommandMenu,
  Hint,
  Skeleton,
  ViewTabs,
  type Command,
} from "./controls";
import { SpendingChart, CategoryBars } from "./charts";
import { AnalyticsPage } from "./Analytics";
import { Workspace } from "./Workspace";
import { scenarios } from "./scenarios";
const navigation = [
  { id: "dashboard", name: "业务总览", en: "Dashboard", icon: LayoutDashboard },
  { id: "workspace", name: "Agent 工作台", en: "Workspace", icon: Workflow },
  {
    id: "analytics",
    name: "交易分析",
    en: "Analytics",
    icon: ChartNoAxesCombined,
  },
  { id: "approvals", name: "审批中心", en: "Approvals", icon: ShieldCheck },
  { id: "activity", name: "活动日志", en: "Activity", icon: History },
] as const;
const hashView = (): View =>
  navigation.some((n) => n.id === location.hash.slice(1))
    ? (location.hash.slice(1) as View)
    : "dashboard";
const conversationName = (p: Plan, plans: Plan[]) =>
  plans.filter((r) => r.conversation_id === p.conversation_id).at(-1)
    ?.message || p.message;
export default function App() {
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem("tracebank:sidebar") === "collapsed",
  );
  const [palette, setPalette] = useState(false);
  const [workspaceEpoch, setWorkspaceEpoch] = useState(0);
  const [draft, setDraft] = useState<{ text: string; nonce: number } | null>(
    null,
  );
  const [dataLoading, setDataLoading] = useState(false),
    [analyticsLoading, setAnalyticsLoading] = useState(false),
    [auditLoading, setAuditLoading] = useState(false);
  const [activeAction, setActiveAction] = useState<{
    id: string;
    action: string;
  } | null>(null);
  const [narrow, setNarrow] = useState(
    () => matchMedia("(max-width:800px)").matches,
  );
  const sidebar = useRef<HTMLElement>(null);
  const [session, setSession] = useState<Session | null>(null),
    [boot, setBoot] = useState(true),
    [view, setView] = useState<View>(hashView),
    [mobile, setMobile] = useState(false),
    [overview, setOverview] = useState<Overview | null>(null),
    [plans, setPlans] = useState<Plan[]>([]),
    [plan, setPlan] = useState<Plan | null>(null),
    [run, setRun] = useState<Run | null>(null),
    [turns, setTurns] = useState<Run[]>([]),
    [hasEarlier, setHasEarlier] = useState(false),
    [analytics, setAnalytics] = useState<Analytics | null>(null),
    [monthAnalytics, setMonthAnalytics] = useState<Analytics | null>(null),
    [period, setPeriod] = useState<Period>("month"),
    [working, setWorking] = useState(false),
    [opening, setOpening] = useState(false),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [otpOp, setOtpOp] = useState<Operation | null>(null),
    [otp, setOtp] = useState(""),
    [inbox, setInbox] = useState(""),
    [otpError, setOtpError] = useState(""),
    [rules, setRules] = useState(false),
    [tab, setTab] = useState("pending"),
    [logTab, setLogTab] = useState("tasks"),
    [audit, setAudit] = useState<{
      events: Audit[];
      chain_valid: boolean;
    } | null>(null),
    [filter, setFilter] = useState(""),
    [auditPage, setAuditPage] = useState(0);
  const periodRef = useRef(period),
    analyticsRequest = useRef(0);
  periodRef.current = period;
  const selected = useRef<Run | null>(null),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    epoch = useRef(0),
    conversation = useRef<string | null>(null),
    currentUser = useRef<Session | null>(null);
  const busy = opening || (!!run && active(run.status));
  useEffect(() => {
    const keydown = (e: KeyboardEvent) => {
      if (
        session &&
        (e.ctrlKey || e.metaKey) &&
        e.key.toLowerCase() === "k" &&
        !otpOp &&
        !rules &&
        !document.querySelector(".execution-dialog[open]")
      ) {
        e.preventDefault();
        setPalette((p) => !p);
      }
    };
    document.addEventListener("keydown", keydown);
    return () => document.removeEventListener("keydown", keydown);
  }, [session, otpOp, rules]);
  function toggleSidebar() {
    setCollapsed((v) => {
      localStorage.setItem("tracebank:sidebar", v ? "expanded" : "collapsed");
      return !v;
    });
  }
  useEffect(() => {
    const query = matchMedia("(max-width:800px)");
    const update = () => {
      setNarrow(query.matches);
      if (!query.matches) setMobile(false);
    };
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!mobile || !narrow) return;
    const previous = document.activeElement as HTMLElement;
    const items = () =>
      Array.from(
        sidebar.current?.querySelectorAll<HTMLElement>(
          "a[href],button:not(:disabled)",
        ) || [],
      ).filter((element) => element.getClientRects().length > 0);
    items()[0]?.focus();
    document.body.classList.add("nav-open");
    const keydown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setMobile(false);
      }
      if (e.key === "Tab") {
        const list = items(),
          first = list[0],
          last = list.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("keydown", keydown);
      document.body.classList.remove("nav-open");
      previous?.focus();
    };
  }, [mobile, narrow]);
  const ops = plans.flatMap((p) =>
      p.nodes
        .filter((n) => n.operation)
        .map((n) => ({ plan: p, op: n.operation! })),
    ),
    pendingOps = ops.filter(({ op }) => pending(op.status));
  function navigate(v: View) {
    location.hash = v;
    setView(v);
    setMobile(false);
  }
  function fail(e: any) {
    setError(e.message || String(e));
    if (e.status === 401) {
      clearSession();
    }
  }
  function clearSession() {
    setPalette(false);
    setDraft(null);
    navigate("dashboard");
    epoch.current++;
    if (timer.current) clearTimeout(timer.current);
    analyticsRequest.current++;
    currentUser.current = null;
    selected.current = null;
    conversation.current = null;
    setSession(null);
    setOpening(false);
    setMobile(false);
    setRun(null);
    setTurns([]);
    setHasEarlier(false);
    setPlan(null);
    setPlans([]);
    setOverview(null);
    setAnalytics(null);
    setMonthAnalytics(null);
    setAudit(null);
    setOtpOp(null);
    setOtp("");
    setInbox("");
    setRules(false);
    setCsrf("");
  }
  async function guard(fn: () => Promise<unknown>) {
    setError("");
    setWorking(true);
    try {
      await fn();
    } catch (e) {
      fail(e);
    } finally {
      setWorking(false);
    }
  }
  async function refresh() {
    setDataLoading(true);
    const user = currentUser.current?.user.id;
    const results = await Promise.allSettled([
      api<Overview>("/api/overview"),
      api<{ plans: Plan[] }>("/api/plans"),
    ]);
    setDataLoading(false);
    if (user !== currentUser.current?.user.id) return;
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r.status === "rejected") fail(r.reason);
      else if (i === 0) setOverview(r.value as Overview);
      else {
        const list = (r.value as { plans: Plan[] }).plans;
        setPlans(list);
      }
    }
  }
  async function fetchAnalytics(p = periodRef.current) {
    setAnalyticsLoading(true);
    const request = ++analyticsRequest.current,
      user = currentUser.current?.user.id;
    try {
      const data = await api<Analytics>(`/api/analytics?period=${p}`);
      if (user !== currentUser.current?.user.id) return;
      if (request === analyticsRequest.current) setAnalytics(data);
      if (p === "month") setMonthAnalytics(data);
      else {
        const month = await api<Analytics>("/api/analytics?period=month");
        if (user === currentUser.current?.user.id) setMonthAnalytics(month);
      }
    } finally {
      if (request === analyticsRequest.current) setAnalyticsLoading(false);
    }
  }
  function storeRun(r: Run) {
    selected.current = r;
    setRun(r);
    setTurns((old) => {
      const same = old.filter((t) => t.conversation_id === r.conversation_id);
      return same.some((t) => t.id === r.id)
        ? same.map((t) => (t.id === r.id ? r : t))
        : [...same, r];
    });
    if (r.plan) setPlan(r.plan);
    const u = currentUser.current;
    if (u) {
      sessionStorage.setItem(`tracebank:${u.user.id}:run`, r.id);
      conversation.current = r.conversation_id;
      sessionStorage.setItem(
        `tracebank:${u.user.id}:conversation`,
        r.conversation_id,
      );
    }
  }
  async function loadConversation(
    id: string,
    generation = epoch.current,
    earlier = false,
  ) {
    const first = earlier ? turns[0]?.id : null;
    const data = await api<ConversationPage>(
      `/api/conversations/${encodeURIComponent(id)}${first ? `?before=${encodeURIComponent(first)}` : ""}`,
    );
    if (generation !== epoch.current || !currentUser.current) return null;
    setHasEarlier(data.has_more);
    setTurns((old) => {
      const current = selected.current;
      const incoming = data.runs.map((r) =>
        current?.id === r.id ? current : r,
      );
      if (!earlier) return incoming;
      const ids = new Set(incoming.map((r) => r.id));
      return [
        ...incoming,
        ...old.filter((r) => r.conversation_id === id && !ids.has(r.id)),
      ];
    });
    return data.runs;
  }
  async function poll(id: string, generation: number) {
    if (generation !== epoch.current) return;
    try {
      const previous = selected.current?.id === id ? selected.current : null;
      const cursor = previous?.events.at(-1)?.seq || 0;
      const next = await api<Run>(`/api/runs/${id}?after=${cursor}`);
      if (generation !== epoch.current) return;
      const events = [
        ...(previous?.events || []),
        ...next.events.filter(
          (e) => !previous?.events.some((p) => p.seq === e.seq),
        ),
      ];
      storeRun({ ...next, events });
      if (active(next.status))
        timer.current = setTimeout(
          () => poll(id, generation),
          next.events.some((e) => e.type.startsWith("response.")) ||
            previous?.events.some((e) => e.type === "response.started")
            ? 180
            : 500,
        );
      else {
        await loadConversation(next.conversation_id, generation);
        await refresh();
        await fetchAnalytics();
      }
    } catch (e) {
      if (generation === epoch.current) fail(e);
    }
  }
  async function selectPlan(p: Plan) {
    if (busy && run?.id !== p.run_id)
      throw new Error("当前任务仍在执行。请先停止或等待完成，再打开其他任务。");
    setOpening(true);
    setDraft(null);
    setWorkspaceEpoch((v) => v + 1);
    try {
      epoch.current++;
      if (timer.current) clearTimeout(timer.current);
      setPlan(p);
      setRun(null);
      setTurns([]);
      selected.current = null;
      navigate("workspace");
      if (p.run_id) {
        const history = await loadConversation(p.conversation_id);
        await poll(history?.at(-1)?.id || p.run_id, epoch.current);
      } else {
        setPlan(await api<Plan>(`/api/plans/${p.id}`));
        conversation.current = p.conversation_id;
        if (session) {
          sessionStorage.removeItem(`tracebank:${session.user.id}:run`);
          sessionStorage.setItem(
            `tracebank:${session.user.id}:conversation`,
            p.conversation_id,
          );
        }
      }
    } finally {
      setOpening(false);
    }
  }
  async function openSession(s: Session) {
    if (s.role === "operator") {
      location.href = "/operator.html";
      return;
    }
    setSession(s);
    currentUser.current = s;
    setCsrf(s.csrf_token);
    conversation.current = sessionStorage.getItem(
      `tracebank:${s.user.id}:conversation`,
    );
    await refresh();
    await fetchAnalytics();
    const saved = sessionStorage.getItem(`tracebank:${s.user.id}:run`);
    if (saved) {
      try {
        await poll(saved, epoch.current);
        if (selected.current)
          await loadConversation(selected.current.conversation_id);
      } catch {
        sessionStorage.removeItem(`tracebank:${s.user.id}:run`);
      }
    } else if (conversation.current) {
      const history = await loadConversation(conversation.current);
      if (history?.length) await poll(history.at(-1)!.id, epoch.current);
    }
  }
  useEffect(() => {
    api<Session>("/api/session")
      .then(openSession)
      .catch((e) => {
        if (e.status !== 401) fail(e);
      })
      .finally(() => setBoot(false));
    const change = () => setView(hashView());
    window.addEventListener("hashchange", change);
    return () => {
      window.removeEventListener("hashchange", change);
      epoch.current++;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);
  useEffect(() => {
    if (session) fetchAnalytics(period).catch(fail);
  }, [period]);
  useEffect(() => {
    let cancelled = false;
    if (session && view === "activity" && logTab === "audit") {
      setAuditLoading(true);
      api<{ events: Audit[]; chain_valid: boolean }>("/api/audit")
        .then((data) => {
          if (!cancelled) setAudit(data);
        })
        .catch((e) => {
          if (!cancelled) fail(e);
        })
        .finally(() => {
          if (!cancelled) setAuditLoading(false);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [session, view, logTab, plans]);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(""), 4000);
      return () => clearTimeout(t);
    }
  }, [toast]);
  async function submit(message: string) {
    if (working || busy) return false;
    setToast("");
    let accepted = false;
    await guard(async () => {
      epoch.current++;
      if (timer.current) clearTimeout(timer.current);
      selected.current = null;
      setRun(null);
      setPlan(null);
      navigate("workspace");
      const r = await api<Run>("/api/runs", {
        message,
        ...(conversation.current
          ? { conversation_id: conversation.current }
          : {}),
      });
      if (r.conversation_id) {
        conversation.current = r.conversation_id;
        sessionStorage.setItem(
          `tracebank:${session!.user.id}:conversation`,
          r.conversation_id,
        );
      }
      storeRun({ ...r, events: r.events || [] });
      accepted = true;
      setDraft(null);
      await poll(r.id, epoch.current);
    });
    return accepted;
  }
  async function syncAfter() {
    const r = selected.current;
    if (r) await poll(r.id, epoch.current);
    else {
      await refresh();
      if (plan) setPlan(await api<Plan>(`/api/plans/${plan.id}`));
    }
    await fetchAnalytics();
    if (conversation.current) await loadConversation(conversation.current);
  }
  async function action(op: Operation, a: string) {
    if (a === "authorize" && op.status === "awaiting_verification") {
      setOtp("");
      setInbox("");
      setOtpError("");
      setOtpOp(op);
      return;
    }
    setActiveAction({ id: op.id, action: a });
    await guard(async () => {
      const result = await api<{ operation: Operation; plan: Plan }>(
        `/api/operations/${op.id}/${a}`,
        a === "authorize" ? { approve: true } : {},
      );
      if (plan?.id === result.plan.id) setPlan(result.plan);
      if (
        a === "authorize" &&
        result.operation.status === "awaiting_verification"
      ) {
        setOtpOp(result.operation);
        setOtp("");
        setInbox("");
        setOtpError("");
      }
      await syncAfter();
      setToast(
        a === "cancel"
          ? "操作已取消"
          : a === "reconcile"
            ? "已查询原操作结果"
            : result.operation.status === "succeeded"
              ? "业务已完成，请核对回执"
              : "请完成独立验证",
      );
    });
    setActiveAction(null);
  }
  async function verify() {
    setActiveAction({ id: otpOp!.id, action: "authorize" });
    setWorking(true);
    setOtpError("");
    try {
      await api(`/api/operations/${otpOp!.id}/authorize`, {
        approve: true,
        otp: otp.trim(),
      });
      setOtpOp(null);
      setOtp("");
      setInbox("");
      await syncAfter();
      setToast("验证完成，业务结果已更新");
    } catch (e: any) {
      setOtpError(e.message);
      if (e.status === 401) fail(e);
    } finally {
      setWorking(false);
      setActiveAction(null);
    }
  }
  async function control(a: string, planId = plan?.id) {
    if (!planId) return;
    await guard(async () => {
      await api(`/api/plans/${planId}/control`, { action: a });
      await syncAfter();
    });
  }
  function newTask() {
    if (busy || working) return;
    setWorkspaceEpoch((v) => v + 1);
    setToast("");
    setDraft(null);
    setError("");
    epoch.current++;
    if (timer.current) clearTimeout(timer.current);
    selected.current = null;
    setRun(null);
    setPlan(null);
    setTurns([]);
    setHasEarlier(false);
    conversation.current = null;
    if (session) {
      sessionStorage.removeItem(`tracebank:${session.user.id}:run`);
      sessionStorage.removeItem(`tracebank:${session.user.id}:conversation`);
    }
    navigate("workspace");
  }
  if (boot)
    return (
      <div className="boot">
        <BankMark />
        <p>正在打开拾迹工作台…</p>
      </div>
    );
  if (!session)
    return (
      <Login
        error={error}
        working={working}
        onLogin={(username, password) =>
          guard(async () => {
            const s = await api<Session>("/api/session", {
              username,
              password,
            });
            await openSession(s);
          })
        }
      />
    );
  const currentNav = navigation.find((n) => n.id === view)!;
  return (
    <div className={`app-shell ${collapsed ? "sidebar-collapsed" : ""}`}>
      <a
        className="skip-link"
        href="#main-content"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("main-content")?.focus();
        }}
      >
        跳过导航，进入主内容
      </a>
      {mobile && (
        <button
          className="nav-backdrop"
          aria-label="关闭导航"
          onClick={() => setMobile(false)}
        />
      )}
      <aside
        ref={sidebar}
        inert={narrow && !mobile}
        aria-label="业务导航"
        className={`sidebar ${mobile ? "is-open" : ""}`}
      >
        <button
          className="sidebar-collapse"
          aria-label={collapsed ? "展开侧栏" : "收起侧栏"}
          aria-expanded={!collapsed}
          onClick={toggleSidebar}
        >
          {collapsed ? (
            <PanelLeftOpen size={13} />
          ) : (
            <PanelLeftClose size={13} />
          )}
        </button>
        <a
          className="brand"
          href="#dashboard"
          onClick={() => navigate("dashboard")}
        >
          <BankMark />
          <span>
            <strong>TraceBank</strong>
          </span>
        </a>
        <Button kind="primary" onClick={newTask} disabled={busy || working}>
          <Plus size={16} />
          新对话
        </Button>
        <nav aria-label="主导航">
          {navigation.map((n) => (
            <button
              key={n.id}
              aria-label={n.name}
              className={`nav-item ${view === n.id ? "current" : ""}`}
              onClick={() => navigate(n.id)}
              aria-current={view === n.id ? "page" : undefined}
            >
              <n.icon size={18} />
              <span>{n.name}</span>
              {n.id === "approvals" && pendingOps.length > 0 && (
                <b>{pendingOps.length}</b>
              )}
            </button>
          ))}
        </nav>
        {plans.length > 0 && (
          <div className="sidebar-recent">
            <div className="sidebar-caption">最近对话</div>
            {plans
              .filter(
                (p, i, all) =>
                  all.findIndex(
                    (r) => r.conversation_id === p.conversation_id,
                  ) === i,
              )
              .slice(0, 4)
              .map((p) => (
                <Hint
                  label={maskPhone(conversationName(p, plans))}
                  block
                  key={p.conversation_id}
                >
                  <button
                    className={`recent-task ${conversation.current === p.conversation_id ? "selected" : ""}`}
                    onClick={() => guard(() => selectPlan(p))}
                  >
                    <span>{maskPhone(conversationName(p, plans))}</span>
                  </button>
                </Hint>
              ))}
          </div>
        )}
        <div className="sidebar-bottom">
          <button className="security-link" onClick={() => setRules(true)}>
            <ShieldCheck size={16} />
            <span>授权规则</span>
            <ChevronRight size={13} />
          </button>
          <div className="user-account">
            <span className="avatar">
              {session.user.name?.slice(-1) || "我"}
            </span>
            <div>
              <strong>{session.user.name}</strong>
            </div>
            <button
              className="icon-button"
              aria-label="退出登录"
              onClick={() =>
                guard(async () => {
                  await api("/api/session", undefined, "DELETE");
                  clearSession();
                })
              }
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>
      <main className="main-shell" id="main-content" tabIndex={-1}>
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              onClick={() => setMobile(true)}
              aria-label="打开导航"
            >
              <Menu size={20} />
            </button>
            {(view === "workspace" || narrow) && (
              <strong>{currentNav.name}</strong>
            )}
          </div>
          <div className="topbar-right">
            <button
              className="command-trigger"
              aria-label="搜索与快捷操作"
              aria-haspopup="dialog"
              onClick={() => setPalette(true)}
            >
              <Search size={16} />
              <span>搜索</span>
              <kbd>Ctrl K</kbd>
            </button>
            <span className="demo-indicator">模拟环境</span>
            <button
              className="icon-button"
              title="刷新业务数据"
              aria-label="刷新业务数据"
              disabled={working}
              onClick={() =>
                guard(async () => {
                  await refresh();
                  await fetchAnalytics();
                  if (selected.current) await syncAfter();
                  setToast("业务数据已更新");
                })
              }
            >
              <RefreshCw size={15} className={dataLoading ? "spin" : ""} />
            </button>
          </div>
        </header>
        {error && (
          <div className="global-error" role="alert">
            <span>{error}</span>
            <div className="error-actions">
              <Button
                onClick={() =>
                  guard(async () => {
                    await refresh();
                    await fetchAnalytics();
                    if (selected.current) await syncAfter();
                  })
                }
                disabled={working}
              >
                重新读取
              </Button>
              <button onClick={() => setError("")} aria-label="关闭错误">
                <X size={15} />
              </button>
            </div>
          </div>
        )}
        <AnimatePresence mode="wait" initial={false}>
          <PageSurface
            key={view}
            view={view}
            className={`page-content ${view === "workspace" ? "workspace-content" : ""}`}
          >
            {view === "dashboard" && (
              <>
                <div className="page-heading">
                  <div>
                    <h1>业务总览</h1>
                    <p>{session.user.name}的账户</p>
                  </div>
                  <Button onClick={() => navigate("workspace")}>
                    进入 Agent 工作台
                    <ArrowUpRight size={15} />
                  </Button>
                </div>
                <div className="metrics-band">
                  <div>
                    <span>
                      可用资金 <span className="metric-unit">CNY</span>
                    </span>
                    <strong>
                      {overview ? (
                        money(
                          overview.accounts.reduce(
                            (s, a) => s + a.balance_cents,
                            0,
                          ),
                        )
                      ) : dataLoading ? (
                        <Skeleton metric />
                      ) : (
                        "—"
                      )}
                    </strong>
                    <small>非真实资金</small>
                  </div>
                  <div>
                    <span>本月支出</span>
                    <strong>
                      {monthAnalytics ? (
                        money(monthAnalytics.analysis.total_expense_cents)
                      ) : analyticsLoading ? (
                        <Skeleton metric />
                      ) : (
                        "—"
                      )}
                    </strong>
                    <small>按本月已入账流水统计</small>
                  </div>
                  <div>
                    <span>待处理授权</span>
                    <strong>
                      {!overview && dataLoading ? (
                        <Skeleton metric />
                      ) : (
                        pendingOps.length
                      )}
                      <em> 项</em>
                    </strong>
                    <small>
                      {pendingOps.length
                        ? "需要你核对并确认"
                        : "当前没有待确认的操作"}
                    </small>
                  </div>
                  <div>
                    <span>最近任务</span>
                    <strong>
                      {!overview && dataLoading ? (
                        <Skeleton metric />
                      ) : (
                        plans.length
                      )}
                      <em> 个</em>
                    </strong>
                    <small>
                      {plans.filter((p) => p.status === "succeeded").length}{" "}
                      个已完成
                    </small>
                  </div>
                </div>
                <div className="dashboard-grid">
                  <div className="dashboard-main">
                    <section className="panel">
                      <SectionHead
                        title="资金支出"
                        description="按本月交易发生顺序累计"
                        action={
                          <button
                            className="text-button"
                            onClick={() => navigate("analytics")}
                          >
                            查看分析
                            <ArrowUpRight size={14} />
                          </button>
                        }
                      />
                      {!monthAnalytics && analyticsLoading ? (
                        <div className="loading-panel">
                          <Skeleton />
                          <Skeleton />
                          <Skeleton />
                        </div>
                      ) : (
                        <SpendingChart data={monthAnalytics} />
                      )}
                    </section>
                    <section className="panel">
                      <SectionHead
                        title="最近 Agent 任务"
                        action={
                          <button
                            className="text-button"
                            onClick={() => navigate("activity")}
                          >
                            全部任务
                            <ArrowRight size={14} />
                          </button>
                        }
                      />
                      <TaskRows
                        plans={plans}
                        onOpen={(p) => guard(() => selectPlan(p))}
                        limit={5}
                      />
                    </section>
                  </div>
                  <div className="dashboard-side">
                    <section className="panel">
                      <SectionHead
                        title="待你确认"
                        action={<ShieldCheck size={16} />}
                      />
                      {pendingOps.length ? (
                        pendingOps.slice(0, 2).map(({ plan: p, op }) => (
                          <button
                            className="approval-preview"
                            key={op.id}
                            onClick={() => guard(() => selectPlan(p))}
                          >
                            <span className="approval-icon">
                              <ShieldCheck size={17} />
                            </span>
                            <span>
                              <strong>{labels[op.tool] || "业务操作"}</strong>
                              <small>
                                {op.params.amount_cents
                                  ? money(Number(op.params.amount_cents))
                                  : maskPhone(p.message)}
                              </small>
                            </span>
                            <ChevronRight size={15} />
                          </button>
                        ))
                      ) : (
                        <p className="no-pending-operations">
                          当前没有待确认操作。
                        </p>
                      )}
                    </section>
                    <section className="panel">
                      <SectionHead
                        title="我的银行卡"
                        action={<CreditCard size={17} />}
                      />
                      {overview?.cards.map((c) => (
                        <div className="bank-card-row" key={c.id}>
                          <span className="card-symbol">
                            <CreditCard size={22} />
                          </span>
                          <div>
                            <strong>拾迹借记卡</strong>
                            <span className="tabular">•••• {c.last4}</span>
                          </div>
                          <Badge status={c.status} />
                        </div>
                      ))}
                      <div className="transfer-summary">
                        <span>今日累计转账</span>
                        <strong className="tabular">
                          {money(overview?.daily_transfer_cents || 0)}
                        </strong>
                      </div>
                      <button
                        className="text-button full-row"
                        onClick={() => submit("查询我的卡片")}
                      >
                        让 Agent 查询卡片
                        <ArrowRight size={14} />
                      </button>
                    </section>
                    <section className="panel">
                      <SectionHead
                        title="支出分布"
                        description="本月按金额排序"
                      />
                      <CategoryBars data={monthAnalytics} />
                    </section>
                  </div>
                </div>
              </>
            )}
            {view === "workspace" && (
              <Workspace
                key={workspaceEpoch}
                turns={turns}
                hasEarlier={hasEarlier}
                onEarlier={() =>
                  conversation.current &&
                  loadConversation(
                    conversation.current,
                    epoch.current,
                    true,
                  ).catch(fail)
                }
                activeAction={activeAction}
                draft={draft}
                plan={plan}
                run={run}
                overview={overview}
                onSubmit={submit}
                onAction={action}
                onControl={control}
                onStop={() =>
                  guard(async () => {
                    if (run) {
                      await api(`/api/runs/${run.id}/cancel`, {});
                      await syncAfter();
                    }
                  })
                }
                busy={busy}
                working={working}
                onNew={(text) => {
                  newTask();
                  if (text) setDraft({ text, nonce: Date.now() });
                }}
              />
            )}
            {view === "analytics" && (
              <AnalyticsPage
                data={analyticsLoading ? null : analytics}
                loading={analyticsLoading}
                period={period}
                setPeriod={setPeriod}
              />
            )}
            {view === "approvals" && (
              <>
                <div className="page-heading">
                  <div>
                    <h1>审批中心</h1>
                    <p>转账与账户状态变更等操作，核对后才会提交。</p>
                  </div>
                  <Button onClick={() => setRules(true)}>
                    <ShieldCheck size={15} />
                    查看授权规则
                  </Button>
                </div>
                <ViewTabs
                  label="授权记录筛选"
                  value={tab}
                  onChange={setTab}
                  items={[
                    {
                      id: "pending",
                      label: "待处理",
                      count: pendingOps.length,
                    },
                    { id: "all", label: "全部操作", count: ops.length },
                  ]}
                />
                <div className="approval-list">
                  {(tab === "pending" ? pendingOps : ops).length ? (
                    (tab === "pending" ? pendingOps : ops).map(
                      ({ plan: p, op }) => (
                        <section className="panel approval-item" key={op.id}>
                          <div className="approval-item-top">
                            <div>
                              <h2>{labels[op.tool] || op.tool}</h2>
                            </div>
                            <button
                              className="text-button"
                              onClick={() => guard(() => selectPlan(p))}
                            >
                              查看任务
                              <ArrowUpRight size={14} />
                            </button>
                          </div>
                          <OperationPanel
                            pendingAction={
                              activeAction?.id === op.id
                                ? activeAction.action
                                : undefined
                            }
                            op={op}
                            overview={overview}
                            onAction={action}
                            disabled={working}
                            stopped={[
                              "paused",
                              "cancelled",
                              "handoff",
                            ].includes(p.status)}
                          />
                        </section>
                      ),
                    )
                  ) : (
                    <section className="panel">
                      <Empty title="当前没有待处理的授权">
                        Agent 发起需要确认的操作后，会显示完整业务信息。
                      </Empty>
                    </section>
                  )}
                </div>
                <div className="safety-note">
                  <LockKeyhole size={16} />
                  <p>
                    授权只对本次具体操作有效。金额、收款人或操作发生变化，需重新核对；结果不明时先核实原操作。
                  </p>
                </div>
              </>
            )}
            {view === "activity" && (
              <>
                <div className="page-heading">
                  <div>
                    <h1>活动日志</h1>
                    <p>查看任务结果、工具执行与业务审计记录。</p>
                  </div>
                  <Button onClick={() => guard(refresh)}>
                    <RefreshCw size={15} />
                    刷新记录
                  </Button>
                </div>
                <ViewTabs
                  label="活动记录类型"
                  value={logTab}
                  onChange={setLogTab}
                  items={[
                    { id: "tasks", label: "Agent 任务", count: plans.length },
                    { id: "audit", label: "审计事件" },
                  ]}
                />
                {logTab === "tasks" ? (
                  <section className="panel">
                    <SectionHead
                      title="任务记录"
                      action={
                        <label className="search-input">
                          <Search size={15} />
                          <input
                            aria-label="搜索任务"
                            placeholder="搜索业务目标"
                            value={filter}
                            onChange={(e) => setFilter(e.target.value)}
                          />
                        </label>
                      }
                    />
                    <TaskRows
                      plans={plans.filter((p) => p.message.includes(filter))}
                      onOpen={(p) => guard(() => selectPlan(p))}
                    />
                  </section>
                ) : (
                  <section className="panel">
                    <SectionHead
                      title="业务审计"
                      action={
                        audit ? (
                          <Badge
                            status={audit.chain_valid ? "succeeded" : "failed"}
                          >
                            {audit.chain_valid
                              ? "哈希链校验通过"
                              : "哈希链异常"}
                          </Badge>
                        ) : undefined
                      }
                    />
                    {auditLoading ? (
                      <div className="loading-panel">
                        <Skeleton />
                        <Skeleton />
                        <Skeleton />
                      </div>
                    ) : audit?.events.length ? (
                      <>
                        <div className="audit-list">
                          {audit.events
                            .slice(auditPage * 15, auditPage * 15 + 15)
                            .map((a) => (
                              <details key={a.id}>
                                <summary>
                                  <span className="audit-number">#{a.id}</span>
                                  <strong>{auditLabel(a.action)}</strong>
                                  <span>{time(a.occurred_at, true)}</span>
                                  <ChevronRight size={14} />
                                </summary>
                                <div className="audit-detail">
                                  <p>事件类型：{a.action}</p>
                                  <p>
                                    哈希链可检测篡改，不等同于不可篡改存储。
                                  </p>
                                  <p className="mono">
                                    事件摘要：{a.event_hash}
                                  </p>
                                  <pre>
                                    {JSON.stringify(a.details, null, 2)}
                                  </pre>
                                </div>
                              </details>
                            ))}
                        </div>
                        <div className="table-footer">
                          <span>{audit.events.length} 条可见事件</span>
                          <div className="button-row">
                            <Button
                              disabled={!auditPage}
                              onClick={() => setAuditPage(auditPage - 1)}
                            >
                              上一页
                            </Button>
                            <Button
                              disabled={
                                (auditPage + 1) * 15 >= audit.events.length
                              }
                              onClick={() => setAuditPage(auditPage + 1)}
                            >
                              下一页
                            </Button>
                          </div>
                        </div>
                      </>
                    ) : (
                      <Empty title="暂无审计事件" />
                    )}
                  </section>
                )}
              </>
            )}
          </PageSurface>
        </AnimatePresence>
      </main>
      {toast && (
        <div className="toast" role="status">
          <Check size={15} />
          {toast}
          <button
            className="icon-button"
            onClick={() => setToast("")}
            aria-label="关闭通知"
          >
            <X size={14} />
          </button>
        </div>
      )}
      <CommandMenu
        open={palette}
        onClose={() => setPalette(false)}
        commands={
          [
            ...navigation.map((n) => ({
              id: n.id,
              label: n.name,
              detail: "页面导航",
              action: () => navigate(n.id),
            })),
            ...scenarios.map((s) => ({
              id: "scenario-" + s.name,
              label: s.name,
              detail: s.desc,
              disabled: busy || working,
              action: () => {
                newTask();
                setDraft({ text: s.prompt, nonce: Date.now() });
              },
            })),
            ...plans.map((p) => ({
              id: p.id,
              label: maskPhone(p.message),
              detail: "历史任务",
              disabled: busy || working,
              action: () => {
                guard(() => selectPlan(p));
              },
            })),
          ] satisfies Command[]
        }
      />
      <Modal
        open={!!otpOp}
        title="独立身份验证"
        subtitle="此验证窗口与 Agent 对话隔离。请再次核对本次业务。"
        onClose={() => {
          setOtpOp(null);
          setOtp("");
          setInbox("");
          setOtpError("");
        }}
      >
        {otpOp && (
          <>
            <OperationFields op={otpOp} overview={overview} />
            <form
              onSubmit={(e) => {
                e.preventDefault();
                verify();
              }}
            >
              <label className="form-label" htmlFor="otp">
                一次性验证码
              </label>
              <input
                id="otp"
                aria-label="一次性验证码"
                className="otp-input"
                type="password"
                autoComplete="one-time-code"
                inputMode="numeric"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                maxLength={8}
                required
              />
              <div className="demo-inbox">
                <Button
                  disabled={working}
                  onClick={() =>
                    guard(async () => {
                      const d = await api<{
                        messages: { operation_id: string; code: string }[];
                      }>("/api/auth/demo-inbox");
                      setInbox(
                        d.messages.find((m) => m.operation_id === otpOp.id)
                          ?.code || "没有可用验证码，请检查有效期。",
                      );
                    })
                  }
                >
                  打开模拟验证收件箱
                </Button>
                {inbox && <p className="demo-code">{inbox}</p>}
                <p>演示专用，验证码不发送给模型。</p>
              </div>
              {otpError && (
                <p className="inline-error" role="alert">
                  {otpError}
                </p>
              )}
              <Button
                kind="primary"
                type="submit"
                loading={activeAction?.id === otpOp.id}
                disabled={working || !otp.trim()}
              >
                验证并提交本次操作
              </Button>
            </form>
          </>
        )}
      </Modal>
      <Modal
        open={rules}
        onClose={() => setRules(false)}
        title="授权与安全规则"
        subtitle="所有业务均发生在本地模拟账户。"
      >
        <div className="rules-content">
          <details>
            <summary>运行信息</summary>
            <p>
              当前规划器：
              {session.planner_mode === "offline" ? "离线规则规划" : "模型规划"}
              。
            </p>
          </details>
          <h3>查询与分析</h3>
          <p>账户查询和白名单分析可直接执行。订阅信息查询需明确同意。</p>
          <h3>本人确认</h3>
          <p>
            转账等操作先展示完整参数；当日累计转账超过
            ¥1,000，或办理卡片挂失、解挂时，进入独立验证码验证。
          </p>
          <h3>异常与人工接管</h3>
          <p>
            结果不明时只查询原操作，避免重复提交。暂停或转人工后不继续自动授权；操作员交还任务后仍需本人确认。
          </p>
          <h3>能力边界</h3>
          <p>
            储蓄目标仅记录目标，不冻结资金。未提供真实银行连接、理财交易、定时划款或生产级身份认证。
          </p>
          <a href="/operator.html" target="_blank">
            打开独立操作员工作台
          </a>
        </div>
      </Modal>
    </div>
  );
}
function Login({
  onLogin,
  error,
  working,
}: {
  onLogin: (u: string, p: string) => void;
  error: string;
  working: boolean;
}) {
  const [username, setUsername] = useState("alice"),
    [password, setPassword] = useState("tracebank-demo");
  return (
    <div className="login-page">
      <aside className="login-intro">
        <div className="brand">
          <BankMark />
          <span>
            <strong>TraceBank</strong>
          </span>
        </div>
        <div>
          <h1>银行业务工作台</h1>
          <p>查询账户、办理模拟业务，并核对每一步结果。</p>
        </div>
        <span>模拟演示，不连接真实银行账户</span>
      </aside>
      <main className="login-form-wrap">
        <form
          className="login-form"
          onSubmit={(e) => {
            e.preventDefault();
            onLogin(username, password);
          }}
        >
          <h2>登录业务空间</h2>

          <label className="form-label" htmlFor="username">
            演示账户
          </label>
          <select
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          >
            <option value="alice">Alice（主演示账户）</option>
            <option value="bob">Bob（独立演示账户）</option>
          </select>
          <label className="form-label" htmlFor="password">
            演示密码
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && (
            <p className="inline-error" role="alert">
              {error}
            </p>
          )}
          <Button
            kind="primary"
            type="submit"
            disabled={working}
            loading={working}
          >
            {working ? "正在登录…" : "进入拾迹银行"}
            <ArrowRight size={16} />
          </Button>
          <p className="login-footnote">
            公开演示口令：tracebank-demo
            <br />
            请勿在此输入真实银行凭据。
          </p>
          <a href="/operator.html">操作员入口</a>
        </form>
      </main>
    </div>
  );
}
