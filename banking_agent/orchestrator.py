"""Durable DAG execution; model proposals cannot grant authorization."""
from __future__ import annotations

from datetime import datetime, timezone
import json
from pathlib import Path
import sqlite3
import threading
import uuid
import os
import time

from .bank import BankService, DomainError
from .planner import Planner, validate_nodes, REF
from .tools import READ_TOOLS
from .run_journal import RunJournal, RunCancelled
from .answers import build_answer, synthesize, answer_text, answer_prefix


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
        self.journal = RunJournal(self.path)

    def _trace(self, user, run_id, kind, details, check_cancel=False):
        if run_id:
            if check_cancel and self.journal.cancelled(run_id):
                raise RunCancelled()
            self.journal.emit(run_id,kind,details)

    def start_run(self, user, message, conversation_id=None):
        conversation_id = conversation_id or uuid.uuid4().hex
        with self._db() as db:
            row = db.execute("SELECT user_id FROM conversations WHERE id=?",(conversation_id,)).fetchone()
        owner = row[0] if row else self.journal.conversation_owner(conversation_id)
        if owner and owner != user:
            raise DomainError("not_found","找不到该会话。",404)
        try:
            run_id = self.journal.create(user,message,conversation_id)
        except RuntimeError as exc:
            raise DomainError("run_busy",str(exc),409) from exc
        threading.Thread(target=self._run_worker,args=(user,message,conversation_id,run_id),daemon=True).start()
        return self.get_run(user,run_id)

    def get_run(self, user, run_id, after=0):
        result = self.journal.get(user,run_id,after)
        if result is None:
            raise DomainError("not_found","找不到该执行记录。",404)
        result["plan"] = self.get(user,result["plan_id"]) if result["plan_id"] else None
        return result

    def get_conversation(self, user, conversation_id, before=None):
        with self._db() as db:
            row = db.execute("SELECT user_id FROM conversations WHERE id=?", (conversation_id,)).fetchone()
        owner = row[0] if row else self.journal.conversation_owner(conversation_id)
        if owner != user:
            raise DomainError("not_found", "找不到该对话。", 404)
        ids, more = self.journal.conversation_page(user,conversation_id,before)
        return {"conversation_id":conversation_id,"runs":[self.get_run(user,key) for key in ids],"has_more":more}

    def cancel_run(self, user, run_id):
        record = self.get_run(user,run_id)
        if record["status"] in {"succeeded","cancelled","failed","clarification","interrupted"}:
            raise DomainError("terminal_run","该次执行已结束。",409)
        if record["status"] == "running" and record["plan"] and record["plan"]["status"] == "succeeded":
            self.journal.request_cancel(run_id)
        elif record["plan_id"]:
            self.control(user,record["plan_id"],"cancel")
        else:
            self.journal.request_cancel(run_id)
        return self.get_run(user,run_id)

    def _run_worker(self, user, message, conversation, run_id):
        self.journal.update(run_id,status="running")
        try:
            result = self.chat(user,message,conversation,run_id=run_id)
            plan = result["plan"]
            self.journal.settle(run_id,plan["status"] if plan else "clarification",result["reply"])
        except RunCancelled:
            record = self.journal.get(user,run_id)
            if record["plan_id"]:
                try:
                    self.control(user,record["plan_id"],"cancel")
                except DomainError:
                    pass
            status = self.get(user,record["plan_id"])["status"] if record["plan_id"] else "cancelled"
            self.journal.settle(run_id,status,"已停止后续工具；已提交的业务不能因此撤销。","run.cancelled",
                                {"message":"停止请求已生效，未自动重发操作。","status":status})
        except Exception as exc:
            message = str(exc) if isinstance(exc,ValueError) else "执行未完成，请核对已保存的计划或稍后重试。"
            self.journal.settle(run_id,"failed",message,"run.failed",{"message":message,"error_type":type(exc).__name__})

    def _db(self):
        db = sqlite3.connect(self.path, timeout=20)
        db.execute("PRAGMA synchronous=NORMAL")
        return db

    def _save(self, user, plan):
        with self._db() as db:
            db.execute("INSERT OR REPLACE INTO plans VALUES(?,?,?,?)",
                       (plan["id"], user, plan["conversation_id"], json.dumps(plan, ensure_ascii=False)))

    def get(self, user, plan_id):
        with self._db() as db:
            row = db.execute("SELECT body FROM plans WHERE id=? AND user_id=?", (plan_id, user)).fetchone()
        if not row:
            raise DomainError("not_found", "找不到该任务。", 404)
        plan = json.loads(row[0])
        if not plan.get("answer") and plan["status"] != "pending":
            plan["answer"], _ = build_answer(plan)
            plan["answer"]["source"] = "saved_results"
        return plan

    def list(self, user):
        with self._db() as db:
            rows = db.execute("SELECT body FROM plans WHERE user_id=? ORDER BY rowid DESC LIMIT 30", (user,)).fetchall()
        return [json.loads(r[0]) for r in rows]

    def chat(self, user, message, conversation_id=None, run_id=None):
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
            self._trace(user,run_id,"model.started",{"planner_mode":self.planner.mode,
                "model":os.getenv("TRACEBANK_LLM_MODEL") if self.planner.mode=="llm" else "offline",
                "enable_thinking":self.planner.mode=="llm" and os.getenv("TRACEBANK_LLM_ENABLE_THINKING")=="1"},True)
            started = time.perf_counter()
            try:
                raw, explanation, updated = self.planner.propose(message, self.bank.summary(user), context)
            except Exception:
                self._trace(user,run_id,"model.failed",{"usage":getattr(self.planner,"last_call",None),"message":"规划未通过，尚未创建本次业务计划。"})
                raise
            self._trace(user,run_id,"model.completed",{"duration_ms":round((time.perf_counter()-started)*1000,1),
                "usage":getattr(self.planner,"last_call",None),"planner_mode":self.planner.mode})
            flag = getattr(self.planner,"last_flag",None)
            if flag:
                # Bypass attempts feed the circuit breaker; three in ten minutes lock writes.
                state = self.bank.flag_suspicious(user, flag)
                self._trace(user,run_id,"security.flagged",{"reason":flag,"hits_in_window":state["hits"],
                    "locked_until":state["locked_until"],"message":"识别到试图绕过授权的表达，已记录。" + ("连续多次，写操作已临时锁定。" if state["locked_until"] else "")})
                if state["locked_until"]:
                    explanation = "这类请求已连续出现多次，转账、卡片和理财等操作已临时锁定 10 分钟。查询仍然可以用，需要时可以转人工处理。"
            nodes = validate_nodes(raw)
            self._trace(user,run_id,"plan.validated",{"node_count":len(nodes),"nodes":nodes,"clarification":explanation if not nodes else None},True)
            with self._db() as db:
                db.execute("INSERT OR REPLACE INTO conversations VALUES(?,?,?)",
                           (conversation_id, user, json.dumps(updated, ensure_ascii=False)))
            if not nodes:
                return {"conversation_id": conversation_id, "reply": explanation, "plan": None,
                        "planner_mode": self.planner.mode}
            plan = {"id": uuid.uuid4().hex, "status": "pending", "message": message,
                    "nodes": [{**n, "status": "pending"} for n in nodes], "created_at": timestamp(),
                    "conversation_id": conversation_id, "planner_mode": self.planner.mode}
            if run_id:
                plan["run_id"] = run_id
            self._save(user, plan)
            if run_id:
                self.journal.update(run_id,plan_id=plan["id"])
                self._trace(user,run_id,"plan.created",{"plan_id":plan["id"],"node_count":len(nodes)})
            self.bank.record_event(user, "plan.created", {"plan_id": plan["id"], "planner_mode": self.planner.mode,
                                                         "node_count": len(nodes), "conversation_id": conversation_id})
            plan = self.run(user, plan["id"],respond=False)
            self._answer(user,plan,use_model=True)
            return {"conversation_id": conversation_id, "reply": answer_text(plan["answer"]), "plan": plan,
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

    def _answer(self, user, plan, use_model=False):
        answer, options = build_answer(plan)
        run_id = plan.get("run_id")
        # Only a completed read-only analysis needs a model to rank the advice.
        # Authorizations and bank write results always stay deterministic.
        model = use_model and self.planner.mode == "llm" and plan["status"] == "succeeded" and bool(options) and not any("operation" in n for n in plan["nodes"])
        self._trace(user,run_id,"response.started",{"mode":"llm" if model else "verified_results","message":"读取已完成的工具观测，整理对原问题的回答。"})
        delivered = set()
        def publish(text):
            if text not in delivered and run_id and not self.journal.cancelled(run_id):
                self._trace(user,run_id,"response.delta",{"text":text,"source":"verified_evidence"})
                delivered.add(text)
        for text in answer_prefix(answer,options) if model else answer["paragraphs"]:
            publish(text)
        usage = None
        if model:
            try:
                proposed, usage = synthesize(answer,options,plan["message"],on_section=lambda key: publish(options[key]["text"]))
                if not run_id or not self.journal.cancelled(run_id):
                    answer = proposed
                else:
                    answer["source"] = "verified_results_after_stop"
            except Exception as exc:
                usage = getattr(exc,"usage",None)
                answer["source"] = "verified_results_fallback"
                self._trace(user,run_id,"response.fallback",{"message":"回答模型未返回有效引用；改用已核对的工具结果整理回答，业务结果不受影响。"})
        for text in answer["paragraphs"]:
            publish(text)
        plan["answer"] = answer
        self._save(user,plan)
        self._trace(user,run_id,"response.completed",{"source":answer["source"],"usage":usage,"evidence_node_ids":list(dict.fromkeys(f["node_id"] for f in answer["evidence"] if f["node_id"])),"message":"已根据工具结果生成回答，金额和办理状态均可追溯。"})

    def run(self, user, plan_id, respond=True):
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
                        self._trace(user,plan.get("run_id"),"tool.started",{"node_id":node["id"],"tool":tool,"params":params,
                            "depends_on":node["depends_on"],"phase":"read" if tool in READ_TOOLS else "prepare"},True)
                        self.bank.record_event(user, "step.started", {"plan_id": plan_id, "node_id": node["id"], "tool": tool})
                        if tool == "balance":
                            summary = self.bank.summary(user)
                            node["result"] = {"accounts": summary["accounts"], "daily_transfer_cents": summary["daily_transfer_cents"],
                                              "daily_limit_cents": summary["daily_limit_cents"], "wealth_total_cents": summary["wealth_total_cents"],
                                              "holds": [h for h in summary["holds"] if h["status"] == "active"]}
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
                        elif tool in READ_TOOLS:
                            node["result"] = {"subscriptions.detect": self.bank.detect_subscriptions, "wealth.profile": self.bank.wealth_profile,
                                "wealth.products": self.bank.wealth_products, "wealth.holdings": self.bank.wealth_holdings,
                                "life.events": self.bank.life_events, "schedules.list": self.bank.schedules}[tool](user)
                        else:
                            params = self._resolve(plan, node)
                            op = self.bank.create_operation(user, tool, params, plan["id"] + ":" + node["id"])
                            node.update(operation=op, status=op["status"])
                            self._trace(user,plan.get("run_id"),"authorization.required",{"node_id":node["id"],"tool":tool,"operation_id":op["id"],"risk":op["risk"],"status":op["status"],
                                "reason":"卡片挂失/解挂或日累计转账超过1000元，需独立验证。" if op["risk"]=="red" else "该操作须先核对详情并明确确认。"})
                        if "operation" not in node:
                            node["status"] = "succeeded"
                        self._trace(user,plan.get("run_id"),"tool.result",{"node_id":node["id"],"tool":tool,"status":node["status"],
                            "result":node.get("result"),"operation":node.get("operation")})
                        self.bank.record_event(user, "step.updated", {"plan_id": plan_id, "node_id": node["id"],
                            "tool": tool, "status": node["status"], "operation_id": node.get("operation", {}).get("id")})
                    except DomainError as exc:
                        node.update(status="failed", error=exc.message, error_code=exc.code)
                        self._trace(user,plan.get("run_id"),"tool.failed",{"node_id":node["id"],"tool":node["tool"],"message":exc.message,"code":exc.code})
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
            if respond:
                self._answer(user,plan)
            if plan.get("run_id"):
                if respond:
                    self.journal.update(plan["run_id"],status=plan["status"],reply=answer_text(plan["answer"]))
                self._trace(user,plan["run_id"],"plan.updated",{"status":plan["status"],"completed":sum(n["status"]=="succeeded" for n in plan["nodes"]),"total":len(plan["nodes"])})
            return plan

    @staticmethod
    def _resolve(plan, node):
        """Fill "$step.field" from a finished dependency's receipt; never from model text."""
        resolved = {}
        for key, value in node["params"].items():
            match = REF.match(value) if type(value) is str else None
            if match:
                dep = next(n for n in plan["nodes"] if n["id"] == match.group(1))
                receipt = (dep.get("operation") or {}).get("receipt") or {}
                if dep["status"] != "succeeded" or not receipt.get(match.group(2)):
                    raise DomainError("dependency_missing", "前一步没有返回需要的编号，这一步未执行。")
                value = receipt[match.group(2)]
            resolved[key] = value
        return resolved

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
            self._trace(user,plan.get("run_id"),"operator.released",{"plan_id":plan_id,**plan["operator_resolution"]})
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
                self._trace(user,plan.get("run_id"),"plan.controlled",{"action":action,"status":plan["status"]})
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
            if plan.get("run_id"):
                self._trace(user,plan["run_id"],"plan.controlled",{"action":action,"status":plan["status"]})
            self._answer(user,plan)
            if plan.get("run_id"):
                self.journal.update(plan["run_id"],status=plan["status"],reply=answer_text(plan["answer"]))
            return plan

    def operation_action(self, user, operation_id, action, approve=True, otp=None, new_pin=None):
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
            run_id = related.get("run_id")
            self._trace(user,run_id,"operation.started",{"operation_id":operation_id,"action":action,"verification_submitted":bool(otp)})
            try:
                if action == "authorize":
                    op = self.bank.authorize(user, operation_id, approve, otp, new_pin)
                elif action == "reconcile":
                    op = self.bank.reconcile(user, operation_id)
                elif action == "cancel":
                    op = self.bank.cancel_operation(user, operation_id)
                else:
                    raise DomainError("bad_action", "未知操作。")
            except DomainError as exc:
                self._trace(user,run_id,"operation.failed",{"operation_id":operation_id,"code":exc.code,"message":exc.message})
                raise
            self._trace(user,run_id,"operation.result",{"action":action,"operation":op})
            plan = None
            if related:
                for node in related["nodes"]:
                    if node.get("operation", {}).get("id") == operation_id:
                        node.update(operation=op, status=op["status"])
                self._save(user, related)
                plan = self.run(user, related["id"])
            return {"operation": op, "plan": plan}
