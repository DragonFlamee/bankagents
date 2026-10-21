"""Durable DAG execution; model proposals cannot grant authorization."""
from __future__ import annotations

from datetime import datetime, timezone
import json
from pathlib import Path
import sqlite3
import threading
import uuid

from .bank import BankService, DomainError
from .planner import Planner, validate_nodes


def timestamp():
    return datetime.now(timezone.utc).isoformat()


class Orchestrator:
    def __init__(self, bank: BankService, path, planner=None):
        self.bank = bank
        self.path = str(path)
        Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        self.planner = planner or Planner()
        self.lock = threading.RLock()
        with self._db() as db:
            db.executescript("""
                CREATE TABLE IF NOT EXISTS plans(id TEXT PRIMARY KEY, user_id TEXT NOT NULL,
                    conversation_id TEXT NOT NULL, body TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS conversations(id TEXT PRIMARY KEY, user_id TEXT NOT NULL,
                    context TEXT NOT NULL);
            """)

    def _db(self):
        return sqlite3.connect(self.path, timeout=20)

    def _save(self, user, plan):
        with self._db() as db:
            db.execute("INSERT OR REPLACE INTO plans VALUES(?,?,?,?)",
                       (plan["id"], user, plan["conversation_id"], json.dumps(plan, ensure_ascii=False)))

    def get(self, user, plan_id):
        with self._db() as db:
            row = db.execute("SELECT body FROM plans WHERE id=? AND user_id=?", (plan_id, user)).fetchone()
        if not row:
            raise DomainError("not_found", "找不到该任务。", 404)
        return json.loads(row[0])

    def list(self, user):
        with self._db() as db:
            rows = db.execute("SELECT body FROM plans WHERE user_id=? ORDER BY rowid DESC LIMIT 30", (user,)).fetchall()
        return [json.loads(r[0]) for r in rows]

    def chat(self, user, message, conversation_id=None):
        with self.lock:
            conversation_id = conversation_id or uuid.uuid4().hex
            with self._db() as db:
                row = db.execute("SELECT user_id, context FROM conversations WHERE id=?", (conversation_id,)).fetchone()
            if row and row[0] != user:
                raise DomainError("not_found", "找不到该会话。", 404)
            context = json.loads(row[1]) if row else {}
            # Editing a pending command invalidates old authorization before a new proposal.
            if any(w in message for w in ["改成", "改为", "修改金额", "换收款人"]):
                candidates = [p for p in self.list(user) if p["conversation_id"] == conversation_id]
                for old in candidates:
                    transfer = next((n for n in old["nodes"] if n["tool"] == "transfer" and n["status"] in
                                     {"awaiting_confirmation", "awaiting_verification", "pending"}), None)
                    if transfer:
                        context["pending_transfer"] = transfer["params"].copy()
                        self.control(user, old["id"], "cancel")
                        break
            raw, explanation, updated = self.planner.propose(message, self.bank.summary(user), context)
            nodes = validate_nodes(raw)
            with self._db() as db:
                db.execute("INSERT OR REPLACE INTO conversations VALUES(?,?,?)",
                           (conversation_id, user, json.dumps(updated, ensure_ascii=False)))
            if not nodes:
                return {"conversation_id": conversation_id, "reply": explanation, "plan": None,
                        "planner_mode": self.planner.mode}
            plan = {"id": uuid.uuid4().hex, "status": "pending", "message": message,
                    "nodes": [{**n, "status": "pending"} for n in nodes], "created_at": timestamp(),
                    "conversation_id": conversation_id, "planner_mode": self.planner.mode}
            self._save(user, plan)
            self.bank.record_event(user, "plan.created", {"plan_id": plan["id"], "planner_mode": self.planner.mode,
                                                         "node_count": len(nodes), "conversation_id": conversation_id})
            plan = self.run(user, plan["id"])
            return {"conversation_id": conversation_id, "reply": self._explain(plan), "plan": plan,
                    "planner_mode": self.planner.mode}

    @staticmethod
    def _explain(plan):
        state = plan["status"]
        return {"succeeded": "任务已由业务接口完成，可查看每一步的数据或回执。",
                "awaiting_confirmation": "查询步骤已处理。请核对操作卡片，明确确认后才会执行。",
                "awaiting_verification": "此操作需要强验证；请使用独立的验证面板。",
                "unknown": "暂未取得最终回执，不能断言成功或失败。请查询原操作，勿重复发起。",
                "failed": "任务有步骤失败，请查看原因；已完成步骤的回执仍保留。",
                "paused": "任务已暂停。", "handoff": "已转人工接管，自动执行已停止。",
                "cancelled": "未完成步骤已取消，已完成操作不受此取消影响。"}.get(state, "任务已记录。")

    def run(self, user, plan_id):
        with self.lock:
            plan = self.get(user, plan_id)
            if plan["status"] in {"paused", "handoff", "cancelled"}:
                return plan
            # Each operation is saved before any authorization; completed reads stay cached.
            for node in plan["nodes"]:
                if "operation" in node:
                    node["operation"] = self.bank.get_operation(user, node["operation"]["id"])
                    node["status"] = node["operation"]["status"]
            progress = True
            while progress:
                progress = False
                for node in plan["nodes"]:
                    if node["status"] != "pending":
                        continue
                    deps = [n for n in plan["nodes"] if n["id"] in node["depends_on"]]
                    if any(n["status"] in {"failed", "cancelled"} for n in deps):
                        node.update(status="cancelled", error="前置步骤未完成，后续步骤已停止。")
                        progress = True
                        continue
                    if not all(n["status"] == "succeeded" for n in deps):
                        continue
                    try:
                        tool, params = node["tool"], node["params"]
                        self.bank.record_event(user, "step.started", {"plan_id": plan_id, "node_id": node["id"], "tool": tool})
                        if tool == "balance":
                            summary = self.bank.summary(user)
                            node["result"] = {"accounts": summary["accounts"], "daily_transfer_cents": summary["daily_transfer_cents"]}
                        elif tool == "cards":
                            node["result"] = {"cards": self.bank.summary(user)["cards"]}
                        elif tool == "transactions":
                            node["result"] = self.bank.transactions(user, params.get("period", "month"))
                        elif tool == "bills":
                            node["result"] = self.bank.analysis(user, params.get("period", "month"))
                        elif tool == "analysis.expression":
                            from .sandbox import run_expression
                            data = self.bank.transactions(user, params.get("period", "month"))
                            amounts = [-t["amount_cents"] for t in data["transactions"] if t["amount_cents"] < 0]
                            node["result"] = run_expression(params["code"], amounts)
                            node["result"]["unit"] = "CNY cents"
                            if node["result"]["status"] != "succeeded":
                                raise DomainError("sandbox_rejected", node["result"].get("error", "分析执行被限制。"))
                        else:
                            op = self.bank.create_operation(user, tool, params, plan["id"] + ":" + node["id"])
                            node.update(operation=op, status=op["status"])
                        if "operation" not in node:
                            node["status"] = "succeeded"
                        self.bank.record_event(user, "step.updated", {"plan_id": plan_id, "node_id": node["id"],
                            "tool": tool, "status": node["status"], "operation_id": node.get("operation", {}).get("id")})
                    except DomainError as exc:
                        node.update(status="failed", error=exc.message, error_code=exc.code)
                        self.bank.record_event(user, "step.failed", {"plan_id": plan_id, "node_id": node["id"], "code": exc.code})
                    self._save(user, plan)
                    progress = True
            states = {n["status"] for n in plan["nodes"]}
            if states == {"succeeded"}:
                plan["status"] = "succeeded"
            else:
                plan["status"] = next((s for s in ["unknown", "awaiting_verification", "awaiting_confirmation",
                                                  "failed", "cancelled", "pending"] if s in states), "pending")
            self._save(user, plan)
            return plan

    def release_handoff(self, user, plan_id, operator, reason):
        """Operator may release workflow control, never bank authorization."""
        with self.lock:
            plan = self.get(user, plan_id)
            if plan["status"] != "handoff":
                raise DomainError("not_handoff", "该任务未等待人工处理。", 409)
            if not isinstance(reason, str) or not 5 <= len(reason.strip()) <= 300:
                raise DomainError("reason_required", "请填写 5–300 字的人工处理说明。")
            plan["status"] = "pending"
            plan["operator_resolution"] = {"actor": operator, "reason": reason.strip(), "at": timestamp()}
            self._save(user, plan)
            self.bank.record_event(user, "operator.released", {"plan_id": plan_id, **plan["operator_resolution"]})
            return self.run(user, plan_id)

    def control(self, user, plan_id, action):
        with self.lock:
            plan = self.get(user, plan_id)
            if action not in {"pause", "resume", "cancel", "handoff"}:
                raise DomainError("bad_action", "未知任务控制命令。")
            if plan["status"] in {"succeeded", "cancelled"}:
                raise DomainError("terminal_plan", "已结束的任务不能修改。", 409)
            if action == "resume":
                if plan["status"] == "handoff":
                    raise DomainError("human_owned", "人工接管任务不能由普通用户恢复自动执行。", 409)
                plan["status"] = "pending"
                self._save(user, plan)
                self.bank.record_event(user, "plan.controlled", {"plan_id": plan_id, "action": action, "status": plan["status"]})
                return self.run(user, plan_id)
            plan["status"] = {"pause": "paused", "cancel": "cancelled", "handoff": "handoff"}[action]
            if action == "cancel":
                for node in plan["nodes"]:
                    if node["status"] == "unknown":
                        raise DomainError("unknown_result", "存在结果未知的操作，请先对账，不能假装取消。", 409)
                for node in plan["nodes"]:
                    if "operation" in node and node["status"] not in {"succeeded", "failed", "cancelled"}:
                        op = self.bank.cancel_operation(user, node["operation"]["id"])
                        node.update(operation=op, status=op["status"])
                    elif node["status"] == "pending":
                        node["status"] = "cancelled"
            self._save(user, plan)
            self.bank.record_event(user, "plan.controlled", {"plan_id": plan_id, "action": action, "status": plan["status"]})
            return plan

    def operation_action(self, user, operation_id, action, approve=True, otp=None):
        with self.lock:
            # UI pagination must never bound a security decision.
            with self._db() as db:
                rows = db.execute("SELECT body FROM plans WHERE user_id=?", (user,)).fetchall()
            plans = [json.loads(r[0]) for r in rows]
            related = next((p for p in plans if any(n.get("operation", {}).get("id") == operation_id for n in p["nodes"])), None)
            if not related:
                raise DomainError("not_found", "找不到该任务操作。", 404)
            if related and related["status"] in {"paused", "handoff", "cancelled"} and action == "authorize":
                raise DomainError("plan_stopped", "任务已暂停、取消或转人工，不能继续自动执行。", 409)
            if action == "authorize":
                op = self.bank.authorize(user, operation_id, approve, otp)
            elif action == "reconcile":
                op = self.bank.reconcile(user, operation_id)
            elif action == "cancel":
                op = self.bank.cancel_operation(user, operation_id)
            else:
                raise DomainError("bad_action", "未知操作。")
            plan = None
            if related:
                for node in related["nodes"]:
                    if node.get("operation", {}).get("id") == operation_id:
                        node.update(operation=op, status=op["status"])
                self._save(user, related)
                plan = self.run(user, related["id"])
            return {"operation": op, "plan": plan}
