"""Durable, user-owned action events. No model reasoning or credentials."""
from datetime import datetime, timezone
import json
import sqlite3
import uuid


class RunCancelled(Exception):
    pass


def now():
    return datetime.now(timezone.utc).isoformat()


def clean(value):
    if isinstance(value, dict):
        return {k: clean(v) for k, v in value.items() if k.lower() not in {
            "otp", "api_key", "authorization", "csrf_token", "reasoning_content", "session_token",
            "new_pin", "pin", "pin_hash", "pin_salt", "otp_demo", "otp_hash"}}
    if isinstance(value, list):
        return [clean(v) for v in value]
    return value


class RunJournal:
    def __init__(self, path):
        self.path = str(path)
        with sqlite3.connect(self.path, timeout=20) as db:
            db.execute("PRAGMA journal_mode=WAL")
        # Held open so the WAL is not checkpointed and recreated on every close.
        self._keeper = self.db()
        with self.db() as db:
            db.executescript("""
                CREATE TABLE IF NOT EXISTS agent_runs(
                    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, conversation_id TEXT NOT NULL,
                    message TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL, plan_id TEXT, reply TEXT,
                    cancel_requested INTEGER NOT NULL DEFAULT 0);
                CREATE TABLE IF NOT EXISTS run_events(
                    seq INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT NOT NULL,
                    type TEXT NOT NULL, at TEXT NOT NULL, data TEXT NOT NULL);
                CREATE INDEX IF NOT EXISTS run_event_lookup ON run_events(run_id,seq);
            """)
            # In-flight model calls cannot survive a process restart. Do not replay them.
            old = db.execute("SELECT id FROM agent_runs WHERE status IN ('queued','running','cancelling')").fetchall()
            for row in old:
                db.execute("UPDATE agent_runs SET status='interrupted',updated_at=? WHERE id=?", (now(),row[0]))
                db.execute("INSERT INTO run_events(run_id,type,at,data) VALUES(?,?,?,?)",
                           (row[0],"run.interrupted",now(),json.dumps({"message":"服务重启，请检查已保存的任务，不自动重发资金指令。"})))

    def db(self):
        connection = sqlite3.connect(self.path, timeout=20)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA synchronous=NORMAL")
        return connection

    def create(self, user, message, conversation):
        run_id = uuid.uuid4().hex
        created = now()
        with self.db() as db:
            db.execute("BEGIN IMMEDIATE")
            if db.execute("SELECT 1 FROM agent_runs WHERE user_id=? AND status IN ('queued','running','cancelling')", (user,)).fetchone():
                raise RuntimeError("已有任务正在规划或执行，请等待或请求停止。")
            db.execute("INSERT INTO agent_runs(id,user_id,conversation_id,message,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
                       (run_id,user,conversation,message,"queued",created,created))
        self.emit(run_id,"request.received",{"message":message})
        return run_id

    def get(self, user, run_id, after=0):
        with self.db() as db:
            db.execute("BEGIN")
            row = db.execute("SELECT * FROM agent_runs WHERE id=? AND user_id=?", (run_id,user)).fetchone()
            if not row:
                return None
            events = db.execute("SELECT seq,type,at,data FROM run_events WHERE run_id=? AND seq>? ORDER BY seq LIMIT 200", (run_id,max(0,after))).fetchall()
        result = dict(row)
        result.pop("user_id")
        result["events"] = [{"seq":e["seq"],"type":e["type"],"at":e["at"],"data":json.loads(e["data"])} for e in events]
        return result

    def list(self, user):
        with self.db() as db:
            return [dict(r) for r in db.execute("SELECT id,message,status,created_at,plan_id,conversation_id FROM agent_runs WHERE user_id=? ORDER BY rowid DESC LIMIT 20",(user,))]

    def conversation_owner(self, conversation):
        with self.db() as db:
            row = db.execute("SELECT user_id FROM agent_runs WHERE conversation_id=? ORDER BY rowid LIMIT 1", (conversation,)).fetchone()
        return row[0] if row else None

    def conversation_page(self, user, conversation, before=None):
        with self.db() as db:
            boundary = db.execute("SELECT rowid FROM agent_runs WHERE id=? AND user_id=? AND conversation_id=?", (before,user,conversation)).fetchone() if before else None
            if before and not boundary:
                return [], False
            rows = db.execute("SELECT id FROM agent_runs WHERE user_id=? AND conversation_id=? AND rowid<? ORDER BY rowid DESC LIMIT 41", (user,conversation,boundary[0] if boundary else 9223372036854775807)).fetchall()
        return [row[0] for row in reversed(rows[:40])], len(rows) > 40

    def update(self, run_id, *, status=None, plan_id=None, reply=None):
        updates = {k:v for k,v in {"status":status,"plan_id":plan_id,"reply":reply}.items() if v is not None}
        updates["updated_at"] = now()
        with self.db() as db:
            db.execute("UPDATE agent_runs SET "+",".join(k+"=?" for k in updates)+" WHERE id=?",[*updates.values(),run_id])

    def emit(self, run_id, kind, data):
        with self.db() as db:
            db.execute("INSERT INTO run_events(run_id,type,at,data) VALUES(?,?,?,?)",(run_id,kind,now(),json.dumps(clean(data),ensure_ascii=False)))

    def settle(self, run_id, status, reply, kind="run.settled", details=None):
        """Publish the final response and its event in the same transaction."""
        with self.db() as db:
            db.execute("UPDATE agent_runs SET status=?,reply=?,updated_at=? WHERE id=?",(status,reply,now(),run_id))
            db.execute("INSERT INTO run_events(run_id,type,at,data) VALUES(?,?,?,?)",
                       (run_id,kind,now(),json.dumps(clean(details or {"status":status,"reply":reply}),ensure_ascii=False)))

    def request_cancel(self, run_id):
        with self.db() as db:
            db.execute("UPDATE agent_runs SET cancel_requested=1,status='cancelling',updated_at=? WHERE id=?",(now(),run_id))
        self.emit(run_id,"run.stop_requested",{"message":"已请求停止；正在进行的模型请求返回后，不再执行后续工具。"})

    def cancelled(self, run_id):
        with self.db() as db:
            row = db.execute("SELECT cancel_requested FROM agent_runs WHERE id=?",(run_id,)).fetchone()
            return bool(row and row[0])
