"""Deterministic, transactional fake bank. No model output grants authority.

Amounts are integer CNY cents. This is a local competition simulator, not a
production bank, real identity provider, or immutable audit storage system.
"""
from __future__ import annotations

from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
import hashlib
import json
import re
import secrets
import sqlite3
from pathlib import Path
from typing import Callable


class DomainError(Exception):
    def __init__(self, code: str, message: str, status: int = 400):
        super().__init__(message)
        self.code, self.message, self.status = code, message, status


CN = timezone(timedelta(hours=8))
MAX_CENTS = 5_000_000
YELLOW_LIMIT = 100_000


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _id(prefix):
    return prefix + "_" + secrets.token_hex(12)


class BankService:
    def __init__(self, db_path, clock: Callable | None = None):
        self.db_path = str(db_path)
        self.clock = clock or (lambda: datetime.now(timezone.utc))
        Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)
        with self._tx() as db:
            db.executescript("""
            CREATE TABLE IF NOT EXISTS bank_users(id TEXT PRIMARY KEY,name TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS bank_accounts(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,name TEXT NOT NULL,balance_cents INTEGER NOT NULL CHECK(balance_cents>=0),currency TEXT NOT NULL DEFAULT 'CNY');
            CREATE TABLE IF NOT EXISTS bank_cards(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,last4 TEXT NOT NULL,status TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS bank_contacts(id TEXT NOT NULL,user_id TEXT NOT NULL,name TEXT NOT NULL,alias TEXT,phone TEXT NOT NULL,account_id TEXT NOT NULL,PRIMARY KEY(user_id,id));
            CREATE TABLE IF NOT EXISTS bank_transactions(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,account_id TEXT NOT NULL,merchant TEXT NOT NULL,amount_cents INTEGER NOT NULL,category TEXT NOT NULL,occurred_at TEXT NOT NULL,description TEXT NOT NULL,operation_id TEXT UNIQUE);
            CREATE TABLE IF NOT EXISTS bank_ledger(id INTEGER PRIMARY KEY AUTOINCREMENT,account_id TEXT NOT NULL,operation_id TEXT NOT NULL,amount_cents INTEGER NOT NULL,occurred_at TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS bank_subscriptions(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,name TEXT NOT NULL,amount_cents INTEGER NOT NULL,status TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS bank_goals(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,name TEXT NOT NULL,amount_cents INTEGER NOT NULL,created_at TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS bank_operations(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,tool TEXT NOT NULL,params TEXT NOT NULL,idem_key TEXT NOT NULL,fingerprint TEXT NOT NULL,risk TEXT NOT NULL,status TEXT NOT NULL,message TEXT NOT NULL,receipt TEXT,created_at TEXT NOT NULL,expires_at TEXT NOT NULL,challenge_id TEXT,otp_hash TEXT,otp_demo TEXT,otp_expires TEXT,UNIQUE(user_id,idem_key));
            CREATE TABLE IF NOT EXISTS bank_security(user_id TEXT PRIMARY KEY,failures INTEGER NOT NULL DEFAULT 0,locked_until TEXT,channel_failures INTEGER NOT NULL DEFAULT 0,channel_open_until TEXT,fault TEXT NOT NULL DEFAULT 'none');
            CREATE TABLE IF NOT EXISTS bank_audit(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id TEXT NOT NULL,action TEXT NOT NULL,occurred_at TEXT NOT NULL,details TEXT NOT NULL,prev_hash TEXT NOT NULL,event_hash TEXT NOT NULL);
            CREATE INDEX IF NOT EXISTS bank_ops_user ON bank_operations(user_id,created_at);
            CREATE INDEX IF NOT EXISTS bank_tx_user ON bank_transactions(user_id,occurred_at);
            """)
            # sqlite3.executescript commits the preceding transaction.
            db.execute("BEGIN IMMEDIATE")
            self._seed(db)

    def _now(self):
        now = self.clock()
        if now.tzinfo is None:
            raise ValueError("clock must return an aware datetime")
        return now.astimezone(timezone.utc)

    def _stamp(self):
        return self._now().isoformat()

    def _connect(self):
        db = sqlite3.connect(self.db_path, timeout=20, isolation_level=None)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA journal_mode=WAL")
        db.execute("PRAGMA foreign_keys=ON")
        db.execute("PRAGMA busy_timeout=20000")
        return db

    @contextmanager
    def _tx(self):
        db = self._connect()
        try:
            db.execute("BEGIN IMMEDIATE")
            yield db
            if db.in_transaction:
                db.commit()
        except BaseException:
            if db.in_transaction:
                db.rollback()
            raise
        finally:
            db.close()

    def _seed(self, db):
        if db.execute("SELECT 1 FROM bank_users LIMIT 1").fetchone():
            return
        now = self._now()
        for user, name in [("alice", "林知夏"), ("bob", "陈昱")]:
            db.execute("INSERT INTO bank_users VALUES (?,?)", (user, name))
            db.execute("INSERT INTO bank_security(user_id) VALUES (?)", (user,))
        db.executemany("INSERT INTO bank_accounts VALUES (?,?,?,?,?)", [
            ("acct-alice", "alice", "日常活期账户", 2_865_000, "CNY"),
            ("acct-bob", "bob", "日常活期账户", 1_200_000, "CNY"),
            ("acct-wang1", "external", "王明收款账户", 0, "CNY"),
            ("acct-wang2", "external", "王敏收款账户", 0, "CNY"),
            ("acct-li", "external", "李娜收款账户", 0, "CNY"),
            ("acct-clearing", "system", "演示外部清算账户", 100_000_000, "CNY"),
        ])
        db.executemany("INSERT INTO bank_cards VALUES (?,?,?,?)", [
            ("card-alice", "alice", "1024", "active"),
            ("card-bob", "bob", "2048", "active"),
        ])
        for user in ["alice", "bob"]:
            db.executemany("INSERT INTO bank_contacts VALUES (?,?,?,?,?,?)", [
                ("wang1", user, "王明", "小王", "13800000001", "acct-wang1"),
                ("wang2", user, "王敏", "小王", "13800000002", "acct-wang2"),
                ("li", user, "李娜", "小李", "13900000001", "acct-li"),
            ])
        db.executemany("INSERT INTO bank_subscriptions VALUES (?,?,?,?,?)", [
            ("sub-video", "alice", "星河视频", 2500, "active"),
            ("sub-music", "alice", "云端音乐", 1800, "active"),
            ("sub-cloud", "alice", "云盘空间", 1200, "active"),
            ("sub-bob", "bob", "云端音乐", 1800, "active"),
        ])
        seed = [("工资入账", 1_580_000, "收入"), ("房租", -350_000, "居住"),
                ("城市地铁", -680, "交通"), ("每日咖啡", -3200, "餐饮"),
                ("生活超市", -26_840, "购物"), ("午间餐厅", -5800, "餐饮"),
                ("星河视频", -2500, "订阅"), ("云端音乐", -1800, "订阅"),
                ("云盘空间", -1200, "订阅"), ("海外线上商户", -198_000, "购物"),
                ("每日咖啡", -3500, "餐饮"), ("每日咖啡", -2800, "餐饮")]
        # Historical entries stay within the current demo month even on day 1.
        month_start = now.astimezone(CN).replace(day=1, hour=9, minute=0, second=0, microsecond=0)
        for n, (merchant, amount, category) in enumerate(seed):
            date = min(month_start + timedelta(hours=n * 2), now.astimezone(CN)).astimezone(timezone.utc).isoformat()
            txid = "seed-alice-" + str(n)
            db.execute("INSERT INTO bank_transactions VALUES (?,?,?,?,?,?,?,?,NULL)",
                       (txid, "alice", "acct-alice", merchant, amount, category, date, "模拟交易，非真实消费",))
        # Opening entries plus mirrored historical postings make every account
        # balance equal its ledger sum; each historical movement is zero-sum.
        seed_net = sum(x[1] for x in seed)
        for acc in db.execute("SELECT * FROM bank_accounts").fetchall():
            opening = acc["balance_cents"] - (seed_net if acc["id"] == "acct-alice" else -seed_net if acc["id"] == "acct-clearing" else 0)
            db.execute("INSERT INTO bank_ledger(account_id,operation_id,amount_cents,occurred_at) VALUES (?,?,?,?)", (acc["id"], "opening", opening, self._stamp()))
        for n, (_, amount, _) in enumerate(seed):
            for acc, value in [("acct-alice", amount), ("acct-clearing", -amount)]:
                db.execute("INSERT INTO bank_ledger(account_id,operation_id,amount_cents,occurred_at) VALUES (?,?,?,?)", (acc, "seed-alice-"+str(n), value, self._stamp()))
        for user in ["alice", "bob"]:
            self._event(db, user, "demo.initialized", {"demo": True})

    def _user(self, db, user):
        if not db.execute("SELECT 1 FROM bank_users WHERE id=?", (user,)).fetchone():
            raise DomainError("not_found", "用户不存在", 404)

    def _guard(self, db, user):
        self._user(db, user)
        row = db.execute("SELECT * FROM bank_security WHERE user_id=?", (user,)).fetchone()
        if row["locked_until"] and datetime.fromisoformat(row["locked_until"]) > self._now():
            raise DomainError("security_locked", "连续验证失败，账户操作已临时锁定，请稍后重试或人工接管", 423)
        return row

    def _event(self, db, user, action, details):
        previous = db.execute("SELECT event_hash FROM bank_audit WHERE user_id=? ORDER BY id DESC LIMIT 1", (user,)).fetchone()
        prev = previous[0] if previous else "0" * 64
        stamp = self._stamp()
        payload = canonical({"user_id":user,"action":action,"occurred_at":stamp,"details":details,"prev_hash":prev})
        digest = hashlib.sha256(payload.encode()).hexdigest()
        db.execute("INSERT INTO bank_audit(user_id,action,occurred_at,details,prev_hash,event_hash) VALUES (?,?,?,?,?,?)", (user, action, stamp, canonical(details), prev, digest))

    def record_event(self, user_id, action, details):
        """Trusted orchestration audit ingress; never expose as a model tool."""
        if not isinstance(action, str) or not action.startswith(("plan.", "step.", "operator.")):
            raise DomainError("invalid_event", "未声明的审计事件类型。")
        with self._tx() as db:
            self._user(db, user_id)
            self._event(db, user_id, action, details)

    def _day(self):
        start = self._now().astimezone(CN).replace(hour=0, minute=0, second=0, microsecond=0)
        return start.astimezone(timezone.utc).isoformat(), (start + timedelta(days=1)).astimezone(timezone.utc).isoformat()

    def _daily(self, db, user):
        start, end = self._day()
        rows = db.execute("SELECT receipt FROM bank_operations WHERE user_id=? AND tool='transfer' AND receipt IS NOT NULL", (user,)).fetchall()
        return sum(r["amount_cents"] for row in rows if start <= (r := json.loads(row[0]))["occurred_at"] < end)

    def summary(self, user_id):
        with self._tx() as db:
            self._user(db, user_id)
            result = {
                "accounts": [dict(x) for x in db.execute("SELECT id,name,balance_cents,currency FROM bank_accounts WHERE user_id=?", (user_id,))],
                "cards": [dict(x) for x in db.execute("SELECT id,last4,status FROM bank_cards WHERE user_id=?", (user_id,))],
                "contacts": [dict(x) for x in db.execute("SELECT id,name,alias,phone FROM bank_contacts WHERE user_id=?", (user_id,))],
                "daily_transfer_cents": self._daily(db, user_id), "subscriptions": [],
                "goals": [dict(x) for x in db.execute("SELECT id,name,amount_cents,created_at FROM bank_goals WHERE user_id=?", (user_id,))], "demo": True,
            }
            self._event(db, user_id, "account.summary", {"account_count": len(result["accounts"])})
            return result

    def _period(self, period):
        now = self._now().astimezone(CN)
        if period == "all":
            return datetime(2000,1,1,tzinfo=CN), datetime(2200,1,1,tzinfo=CN)
        if period == "month": year, month = now.year, now.month
        elif period == "last_month":
            previous = now.replace(day=1) - timedelta(days=1)
            year, month = previous.year, previous.month
        elif period == "year": return datetime(now.year,1,1,tzinfo=CN), datetime(now.year+1,1,1,tzinfo=CN)
        elif isinstance(period, str) and re.fullmatch(r"20\d{2}-\d{2}", period):
            year, month = map(int, period.split("-"))
        elif isinstance(period, str) and re.fullmatch(r"20\d{2}", period):
            return datetime(int(period),1,1,tzinfo=CN), datetime(int(period)+1,1,1,tzinfo=CN)
        else: raise DomainError("invalid_period", "时间范围应为 month、last_month、year、all、YYYY-MM 或 YYYY")
        try:
            start = datetime(year,month,1,tzinfo=CN)
            end = datetime(year+1,1,1,tzinfo=CN) if month == 12 else datetime(year,month+1,1,tzinfo=CN)
            return start,end
        except ValueError:
            raise DomainError("invalid_period", "月份无效") from None

    def _transactions(self, db, user, period):
        self._user(db,user)
        start,end = self._period(period)
        return [dict(x) for x in db.execute("SELECT id,merchant,amount_cents,category,occurred_at,description FROM bank_transactions WHERE user_id=? AND occurred_at>=? AND occurred_at<? ORDER BY occurred_at DESC,id", (user,start.astimezone(timezone.utc).isoformat(),end.astimezone(timezone.utc).isoformat()))]

    def transactions(self, user_id, period="month"):
        with self._tx() as db:
            rows = self._transactions(db,user_id,period)
            self._event(db,user_id,"transactions.query",{"period":period,"count":len(rows)})
            return {"transactions":rows,"period":period,"total_expense_cents":sum(-x["amount_cents"] for x in rows if x["amount_cents"]<0)}

    def analysis(self, user_id, period="month"):
        with self._tx() as db:
            rows = self._transactions(db,user_id,period)
            grouped = {}
            anomalies = []
            for row in rows:
                amount = row["amount_cents"]
                if amount >= 0: continue
                cat = grouped.setdefault(row["category"], {"category":row["category"],"total_cents":0,"count":0})
                cat["total_cents"] -= amount; cat["count"] += 1
                if -amount >= 100_000 and row["category"] != "居住":
                    anomalies.append({"transaction_id":row["id"],"reason":"单笔非居住支出超过演示阈值 1000 元，请核对；不构成欺诈判断", "amount_cents":-amount})
            self._event(db,user_id,"transactions.analysis",{"period":period,"source_count":len(rows),"anomaly_count":len(anomalies)})
            return {"period":period,"categories":sorted(grouped.values(),key=lambda x:-x["total_cents"]),"total_expense_cents":sum(v["total_cents"] for v in grouped.values()),"income_cents":sum(x["amount_cents"] for x in rows if x["amount_cents"]>0),"anomalies":anomalies,"transaction_count":len(rows),"source_transaction_ids":[x["id"] for x in rows],"method":"deterministic-category-and-threshold-v1"}

    def _cents(self, value):
        if type(value) is not int or not 0 < value <= MAX_CENTS:
            raise DomainError("invalid_amount", "金额必须为正整数分，单笔不超过 50000 元")

    def _params(self, tool, params):
        schemas = {"transfer":({"contact_id","amount_cents"},{"note"}),"card.report_lost":({"card_id"},set()),"card.unlock":({"card_id"},set()),"card.virtual":(set(),set()),"subscriptions.get":(set(),set()),"subscriptions.cancel":({"subscription_id"},set()),"goals.create":({"name","amount_cents"},set())}
        if tool not in schemas: raise DomainError("unknown_tool", "此工具未被允许")
        if not isinstance(params,dict): raise DomainError("invalid_parameters", "参数必须为对象")
        required, optional = schemas[tool]
        if not required.issubset(params) or set(params) - required - optional:
            raise DomainError("invalid_parameters", "参数缺失或含未允许字段")
        if "amount_cents" in params:self._cents(params["amount_cents"])
        for key, value in params.items():
            if key == "amount_cents":continue
            if not isinstance(value,str) or len(value)>200 or (key!="note" and not value.strip()):
                raise DomainError("invalid_parameters", "文本参数无效或超过 200 字符")
        return json.loads(canonical(params))

    def _check_resources(self, db, user, tool, params):
        if tool == "transfer":
            if not db.execute("SELECT 1 FROM bank_contacts WHERE user_id=? AND id=?", (user,params["contact_id"])).fetchone():
                raise DomainError("not_found","收款联系人不存在",404)
        elif tool in ("card.report_lost","card.unlock"):
            if not db.execute("SELECT 1 FROM bank_cards WHERE user_id=? AND id=?",(user,params["card_id"])).fetchone():
                raise DomainError("not_found","卡片不存在",404)
        elif tool == "subscriptions.cancel":
            if not db.execute("SELECT 1 FROM bank_subscriptions WHERE user_id=? AND id=?",(user,params["subscription_id"])).fetchone():
                raise DomainError("not_found","订阅不存在",404)

    def _risk(self, db, user, tool, params):
        return "red" if tool in ("card.report_lost","card.unlock") or (tool=="transfer" and self._daily(db,user)+params["amount_cents"]>YELLOW_LIMIT) else "yellow"

    def create_operation(self,user_id,tool,params,idempotency_key):
        params = self._params(tool,params)
        if not isinstance(idempotency_key,str) or not 1<=len(idempotency_key)<=160:
            raise DomainError("invalid_idempotency_key","幂等键必须为 1–160 字符")
        fingerprint = hashlib.sha256(canonical({"tool":tool,"params":params}).encode()).hexdigest()
        with self._tx() as db:
            self._guard(db,user_id)
            existing=db.execute("SELECT * FROM bank_operations WHERE user_id=? AND idem_key=?",(user_id,idempotency_key)).fetchone()
            if existing:
                if existing["fingerprint"]!=fingerprint: raise DomainError("idempotency_conflict","同一幂等键不能用于不同操作",409)
                return self._operation(existing)
            self._check_resources(db,user_id,tool,params)
            risk=self._risk(db,user_id,tool,params)
            opid=_id("op")
            expiry=(self._now()+timedelta(minutes=10)).isoformat()
            db.execute("INSERT INTO bank_operations(id,user_id,tool,params,idem_key,fingerprint,risk,status,message,created_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",(opid,user_id,tool,canonical(params),idempotency_key,fingerprint,risk,"awaiting_confirmation","请核对操作详情后确认" if risk=="yellow" else "此操作需要独立强验证",self._stamp(),expiry))
            self._event(db,user_id,"operation.created",{"operation_id":opid,"tool":tool,"risk":risk,"parameter_fingerprint":fingerprint})
            return self._operation(self._load(db,user_id,opid))

    def _load(self,db,user,opid):
        self._user(db,user)
        row=db.execute("SELECT * FROM bank_operations WHERE id=? AND user_id=?",(opid,user)).fetchone()
        if not row:raise DomainError("not_found","操作不存在",404)
        return row

    def _operation(self,row):
        result={k:row[k] for k in ["id","tool","risk","status","message","created_at","expires_at"]}
        result["params"]=json.loads(row["params"])
        result["receipt"]=json.loads(row["receipt"]) if row["receipt"] and row["status"]=="succeeded" else None
        if row["challenge_id"]:result["challenge_id"]=row["challenge_id"]
        return result

    def get_operation(self,user_id,operation_id):
        with self._tx() as db:return self._operation(self._load(db,user_id,operation_id))

    def _challenge(self,db,user,row):
        code=f"{secrets.randbelow(1_000_000):06d}"
        challenge=_id("challenge")
        expires=min(self._now()+timedelta(minutes=3),datetime.fromisoformat(row["expires_at"]))
        digest=hashlib.sha256((challenge+":"+row["fingerprint"]+":"+code).encode()).hexdigest()
        db.execute("UPDATE bank_operations SET risk='red',status='awaiting_verification',message=?,challenge_id=?,otp_hash=?,otp_demo=?,otp_expires=? WHERE id=?",("请在独立认证面板输入模拟验证码",challenge,digest,code,expires.isoformat(),row["id"]))
        self._event(db,user,"authorization.challenge",{"operation_id":row["id"],"challenge_id":challenge,"expires_at":expires.isoformat()})

    def authorize(self,user_id,operation_id,approve,otp=None):
        if type(approve) is not bool:raise DomainError("invalid_approval","确认必须为布尔值")
        if otp is not None and (not isinstance(otp,str) or len(otp)>20):raise DomainError("invalid_otp","验证码格式无效")
        pending_error=None
        with self._tx() as db:
            security=self._guard(db,user_id)
            row=self._load(db,user_id,operation_id)
            if row["status"] in ("succeeded","unknown"):
                return self._operation(row)
            if row["status"] in ("cancelled","failed"):raise DomainError("operation_terminal","操作已结束",409)
            if not approve:
                self._cancel(db,user_id,row)
            elif datetime.fromisoformat(row["expires_at"])<=self._now():
                db.execute("UPDATE bank_operations SET status='failed',message='操作授权已过期，请重新发起',otp_demo=NULL,otp_hash=NULL WHERE id=?",(operation_id,))
                self._event(db,user_id,"authorization.expired",{"operation_id":operation_id})
                pending_error=DomainError("authorization_expired","操作授权已过期，请重新发起",409)
            else:
                params=json.loads(row["params"])
                self._check_resources(db,user_id,row["tool"],params)
                required=self._risk(db,user_id,row["tool"],params)
                if required=="red" and row["risk"]=="yellow":
                    self._event(db,user_id,"authorization.risk_upgraded",{"operation_id":operation_id,"reason":"daily_cumulative"})
                    self._challenge(db,user_id,row)
                elif row["risk"]=="red":
                    if not row["challenge_id"] or not row["otp_expires"] or datetime.fromisoformat(row["otp_expires"])<=self._now():
                        self._challenge(db,user_id,row)
                    elif otp is None:
                        pass
                    else:
                        digest=hashlib.sha256((row["challenge_id"]+":"+row["fingerprint"]+":"+otp).encode()).hexdigest()
                        if not secrets.compare_digest(digest,row["otp_hash"] or ""):
                            failures=security["failures"]+1
                            locked=(self._now()+timedelta(minutes=5)).isoformat() if failures>=3 else None
                            db.execute("UPDATE bank_security SET failures=?,locked_until=? WHERE user_id=?",(failures,locked,user_id))
                            self._event(db,user_id,"authorization.denied",{"operation_id":operation_id,"reason":"invalid_verification","failure_count":failures,"locked":bool(locked)})
                            pending_error=DomainError("security_locked" if locked else "invalid_otp","验证失败，操作未执行"+("；账户已临时锁定" if locked else ""),423 if locked else 400)
                        else:
                            db.execute("UPDATE bank_security SET failures=0,locked_until=NULL WHERE user_id=?",(user_id,))
                            self._event(db,user_id,"authorization.verified",{"operation_id":operation_id,"challenge_id":row["challenge_id"]})
                            # Consume the proof even if the downstream channel
                            # fails. A later retry needs a fresh challenge.
                            db.execute("UPDATE bank_operations SET otp_hash=NULL,otp_demo=NULL,otp_expires=NULL,challenge_id=NULL WHERE id=?",(operation_id,))
                            self._execute(db,user_id,row,params)
                else:
                    self._event(db,user_id,"authorization.confirmed",{"operation_id":operation_id,"parameter_fingerprint":row["fingerprint"]})
                    self._execute(db,user_id,row,params)
            result=self._operation(self._load(db,user_id,operation_id))
        if pending_error:raise pending_error
        return result

    def _execute(self,db,user,row,params):
        security=db.execute("SELECT * FROM bank_security WHERE user_id=?",(user,)).fetchone()
        if security["channel_open_until"] and datetime.fromisoformat(security["channel_open_until"])>self._now():
            db.execute("UPDATE bank_operations SET status='awaiting_confirmation',message='业务通道熔断中，请稍后重试或人工接管' WHERE id=?",(row["id"],))
            self._event(db,user,"channel.blocked",{"operation_id":row["id"]})
            return
        if security["fault"]=="channel_failure":
            count=security["channel_failures"]+1
            opens=(self._now()+timedelta(seconds=60)).isoformat() if count>=3 else None
            db.execute("UPDATE bank_security SET channel_failures=?,channel_open_until=? WHERE user_id=?",(count,opens,user))
            db.execute("UPDATE bank_operations SET status='awaiting_confirmation',message='业务通道暂不可用，未执行' WHERE id=?",(row["id"],))
            self._event(db,user,"channel.failure",{"operation_id":row["id"],"failure_count":count,"circuit_open":bool(opens)})
            return
        tool=row["tool"]
        receipt={"id":_id("receipt"),"status":"succeeded","tool":tool,"occurred_at":self._stamp(),"operation_id":row["id"],"demo":True}
        if tool=="transfer":
            source=db.execute("SELECT * FROM bank_accounts WHERE user_id=? ORDER BY id LIMIT 1",(user,)).fetchone()
            contact=db.execute("SELECT * FROM bank_contacts WHERE user_id=? AND id=?",(user,params["contact_id"])).fetchone()
            amount=params["amount_cents"]
            if source["balance_cents"]<amount:
                db.execute("UPDATE bank_operations SET status='failed',message='余额不足，未执行',otp_demo=NULL,otp_hash=NULL WHERE id=?",(row["id"],))
                self._event(db,user,"operation.failed",{"operation_id":row["id"],"reason":"insufficient_balance"})
                return
            db.execute("UPDATE bank_accounts SET balance_cents=balance_cents-? WHERE id=?",(amount,source["id"]))
            db.execute("UPDATE bank_accounts SET balance_cents=balance_cents+? WHERE id=?",(amount,contact["account_id"]))
            for account,value in [(source["id"],-amount),(contact["account_id"],amount)]:
                db.execute("INSERT INTO bank_ledger(account_id,operation_id,amount_cents,occurred_at) VALUES (?,?,?,?)",(account,row["id"],value,self._stamp()))
            db.execute("INSERT INTO bank_transactions VALUES (?,?,?,?,?,?,?,?,?)",(_id("tx"),user,source["id"],contact["name"],-amount,"转账",self._stamp(),params.get("note", ""),row["id"]))
            receipt.update(amount_cents=amount,currency="CNY",contact_id=contact["id"],recipient=contact["name"],balance_cents=source["balance_cents"]-amount)
        elif tool in ("card.report_lost","card.unlock"):
            status="lost" if tool=="card.report_lost" else "active"
            db.execute("UPDATE bank_cards SET status=? WHERE id=? AND user_id=?",(status,params["card_id"],user))
            receipt.update(card_id=params["card_id"],card_status=status)
        elif tool=="card.virtual":
            cardid=_id("virtual")
            last4=f"{secrets.randbelow(10000):04d}"
            db.execute("INSERT INTO bank_cards VALUES (?,?,?,?)",(cardid,user,last4,"active"))
            receipt.update(card_id=cardid,last4=last4,card_status="active")
        elif tool=="subscriptions.get":
            receipt["subscriptions"]=[dict(r) for r in db.execute("SELECT id,name,amount_cents,status FROM bank_subscriptions WHERE user_id=?",(user,))]
        elif tool=="subscriptions.cancel":
            db.execute("UPDATE bank_subscriptions SET status='cancelled' WHERE id=? AND user_id=?",(params["subscription_id"],user))
            receipt.update(subscription_id=params["subscription_id"],subscription_status="cancelled")
        elif tool=="goals.create":
            goalid=_id("goal")
            db.execute("INSERT INTO bank_goals VALUES (?,?,?,?,?)",(goalid,user,params["name"],params["amount_cents"],self._stamp()))
            receipt.update(goal_id=goalid,name=params["name"],amount_cents=params["amount_cents"],funds_reserved=False)
        else:raise DomainError("unknown_tool","执行器不支持此工具")
        unknown=security["fault"]=="timeout_after_commit"
        db.execute("UPDATE bank_operations SET status=?,message=?,receipt=?,otp_hash=NULL,otp_demo=NULL WHERE id=?",("unknown" if unknown else "succeeded","模拟通道回执丢失，结果待核实，请查询对账" if unknown else "操作已完成，以业务回执为准",canonical(receipt),row["id"]))
        db.execute("UPDATE bank_security SET channel_failures=0,channel_open_until=NULL WHERE user_id=?",(user,))
        self._event(db,user,"operation.committed",{"operation_id":row["id"],"receipt_id":receipt["id"],"tool":tool,"result_delivery":"unknown" if unknown else "delivered"})

    def _cancel(self,db,user,row):
        if row["status"] in ("succeeded","unknown"):raise DomainError("cannot_cancel_committed","已提交或结果未知的操作不能直接取消，请先对账",409)
        if row["status"]=="cancelled":return
        if row["status"]=="failed":raise DomainError("operation_terminal","操作已结束",409)
        db.execute("UPDATE bank_operations SET status='cancelled',message='用户取消，未执行',otp_hash=NULL,otp_demo=NULL WHERE id=?",(row["id"],))
        self._event(db,user,"operation.cancelled",{"operation_id":row["id"]})

    def cancel_operation(self,user_id,operation_id):
        with self._tx() as db:
            row=self._load(db,user_id,operation_id)
            self._cancel(db,user_id,row)
            return self._operation(self._load(db,user_id,operation_id))

    def demo_inbox(self,user_id):
        with self._tx() as db:
            self._guard(db,user_id)
            messages=[{"operation_id":r["id"],"code":r["otp_demo"],"expires_at":r["otp_expires"]} for r in db.execute("SELECT * FROM bank_operations WHERE user_id=? AND status='awaiting_verification' AND otp_demo IS NOT NULL AND otp_expires>?",(user_id,self._stamp()))]
            return {"demo":True,"messages":messages,"warning":"仅为演示认证收件箱，不是真实短信或多因子认证提供方"}

    def reconcile(self,user_id,operation_id):
        with self._tx() as db:
            row=self._load(db,user_id,operation_id)
            if row["status"]=="unknown" and row["receipt"]:
                db.execute("UPDATE bank_operations SET status='succeeded',message='对账已核实成功，未重复执行' WHERE id=?",(operation_id,))
                self._event(db,user_id,"operation.reconciled",{"operation_id":operation_id,"receipt_id":json.loads(row["receipt"])["id"]})
            return self._operation(self._load(db,user_id,operation_id))

    def set_fault(self,user_id,mode):
        if mode not in ("none","timeout_after_commit","channel_failure"):raise DomainError("invalid_fault","未知故障模式")
        with self._tx() as db:
            self._user(db,user_id)
            db.execute("UPDATE bank_security SET fault=? WHERE user_id=?",(mode,user_id))
            self._event(db,user_id,"demo.fault_configured",{"mode":mode})
        return {"mode":mode,"demo":True}

    def audit(self,user_id):
        with self._tx() as db:
            self._user(db,user_id)
            rows=db.execute("SELECT * FROM bank_audit WHERE user_id=? ORDER BY id",(user_id,)).fetchall()
            prev="0"*64; valid=True; events=[]
            for row in rows:
                details=json.loads(row["details"])
                payload=canonical({"user_id":row["user_id"],"action":row["action"],"occurred_at":row["occurred_at"],"details":details,"prev_hash":row["prev_hash"]})
                digest=hashlib.sha256(payload.encode()).hexdigest()
                if row["prev_hash"]!=prev or row["event_hash"]!=digest:valid=False
                prev=row["event_hash"]
                events.append({"id":row["id"],"action":row["action"],"occurred_at":row["occurred_at"],"details":details,"event_hash":row["event_hash"]})
            return {"events":events,"chain_valid":valid,"storage":"SQLite hash chain: tamper-evident, not immutable"}
