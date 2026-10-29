"""Deterministic, transactional fake bank. No model output grants authority.

Amounts are integer CNY cents. This is a local competition simulator, not a
production bank, real identity provider, or immutable audit storage system.
"""
from __future__ import annotations

from contextlib import contextmanager
from datetime import date, datetime, timedelta, timezone
import calendar
import hashlib
import json
import random
import re
import secrets
import sqlite3
from pathlib import Path
from typing import Callable

from . import insights
from .catalog import (INVESTOR_NAMES, ITEM_BY_ID, MERCHANT_ITEMS, PRODUCT_BY_ID, PRODUCTS, QUESTIONNAIRE,
                      RISK_NAMES, nav_series, score_answers)
from .tools import LABELS, ParamError, check_params


class DomainError(Exception):
    def __init__(self, code: str, message: str, status: int = 400):
        super().__init__(message)
        self.code, self.message, self.status = code, message, status


CN = timezone(timedelta(hours=8))
MAX_CENTS = 5_000_000
YELLOW_LIMIT = 100_000
DEFAULT_CONTROLS = {"online": True, "overseas": False, "atm": True, "contactless": True}
CONTROL_NAMES = {"online": "网上支付", "overseas": "境外交易", "atm": "ATM 取现", "contactless": "小额免密"}
VELOCITY_LIMIT = 8


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _id(prefix):
    return prefix + "_" + secrets.token_hex(12)


def add_months(day: date, months: int) -> date:
    month = day.month - 1 + months
    year, month = day.year + month // 12, month % 12 + 1
    return date(year, month, min(day.day, calendar.monthrange(year, month)[1]))


def next_birthday(mmdd: str, today: date) -> date:
    month, day = map(int, mmdd.split("-"))
    for year in (today.year, today.year + 1):
        try:
            candidate = date(year, month, day)
        except ValueError:  # 02-29 in a non-leap year
            candidate = date(year, 2, 28)
        if candidate >= today:
            return candidate
    return candidate


SCHEMA = """
CREATE TABLE IF NOT EXISTS bank_users(id TEXT PRIMARY KEY,name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS bank_accounts(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,name TEXT NOT NULL,balance_cents INTEGER NOT NULL CHECK(balance_cents>=0),currency TEXT NOT NULL DEFAULT 'CNY');
CREATE TABLE IF NOT EXISTS bank_cards(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,last4 TEXT NOT NULL,status TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'debit',name TEXT NOT NULL DEFAULT '拾迹借记卡',limit_cents INTEGER,max_limit_cents INTEGER,
    used_cents INTEGER NOT NULL DEFAULT 0,controls TEXT NOT NULL DEFAULT '{}',pin_hash TEXT,pin_salt TEXT,created_at TEXT);
CREATE TABLE IF NOT EXISTS bank_contacts(id TEXT NOT NULL,user_id TEXT NOT NULL,name TEXT NOT NULL,alias TEXT,phone TEXT NOT NULL,account_id TEXT NOT NULL,
    relation TEXT,birthday TEXT,PRIMARY KEY(user_id,id));
CREATE TABLE IF NOT EXISTS bank_transactions(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,account_id TEXT NOT NULL,merchant TEXT NOT NULL,amount_cents INTEGER NOT NULL,category TEXT NOT NULL,occurred_at TEXT NOT NULL,description TEXT NOT NULL,operation_id TEXT UNIQUE);
CREATE TABLE IF NOT EXISTS bank_ledger(id INTEGER PRIMARY KEY AUTOINCREMENT,account_id TEXT NOT NULL,operation_id TEXT NOT NULL,amount_cents INTEGER NOT NULL,occurred_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS bank_subscriptions(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,name TEXT NOT NULL,amount_cents INTEGER NOT NULL,status TEXT NOT NULL,
    remind_days INTEGER,billing_day INTEGER NOT NULL DEFAULT 1,signed_at TEXT);
CREATE TABLE IF NOT EXISTS bank_goals(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,name TEXT NOT NULL,amount_cents INTEGER NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS bank_operations(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,tool TEXT NOT NULL,params TEXT NOT NULL,idem_key TEXT NOT NULL,fingerprint TEXT NOT NULL,risk TEXT NOT NULL,status TEXT NOT NULL,message TEXT NOT NULL,receipt TEXT,created_at TEXT NOT NULL,expires_at TEXT NOT NULL,challenge_id TEXT,otp_hash TEXT,otp_demo TEXT,otp_expires TEXT,UNIQUE(user_id,idem_key));
CREATE TABLE IF NOT EXISTS bank_security(user_id TEXT PRIMARY KEY,failures INTEGER NOT NULL DEFAULT 0,locked_until TEXT,channel_failures INTEGER NOT NULL DEFAULT 0,channel_open_until TEXT,fault TEXT NOT NULL DEFAULT 'none',
    suspicious_hits INTEGER NOT NULL DEFAULT 0,suspicious_since TEXT,lock_reason TEXT);
CREATE TABLE IF NOT EXISTS bank_audit(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id TEXT NOT NULL,action TEXT NOT NULL,occurred_at TEXT NOT NULL,details TEXT NOT NULL,prev_hash TEXT NOT NULL,event_hash TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS bank_holds(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,name TEXT NOT NULL,amount_cents INTEGER NOT NULL,used_cents INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL,release_date TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS bank_schedules(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,kind TEXT NOT NULL,params TEXT NOT NULL,execute_date TEXT NOT NULL,
    repeat TEXT NOT NULL DEFAULT 'none',status TEXT NOT NULL,created_at TEXT NOT NULL,operation_id TEXT,last_result TEXT);
CREATE TABLE IF NOT EXISTS bank_schedule_runs(id TEXT PRIMARY KEY,schedule_id TEXT NOT NULL,user_id TEXT NOT NULL,kind TEXT NOT NULL,run_date TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,status TEXT NOT NULL,occurred_at TEXT NOT NULL,message TEXT NOT NULL,operation_id TEXT,UNIQUE(schedule_id,run_date));
CREATE TABLE IF NOT EXISTS bank_splits(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,total_cents INTEGER NOT NULL,note TEXT NOT NULL,self_share_cents INTEGER NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS bank_split_shares(split_id TEXT NOT NULL,contact_id TEXT NOT NULL,name TEXT NOT NULL,amount_cents INTEGER NOT NULL,status TEXT NOT NULL,paid_at TEXT,PRIMARY KEY(split_id,contact_id));
CREATE TABLE IF NOT EXISTS bank_risk_profiles(user_id TEXT PRIMARY KEY,score INTEGER NOT NULL,level INTEGER NOT NULL,answers TEXT NOT NULL,notes TEXT NOT NULL,assessed_at TEXT NOT NULL,expires_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS bank_holdings(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,product_id TEXT NOT NULL,principal_cents INTEGER NOT NULL,subscribed_at TEXT NOT NULL,status TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS bank_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS bank_ops_user ON bank_operations(user_id,created_at);
CREATE INDEX IF NOT EXISTS bank_tx_user ON bank_transactions(user_id,occurred_at);
"""

# Columns added after the first public version; older data directories get them on open.
MIGRATIONS = {
    "bank_schedule_runs": [("operation_id", "TEXT")],
    "bank_cards": [("kind", "TEXT NOT NULL DEFAULT 'debit'"), ("name", "TEXT NOT NULL DEFAULT '拾迹借记卡'"), ("limit_cents", "INTEGER"),
                   ("max_limit_cents", "INTEGER"), ("used_cents", "INTEGER NOT NULL DEFAULT 0"), ("controls", "TEXT NOT NULL DEFAULT '{}'"),
                   ("pin_hash", "TEXT"), ("pin_salt", "TEXT"), ("created_at", "TEXT")],
    "bank_contacts": [("relation", "TEXT"), ("birthday", "TEXT")],
    "bank_subscriptions": [("remind_days", "INTEGER"), ("billing_day", "INTEGER NOT NULL DEFAULT 1"), ("signed_at", "TEXT")],
    "bank_security": [("suspicious_hits", "INTEGER NOT NULL DEFAULT 0"), ("suspicious_since", "TEXT"), ("lock_reason", "TEXT")],
}


class BankService:
    def __init__(self, db_path, clock: Callable | None = None):
        self.db_path = str(db_path)
        self.clock = clock or (lambda: datetime.now(timezone.utc))
        Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)
        with self._tx() as db:
            db.executescript(SCHEMA)
            for table, columns in MIGRATIONS.items():
                have = {r[1] for r in db.execute(f"PRAGMA table_info({table})")}
                for name, decl in columns:
                    if name not in have:
                        db.execute(f"ALTER TABLE {table} ADD COLUMN {name} {decl}")
            # sqlite3.executescript commits the preceding transaction.
            db.execute("BEGIN IMMEDIATE")
            self._seed(db)
        # An idle connection keeps the WAL file alive, so each short transaction
        # does not pay for a checkpoint and file recreation on close.
        self._keeper = self._connect()

    # ------------------------------------------------------------------ infra
    def _now(self):
        now = self.clock()
        if now.tzinfo is None:
            raise ValueError("clock must return an aware datetime")
        return now.astimezone(timezone.utc)

    def _stamp(self):
        return self._now().isoformat()

    def _today(self) -> date:
        return self._now().astimezone(CN).date()

    def _connect(self):
        db = sqlite3.connect(self.db_path, timeout=20, isolation_level=None)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA journal_mode=WAL")
        db.execute("PRAGMA synchronous=NORMAL")
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

    # ------------------------------------------------------------------ seed
    def _seed_rows(self, now):
        """Seven months of plausible spending for alice. Amounts are fixed by seed;
        only the timestamps follow the calendar, so totals never depend on the day."""
        local_now = now.astimezone(CN)
        month_start = local_now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        rows = []

        def month_events(offset, rng):
            """(day, hour, minute, merchant, amount, category, core). Core events
            always exist; routine spending only appears once its day has passed."""
            ev = []
            sub_video = 2500 if offset == 0 else 1990
            ev += [(1, 10, 0, "房租", -350_000, "居住", True), (1, 21, 0, "星河视频", -sub_video, "订阅", True),
                   (1, 23, 0, "云端音乐", -1800, "订阅", True), (2, 1, 0, "云盘空间", -1200, "订阅", True),
                   (5, 9, 20, "陈素兰", -100_000, "转账", True), (10, 9, 30, "工资入账", 1_580_000, "收入", True),
                   (15, 8, 10, "力行健身", -19_900, "运动", True), (18, 20, 5, "水电燃气", -rng.randint(160, 260) * 100, "居住", True)]
            for _ in range(10):
                ev.append((rng.randint(2, 28), rng.choice([8, 18]), rng.randint(0, 59), "城市地铁", -rng.randint(3, 7) * 100, "交通", False))
            for _ in range(2):
                ev.append((rng.randint(2, 28), rng.randint(19, 23), rng.randint(0, 59), "快行出行", -rng.randint(18, 46) * 100, "交通", False))
            for _ in range(8):
                ev.append((rng.randint(2, 28), rng.randint(8, 10), rng.randint(0, 59), "每日咖啡", -rng.choice([2600, 2800, 3200, 3500, 3800]), "餐饮", False))
            for _ in range(6):
                ev.append((rng.randint(2, 28), 12, rng.randint(0, 59), "午间餐厅", -rng.randint(38, 98) * 100, "餐饮", False))
            for _ in range(5):
                ev.append((rng.randint(2, 28), rng.randint(18, 21), rng.randint(0, 59), "饱了么外卖", -rng.randint(29, 68) * 100, "餐饮", False))
            for _ in range(3):
                ev.append((rng.randint(2, 28), rng.randint(17, 21), rng.randint(0, 59), "生活超市", -rng.randint(120, 420) * 100, "购物", False))
            for _ in range(2):
                ev.append((rng.randint(2, 28), rng.randint(20, 23), rng.randint(0, 59), "拾物商城", -rng.randint(80, 390) * 100, "购物", False))
            if offset == 3:
                ev.append((rng.randint(3, 27), 14, 30, "云程航旅", -168_000, "出行", False))
            if offset == 5:
                ev.append((rng.randint(3, 27), 9, 10, "市第一医院", -4500, "医疗", False))
            if offset == 0:
                # Things worth a second look this month: a likely double charge,
                # a large cross-border purchase and a late-night top-up.
                ev += [(6, 18, 42, "生活超市", -26_840, "购物", True), (6, 18, 44, "生活超市", -26_840, "购物", True),
                       (12, 22, 16, "海外线上商户", -198_000, "购物", True), (17, 2, 13, "星际商城", -64_800, "娱乐", True)]
            return ev

        for offset in range(6, -1, -1):
            first = add_months(month_start.date(), -offset)
            last_day = calendar.monthrange(first.year, first.month)[1]
            rng = random.Random(f"tracebank-alice-{offset}")
            events = sorted(month_events(offset, rng), key=lambda e: (min(e[0], last_day), e[1], e[2]))
            n = 0
            for d, hh, mm, merchant, amount, category, core in events:
                stamp = datetime(first.year, first.month, min(d, last_day), hh, mm, tzinfo=CN)
                if offset == 0 and stamp > local_now:
                    if not core:
                        continue
                    # Keep the time of day, move it to the latest day that has passed.
                    stamp = local_now.replace(hour=hh, minute=mm, second=0, microsecond=0)
                    if stamp > local_now:
                        stamp -= timedelta(days=1)
                    if stamp < month_start:
                        stamp = month_start + timedelta(minutes=n)
                rows.append((f"seed-alice-{offset}-{n}", merchant, amount, category, stamp.astimezone(timezone.utc).isoformat()))
                n += 1
        return rows

    def _seed(self, db):
        if db.execute("SELECT 1 FROM bank_users LIMIT 1").fetchone():
            self._seed_v2_extras(db)
            return
        now = self._now()
        today = self._today()
        for user, name in [("alice", "林知夏"), ("bob", "陈昱")]:
            db.execute("INSERT INTO bank_users VALUES (?,?)", (user, name))
            db.execute("INSERT INTO bank_security(user_id) VALUES (?)", (user,))
        db.executemany("INSERT INTO bank_accounts VALUES (?,?,?,?,?)", [
            ("acct-alice", "alice", "日常活期账户", 2_865_000, "CNY"),
            ("acct-bob", "bob", "日常活期账户", 1_200_000, "CNY"),
            ("acct-wang1", "external", "王明收款账户", 0, "CNY"),
            ("acct-wang2", "external", "王敏收款账户", 0, "CNY"),
            ("acct-li", "external", "李娜收款账户", 0, "CNY"),
            ("acct-zhou", "external", "周屿收款账户", 0, "CNY"),
            ("acct-mom", "external", "陈素兰收款账户", 0, "CNY"),
            ("acct-merchant", "system", "合作商户结算账户", 0, "CNY"),
            ("acct-custody", "system", "理财托管清算账户", 50_000_000, "CNY"),
            ("acct-clearing", "system", "演示外部清算账户", 100_000_000, "CNY"),
        ])
        stamp = self._stamp()
        controls = canonical(DEFAULT_CONTROLS)
        db.executemany("INSERT INTO bank_cards(id,user_id,last4,status,kind,name,limit_cents,max_limit_cents,used_cents,controls,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)", [
            ("card-alice", "alice", "1024", "active", "debit", "拾迹借记卡", None, None, 0, controls, stamp),
            ("card-credit", "alice", "6688", "active", "credit", "拾迹信用卡 · 金卡", 3_000_000, 5_000_000, 428_650, controls, stamp),
            ("card-bob", "bob", "2048", "active", "debit", "拾迹借记卡", None, None, 0, controls, stamp),
        ])
        def mmdd(days):
            return (today + timedelta(days=days)).strftime("%m-%d")
        for user in ["alice", "bob"]:
            db.executemany("INSERT INTO bank_contacts VALUES (?,?,?,?,?,?,?,?)", [
                ("wang1", user, "王明", "小王", "13800000001", "acct-wang1", "朋友", None),
                ("wang2", user, "王敏", "小王", "13800000002", "acct-wang2", "朋友", None),
                ("li", user, "李娜", "小李", "13900000001", "acct-li", "同事", mmdd(75)),
            ])
        db.executemany("INSERT INTO bank_contacts VALUES (?,?,?,?,?,?,?,?)", [
            ("spouse", "alice", "周屿", "爱人", "13700000001", "acct-zhou", "爱人", mmdd(12)),
            ("mom", "alice", "陈素兰", "妈妈", "13600000001", "acct-mom", "母亲", mmdd(41)),
        ])
        signed = (today - timedelta(days=400)).isoformat()
        db.executemany("INSERT INTO bank_subscriptions(id,user_id,name,amount_cents,status,remind_days,billing_day,signed_at) VALUES (?,?,?,?,?,?,?,?)", [
            ("sub-video", "alice", "星河视频", 2500, "active", None, 1, signed),
            ("sub-music", "alice", "云端音乐", 1800, "active", 3, 1, signed),
            ("sub-cloud", "alice", "云盘空间", 1200, "active", None, 2, signed),
            ("sub-bob", "bob", "云端音乐", 1800, "active", None, 1, signed),
        ])
        seed = self._seed_rows(now)
        for txid, merchant, amount, category, occurred in seed:
            db.execute("INSERT INTO bank_transactions VALUES (?,?,?,?,?,?,?,?,NULL)",
                       (txid, "alice", "acct-alice", merchant, amount, category, occurred, "模拟交易，非真实消费"))
        # Opening entries plus mirrored historical postings make every account
        # balance equal its ledger sum; each historical movement is zero-sum.
        seed_net = sum(x[2] for x in seed)
        for acc in db.execute("SELECT * FROM bank_accounts").fetchall():
            opening = acc["balance_cents"] - (seed_net if acc["id"] == "acct-alice" else -seed_net if acc["id"] == "acct-clearing" else 0)
            db.execute("INSERT INTO bank_ledger(account_id,operation_id,amount_cents,occurred_at) VALUES (?,?,?,?)", (acc["id"], "opening", opening, stamp))
        for txid, _, amount, _, _ in seed:
            for acc, value in [("acct-alice", amount), ("acct-clearing", -amount)]:
                db.execute("INSERT INTO bank_ledger(account_id,operation_id,amount_cents,occurred_at) VALUES (?,?,?,?)", (acc, txid, value, stamp))
        # Existing positions were bought before the demo window; principal is
        # already off the current account.
        db.executemany("INSERT INTO bank_holdings VALUES (?,?,?,?,?,?)", [
            ("hold-cash", "alice", "wm-cash", 2_000_000, (now - timedelta(days=46)).isoformat(), "active"),
            ("hold-bond", "alice", "wm-bond90", 1_000_000, (now - timedelta(days=121)).isoformat(), "active"),
        ])
        assessed = now - timedelta(days=120)
        db.execute("INSERT INTO bank_risk_profiles VALUES (?,?,?,?,?,?,?)",
                   ("alice", 52, 3, canonical([1, 2, 2, 2, 2, 1, 2, 2]), canonical([]), assessed.isoformat(),
                    (assessed + timedelta(days=365)).isoformat()))
        db.execute("INSERT OR REPLACE INTO bank_meta VALUES ('seed_version','2')")
        for user in ["alice", "bob"]:
            self._event(db, user, "demo.initialized", {"demo": True, "seed_version": 2})

    def _seed_v2_extras(self, db):
        """Data directories created by the first version get the new demo objects."""
        row = db.execute("SELECT value FROM bank_meta WHERE key='seed_version'").fetchone()
        if row and row[0] == "2":
            return
        today, stamp = self._today(), self._stamp()
        db.execute("UPDATE bank_cards SET controls=? WHERE controls='{}'", (canonical(DEFAULT_CONTROLS),))
        if not db.execute("SELECT 1 FROM bank_cards WHERE id='card-credit'").fetchone():
            db.execute("INSERT INTO bank_cards(id,user_id,last4,status,kind,name,limit_cents,max_limit_cents,used_cents,controls,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                       ("card-credit", "alice", "6688", "active", "credit", "拾迹信用卡 · 金卡", 3_000_000, 5_000_000, 428_650, canonical(DEFAULT_CONTROLS), stamp))
        for acc, name, opening in [("acct-zhou", "周屿收款账户", 0), ("acct-mom", "陈素兰收款账户", 0),
                                   ("acct-merchant", "合作商户结算账户", 0), ("acct-custody", "理财托管清算账户", 50_000_000)]:
            if not db.execute("SELECT 1 FROM bank_accounts WHERE id=?", (acc,)).fetchone():
                db.execute("INSERT INTO bank_accounts VALUES (?,?,?,?,?)", (acc, "system" if opening else "external", name, opening, "CNY"))
                db.execute("INSERT INTO bank_ledger(account_id,operation_id,amount_cents,occurred_at) VALUES (?,?,?,?)", (acc, "opening", opening, stamp))
        if db.execute("SELECT 1 FROM bank_users WHERE id='alice'").fetchone():
            for cid, name, alias, phone, acc, rel, days in [("spouse", "周屿", "爱人", "13700000001", "acct-zhou", "爱人", 12),
                                                             ("mom", "陈素兰", "妈妈", "13600000001", "acct-mom", "母亲", 41)]:
                db.execute("INSERT OR IGNORE INTO bank_contacts VALUES (?,?,?,?,?,?,?,?)",
                           (cid, "alice", name, alias, phone, acc, rel, (today + timedelta(days=days)).strftime("%m-%d")))
            if not db.execute("SELECT 1 FROM bank_risk_profiles WHERE user_id='alice'").fetchone():
                assessed = self._now() - timedelta(days=120)
                db.execute("INSERT INTO bank_risk_profiles VALUES (?,?,?,?,?,?,?)", ("alice", 52, 3, canonical([1, 2, 2, 2, 2, 1, 2, 2]),
                           canonical([]), assessed.isoformat(), (assessed + timedelta(days=365)).isoformat()))
        db.execute("INSERT OR REPLACE INTO bank_meta VALUES ('seed_version','2')")

    # ------------------------------------------------------------------ guards
    def _user(self, db, user):
        if not db.execute("SELECT 1 FROM bank_users WHERE id=?", (user,)).fetchone():
            raise DomainError("not_found", "用户不存在", 404)

    def _guard(self, db, user):
        self._user(db, user)
        row = db.execute("SELECT * FROM bank_security WHERE user_id=?", (user,)).fetchone()
        if row["locked_until"] and datetime.fromisoformat(row["locked_until"]) > self._now():
            reason = row["lock_reason"] or "连续验证失败"
            raise DomainError("security_locked", f"{reason}，账户操作已临时锁定，请稍后重试或转人工处理", 423)
        return row

    def _lock(self, db, user, minutes, reason, details):
        until = (self._now() + timedelta(minutes=minutes)).isoformat()
        db.execute("UPDATE bank_security SET locked_until=?,lock_reason=? WHERE user_id=?", (until, reason, user))
        self._event(db, user, "security.locked", {"reason": reason, "until": until, **details})
        return until

    def _event(self, db, user, action, details):
        previous = db.execute("SELECT event_hash FROM bank_audit WHERE user_id=? ORDER BY id DESC LIMIT 1", (user,)).fetchone()
        prev = previous[0] if previous else "0" * 64
        stamp = self._stamp()
        payload = canonical({"user_id": user, "action": action, "occurred_at": stamp, "details": details, "prev_hash": prev})
        digest = hashlib.sha256(payload.encode()).hexdigest()
        db.execute("INSERT INTO bank_audit(user_id,action,occurred_at,details,prev_hash,event_hash) VALUES (?,?,?,?,?,?)", (user, action, stamp, canonical(details), prev, digest))

    def record_event(self, user_id, action, details):
        """Trusted orchestration audit ingress; never expose as a model tool."""
        if not isinstance(action, str) or not action.startswith(("plan.", "step.", "operator.", "security.")):
            raise DomainError("invalid_event", "未声明的审计事件类型。")
        with self._tx() as db:
            self._user(db, user_id)
            self._event(db, user_id, action, details)

    def flag_suspicious(self, user_id, reason):
        """Prompt-injection or bypass attempts. Three within ten minutes lock writes."""
        with self._tx() as db:
            row = self._guard_soft(db, user_id)
            since = row["suspicious_since"]
            hits = row["suspicious_hits"] or 0
            if not since or datetime.fromisoformat(since) < self._now() - timedelta(minutes=10):
                hits, since = 0, self._stamp()
            hits += 1
            db.execute("UPDATE bank_security SET suspicious_hits=?,suspicious_since=? WHERE user_id=?", (hits, since, user_id))
            self._event(db, user_id, "security.suspicious_input", {"reason": reason, "hits_in_window": hits})
            locked = None
            if hits >= 3:
                locked = self._lock(db, user_id, 10, "多次尝试绕过授权规则", {"hits_in_window": hits})
                db.execute("UPDATE bank_security SET suspicious_hits=0,suspicious_since=NULL WHERE user_id=?", (user_id,))
            return {"hits": hits, "locked_until": locked}

    def _guard_soft(self, db, user):
        self._user(db, user)
        return db.execute("SELECT * FROM bank_security WHERE user_id=?", (user,)).fetchone()

    # ------------------------------------------------------------------ reads
    def _day(self):
        start = self._now().astimezone(CN).replace(hour=0, minute=0, second=0, microsecond=0)
        return start.astimezone(timezone.utc).isoformat(), (start + timedelta(days=1)).astimezone(timezone.utc).isoformat()

    def _daily(self, db, user):
        start, end = self._day()
        rows = db.execute("SELECT receipt FROM bank_operations WHERE user_id=? AND tool='transfer' AND receipt IS NOT NULL", (user,)).fetchall()
        manual = sum(r["amount_cents"] for row in rows if start <= (r := json.loads(row[0]))["occurred_at"] < end)
        # Linked occurrences are normal transfer operations above, including
        # committed/unknown receipts. Count each debit once, also after upgrade.
        scheduled = db.execute("SELECT COALESCE(SUM(amount_cents),0) FROM bank_schedule_runs WHERE user_id=? AND kind='transfer' AND status='succeeded' AND operation_id IS NULL AND occurred_at>=? AND occurred_at<?",
                               (user, start, end)).fetchone()[0]
        return manual + scheduled

    def _held(self, db, user):
        return db.execute("SELECT COALESCE(SUM(amount_cents-used_cents),0) FROM bank_holds WHERE user_id=? AND status='active'", (user,)).fetchone()[0]

    def _source(self, db, user):
        return db.execute("SELECT * FROM bank_accounts WHERE user_id=? ORDER BY id LIMIT 1", (user,)).fetchone()

    def _card_dict(self, row):
        card = {k: row[k] for k in ["id", "last4", "status", "kind", "name", "limit_cents", "max_limit_cents", "used_cents", "created_at"]}
        card["controls"] = {**DEFAULT_CONTROLS, **json.loads(row["controls"] or "{}")}
        card["pin_set"] = bool(row["pin_hash"])
        if row["kind"] == "credit" and row["limit_cents"]:
            card["available_cents"] = max(0, row["limit_cents"] - row["used_cents"])
            today = self._today()
            statement = today.replace(day=5) if today.day >= 5 else add_months(today.replace(day=5), -1)
            card["statement_date"] = statement.isoformat()
            card["due_date"] = (statement + timedelta(days=20)).isoformat()
        return card

    def _contacts(self, db, user):
        today = self._today()
        result = []
        for x in db.execute("SELECT id,name,alias,phone,relation,birthday FROM bank_contacts WHERE user_id=? ORDER BY rowid", (user,)):
            c = dict(x)
            if c["birthday"]:
                upcoming = next_birthday(c["birthday"], today)
                c["next_birthday"] = upcoming.isoformat()
                c["days_until_birthday"] = (upcoming - today).days
            result.append(c)
        return result

    def summary(self, user_id):
        self.run_due(user_id)
        with self._tx() as db:
            self._user(db, user_id)
            held = self._held(db, user_id)
            accounts = []
            for x in db.execute("SELECT id,name,balance_cents,currency FROM bank_accounts WHERE user_id=? ORDER BY id", (user_id,)):
                a = dict(x)
                a["held_cents"] = held if not accounts else 0
                a["available_cents"] = a["balance_cents"] - a["held_cents"]
                accounts.append(a)
            result = {
                "accounts": accounts,
                "cards": [self._card_dict(x) for x in db.execute("SELECT * FROM bank_cards WHERE user_id=? ORDER BY rowid", (user_id,))],
                "contacts": self._contacts(db, user_id),
                "daily_transfer_cents": self._daily(db, user_id), "daily_limit_cents": YELLOW_LIMIT, "subscriptions": [],
                "goals": [dict(x) for x in db.execute("SELECT id,name,amount_cents,created_at FROM bank_goals WHERE user_id=?", (user_id,))],
                "holds": self._holds(db, user_id), "schedules": self._schedules(db, user_id),
                "holdings": (holdings := self._holdings(db, user_id)),
                "wealth_total_cents": sum(h["value_cents"] for h in holdings),
                "risk_profile": self._profile(db, user_id), "demo": True,
                "scheduled_operations": self._scheduled_operations(db, user_id),
            }
            self._event(db, user_id, "account.summary", {"account_count": len(result["accounts"])})
            return result

    def _period(self, period):
        now = self._now().astimezone(CN)
        if period == "all":
            return datetime(2000, 1, 1, tzinfo=CN), datetime(2200, 1, 1, tzinfo=CN)
        if period == "month": year, month = now.year, now.month
        elif period == "last_month":
            previous = now.replace(day=1) - timedelta(days=1)
            year, month = previous.year, previous.month
        elif period == "year": return datetime(now.year, 1, 1, tzinfo=CN), datetime(now.year + 1, 1, 1, tzinfo=CN)
        elif isinstance(period, str) and re.fullmatch(r"20\d{2}-\d{2}", period):
            year, month = map(int, period.split("-"))
        elif isinstance(period, str) and re.fullmatch(r"20\d{2}", period):
            return datetime(int(period), 1, 1, tzinfo=CN), datetime(int(period) + 1, 1, 1, tzinfo=CN)
        else: raise DomainError("invalid_period", "时间范围应为 month、last_month、year、all、YYYY-MM 或 YYYY")
        try:
            start = datetime(year, month, 1, tzinfo=CN)
            end = datetime(year + 1, 1, 1, tzinfo=CN) if month == 12 else datetime(year, month + 1, 1, tzinfo=CN)
            return start, end
        except ValueError:
            raise DomainError("invalid_period", "月份无效") from None

    def _rows(self, db, user, start, end):
        return [dict(x) for x in db.execute("SELECT id,merchant,amount_cents,category,occurred_at,description FROM bank_transactions WHERE user_id=? AND occurred_at>=? AND occurred_at<? ORDER BY occurred_at DESC,id",
                                            (user, start.astimezone(timezone.utc).isoformat(), end.astimezone(timezone.utc).isoformat()))]

    def _transactions(self, db, user, period):
        self._user(db, user)
        start, end = self._period(period)
        return self._rows(db, user, start, end)

    def transactions(self, user_id, period="month"):
        with self._tx() as db:
            rows = self._transactions(db, user_id, period)
            self._event(db, user_id, "transactions.query", {"period": period, "count": len(rows)})
            return {"transactions": rows, "period": period, "total_expense_cents": sum(-x["amount_cents"] for x in rows if x["amount_cents"] < 0)}

    @staticmethod
    def _categories(rows):
        grouped = {}
        for row in rows:
            if row["amount_cents"] >= 0:
                continue
            cat = grouped.setdefault(row["category"], {"category": row["category"], "total_cents": 0, "count": 0})
            cat["total_cents"] -= row["amount_cents"]
            cat["count"] += 1
        return sorted(grouped.values(), key=lambda x: -x["total_cents"])

    def analysis(self, user_id, period="month"):
        with self._tx() as db:
            rows = self._transactions(db, user_id, period)
            start, end = self._period(period)
            baseline = self._rows(db, user_id, start - timedelta(days=183), start)
            # Same-length previous window for change-over-period comparisons.
            if period == "year":
                prev_start, prev_end = start.replace(year=start.year - 1), start
            else:
                prev_end = start
                prev_start = (start - timedelta(days=1)).replace(day=1)
            previous = self._rows(db, user_id, prev_start, prev_end)
            categories = self._categories(rows)
            prev_map = {c["category"]: c["total_cents"] for c in self._categories(previous)}
            for c in categories:
                c["previous_cents"] = prev_map.get(c["category"], 0)
            flags = insights.anomalies(rows, baseline)
            anomalies = [{**a, "reason": "；".join(r["reason"] for r in a["rules"]) + "。请核对，不构成欺诈判断"} for a in flags]
            income = sum(x["amount_cents"] for x in rows if x["amount_cents"] > 0)
            expense = sum(c["total_cents"] for c in categories)
            transfers = sum(c["total_cents"] for c in categories if c["category"] == "转账")
            trend_start = add_months(start.date().replace(day=1), -5) if period != "year" else start.date()
            trend_rows = self._rows(db, user_id, datetime(trend_start.year, trend_start.month, 1, tzinfo=CN), end)
            self._event(db, user_id, "transactions.analysis", {"period": period, "source_count": len(rows), "anomaly_count": len(anomalies)})
            return {"period": period, "period_start": start.date().isoformat(), "period_end": (end - timedelta(days=1)).date().isoformat(),
                    "categories": categories, "total_expense_cents": expense,
                    "income_cents": income, "consumption_cents": expense - transfers,
                    "savings_rate_bp": round(10_000 * (income - expense) / income) if income else None,
                    "previous_expense_cents": sum(prev_map.values()), "anomalies": anomalies,
                    "transaction_count": len(rows), "source_transaction_ids": [x["id"] for x in rows],
                    "monthly": insights.monthly_series(trend_rows), "daily": insights.daily_series(rows),
                    "top_merchants": insights.top_merchants(rows),
                    "method": "category-totals + robust-z(MAD, 3.5) + rule flags v2"}

    def detect_subscriptions(self, user_id):
        with self._tx() as db:
            self._user(db, user_id)
            today = self._today()
            rows = self._rows(db, user_id, datetime.combine(today - timedelta(days=200), datetime.min.time(), CN),
                              datetime.combine(today + timedelta(days=1), datetime.min.time(), CN))
            found = insights.recurring(rows, today)
            mandates = {r["name"]: dict(r) for r in db.execute("SELECT id,name,amount_cents,status,remind_days FROM bank_subscriptions WHERE user_id=?", (user_id,))}
            for f in found:
                m = mandates.get(f["merchant"])
                f["mandate"] = {"id": m["id"], "status": m["status"], "remind_days": m["remind_days"]} if m else None
            self._event(db, user_id, "subscriptions.detected", {"count": len(found), "window_days": 200})
            return {"recurring": found, "monthly_total_cents": sum(f["last_amount_cents"] for f in found if not f["mandate"] or f["mandate"]["status"] == "active"),
                    "window_days": 200, "method": "同商户 ≥3 次、间隔 26–35 天、此前金额波动 ≤15%"}

    def life_events(self, user_id):
        with self._tx() as db:
            contacts = [c for c in self._contacts(db, user_id) if c.get("next_birthday")]
            events = [{"type": "birthday", "contact_id": c["id"], "name": c["name"], "relation": c["relation"],
                       "date": c["next_birthday"], "days_until": c["days_until_birthday"]}
                      for c in contacts if c["days_until_birthday"] <= 90]
            self._event(db, user_id, "life.events", {"count": len(events)})
            return {"events": sorted(events, key=lambda e: e["days_until"]), "window_days": 90,
                    "items": MERCHANT_ITEMS, "source": "通讯录中你登记的生日"}

    def _holds(self, db, user):
        return [dict(x) for x in db.execute("SELECT id,name,amount_cents,used_cents,status,release_date,created_at FROM bank_holds WHERE user_id=? ORDER BY created_at DESC", (user,))]

    def _schedules(self, db, user):
        result = []
        for r in db.execute("SELECT * FROM bank_schedules WHERE user_id=? ORDER BY execute_date,created_at", (user,)):
            s = {k: r[k] for k in ["id", "kind", "execute_date", "repeat", "status", "created_at", "operation_id"]}
            s["params"] = json.loads(r["params"])
            s["last_result"] = json.loads(r["last_result"]) if r["last_result"] else None
            if s["kind"] == "order":
                s["item"] = ITEM_BY_ID.get(s["params"]["item_id"])
            result.append(s)
        return result

    def schedules(self, user_id):
        self.run_due(user_id)
        with self._tx() as db:
            self._user(db, user_id)
            subs = [dict(r) for r in db.execute("SELECT id,name,amount_cents,status,remind_days,billing_day FROM bank_subscriptions WHERE user_id=? AND status='active'", (user_id,))]
            today = self._today()
            for s in subs:
                day = today.replace(day=min(s["billing_day"], calendar.monthrange(today.year, today.month)[1]))
                s["next_charge"] = (day if day >= today else add_months(day, 1)).isoformat()
            splits = []
            for sp in db.execute("SELECT * FROM bank_splits WHERE user_id=? ORDER BY created_at DESC", (user_id,)):
                shares = [dict(x) for x in db.execute("SELECT contact_id,name,amount_cents,status,paid_at FROM bank_split_shares WHERE split_id=?", (sp["id"],))]
                splits.append({**dict(sp), "shares": shares})
            # Cash-flow forecast inputs: today's spendable balance plus monthly
            # patterns learned from history (salary, rent, regular transfers, subscriptions).
            history = self._rows(db, user_id, datetime.combine(today - timedelta(days=200), datetime.min.time(), CN),
                                 datetime.combine(today + timedelta(days=1), datetime.min.time(), CN))
            cancelled = {r["name"] for r in db.execute("SELECT name FROM bank_subscriptions WHERE user_id=? AND status='cancelled'", (user_id,))}
            flows = [{k: f[k] for k in ("merchant", "category", "inflow", "last_amount_cents", "cadence_days", "next_expected", "confidence")}
                     for f in insights.recurring(history, today, cash_flow=True) if f["merchant"] not in cancelled]
            source = self._source(db, user_id)
            self._event(db, user_id, "schedules.list", {})
            return {"available_cents": source["balance_cents"] - self._held(db, user_id), "recurring_flows": flows,
                    "schedules": self._schedules(db, user_id), "holds": self._holds(db, user_id),
                    "subscriptions": subs, "splits": splits, "contacts": self._contacts(db, user_id), "today": today.isoformat()}

    def _profile(self, db, user):
        row = db.execute("SELECT * FROM bank_risk_profiles WHERE user_id=?", (user,)).fetchone()
        if not row:
            return None
        expired = datetime.fromisoformat(row["expires_at"]) <= self._now()
        return {"score": row["score"], "level": row["level"], "name": INVESTOR_NAMES[row["level"]], "answers": json.loads(row["answers"]),
                "notes": json.loads(row["notes"]), "assessed_at": row["assessed_at"], "expires_at": row["expires_at"],
                "expired": expired, "max_product_risk": row["level"]}

    def wealth_profile(self, user_id):
        with self._tx() as db:
            self._user(db, user_id)
            profile = self._profile(db, user_id)
            self._event(db, user_id, "wealth.profile", {"assessed": bool(profile)})
            return {"profile": profile, "questionnaire": [{"id": q["id"], "title": q["title"], "options": [o for o, _ in q["options"]]} for q in QUESTIONNAIRE]}

    def assess(self, user_id, answers):
        """The customer answers directly; the model never fills this in."""
        try:
            result = score_answers(answers)
        except ValueError as exc:
            raise DomainError("invalid_answers", str(exc)) from None
        with self._tx() as db:
            self._guard(db, user_id)
            now = self._now()
            db.execute("INSERT OR REPLACE INTO bank_risk_profiles VALUES (?,?,?,?,?,?,?)",
                       (user_id, result["score"], result["level"], canonical(answers), canonical(result["notes"]),
                        now.isoformat(), (now + timedelta(days=365)).isoformat()))
            self._event(db, user_id, "wealth.assessed", {"score": result["score"], "level": result["level"]})
            return self._profile(db, user_id)

    def _holdings(self, db, user):
        now = self._now()
        result = []
        for h in db.execute("SELECT * FROM bank_holdings WHERE user_id=? AND status='active' ORDER BY subscribed_at", (user,)):
            p = PRODUCT_BY_ID[h["product_id"]]
            days = max(0, (now - datetime.fromisoformat(h["subscribed_at"])).days)
            income = round(h["principal_cents"] * p["one_year_bp"] / 10_000 * days / 365)
            unlock = max(0, p["holding_days"] - days)
            result.append({"id": h["id"], "product_id": p["id"], "product_name": p["name"], "risk": p["risk"], "type": p["type"],
                           "principal_cents": h["principal_cents"], "income_cents": income, "value_cents": h["principal_cents"] + income,
                           "days_held": days, "redeemable": unlock == 0, "days_to_redeemable": unlock,
                           "yesterday_income_cents": round(h["principal_cents"] * p["one_year_bp"] / 10_000 / 365),
                           "subscribed_at": h["subscribed_at"], "liquidity": p["liquidity"]})
        return result

    def wealth_holdings(self, user_id):
        with self._tx() as db:
            self._user(db, user_id)
            holdings = self._holdings(db, user_id)
            self._event(db, user_id, "wealth.holdings", {"count": len(holdings)})
            return {"holdings": holdings, "total_value_cents": sum(h["value_cents"] for h in holdings),
                    "total_income_cents": sum(h["income_cents"] for h in holdings),
                    "valuation": "按产品近一年年化收益逐日估算，仅供参考，以产品实际净值为准"}

    def wealth_products(self, user_id):
        with self._tx() as db:
            self._user(db, user_id)
            profile = self._profile(db, user_id)
            level = profile["level"] if profile and not profile["expired"] else 0
            products = []
            for p in PRODUCTS:
                products.append({**p, "risk_name": RISK_NAMES[p["risk"]], "suitable": p["risk"] <= level,
                                 "nav": nav_series(p["id"])})
            self._event(db, user_id, "wealth.products", {"count": len(products), "investor_level": level})
            return {"products": products, "profile": profile,
                    "disclaimer": "理财非存款，产品有风险，投资须谨慎。过往业绩不代表未来表现。"}

    # ------------------------------------------------------------------ operations
    def _params(self, tool, params):
        try:
            check_params(tool, params)
        except ParamError as exc:
            raise DomainError("unknown_tool" if "未被允许" in str(exc) else "invalid_parameters", str(exc)) from None
        return json.loads(canonical(params))

    def _card(self, db, user, card_id):
        row = db.execute("SELECT * FROM bank_cards WHERE user_id=? AND id=?", (user, card_id)).fetchone()
        if not row:
            raise DomainError("not_found", "卡片不存在", 404)
        return row

    def _future_date(self, value, label="执行日期"):
        day = date.fromisoformat(value)
        today = self._today()
        if day < today:
            raise DomainError("invalid_date", f"{label}不能早于今天")
        if day > today + timedelta(days=366):
            raise DomainError("invalid_date", f"{label}最远可设在一年以内")
        return day

    def _hold_row(self, db, user, hold_id):
        row = db.execute("SELECT * FROM bank_holds WHERE id=? AND user_id=?", (hold_id, user)).fetchone()
        if not row:
            raise DomainError("not_found", "锁定资金记录不存在", 404)
        return row

    def _check_resources(self, db, user, tool, params):
        """Business-rule checks that hold at creation and again at execution."""
        if tool in ("transfer", "transfer.schedule"):
            if not db.execute("SELECT 1 FROM bank_contacts WHERE user_id=? AND id=?", (user, params["contact_id"])).fetchone():
                raise DomainError("not_found", "收款联系人不存在", 404)
            if tool == "transfer.schedule":
                self._future_date(params["execute_date"])
        elif tool in ("card.report_lost", "card.unlock", "card.freeze", "card.unfreeze", "card.limit", "card.controls", "card.pin_reset"):
            card = self._card(db, user, params["card_id"])
            status = card["status"]
            if tool == "card.unlock" and status != "lost":
                raise DomainError("invalid_card_state", "这张卡没有挂失，不需要解挂")
            if tool == "card.report_lost" and status == "lost":
                raise DomainError("invalid_card_state", "这张卡已经挂失")
            if tool == "card.freeze" and status != "active":
                raise DomainError("invalid_card_state", "只有正常状态的卡可以临时冻结")
            if tool == "card.unfreeze" and status != "frozen":
                raise DomainError("invalid_card_state", "这张卡没有被冻结")
            if tool == "card.limit":
                if card["kind"] != "credit":
                    raise DomainError("invalid_card_state", "只有信用卡可以调整额度")
                if params["limit_cents"] == card["limit_cents"]:
                    raise DomainError("no_change", "新额度和当前额度相同")
                if params["limit_cents"] > (card["max_limit_cents"] or 0):
                    raise DomainError("limit_exceeded", f"超过核定的最高额度 {card['max_limit_cents'] // 100:,} 元，需要重新审批")
                if params["limit_cents"] < max(100_000, card["used_cents"]):
                    raise DomainError("limit_too_low", "新额度不能低于 1000 元，也不能低于已用额度")
            if tool == "card.controls":
                current = {**DEFAULT_CONTROLS, **json.loads(card["controls"] or "{}")}
                if current[params["control"]] == params["enabled"]:
                    raise DomainError("no_change", f"{CONTROL_NAMES[params['control']]}已经是{'开启' if params['enabled'] else '关闭'}状态")
            if tool in ("card.limit", "card.controls", "card.pin_reset") and status in ("lost", "processing"):
                raise DomainError("invalid_card_state", "挂失或制卡中的卡片不能修改设置")
        elif tool in ("subscriptions.cancel", "subscriptions.remind"):
            row = db.execute("SELECT status FROM bank_subscriptions WHERE user_id=? AND id=?", (user, params["subscription_id"])).fetchone()
            if not row:
                raise DomainError("not_found", "订阅不存在", 404)
            if tool == "subscriptions.remind" and row["status"] != "active":
                raise DomainError("invalid_state", "订阅已取消，无需提醒")
        elif tool == "schedule.cancel":
            row = db.execute("SELECT status FROM bank_schedules WHERE user_id=? AND id=?", (user, params["schedule_id"])).fetchone()
            if not row:
                raise DomainError("not_found", "预约不存在", 404)
            if row["status"] not in ("scheduled", "awaiting_verification", "awaiting_confirmation"):
                raise DomainError("invalid_state", "预约已执行或已取消")
        elif tool == "split.create":
            ids = params["contact_ids"]
            found = {r[0] for r in db.execute(f"SELECT id FROM bank_contacts WHERE user_id=? AND id IN ({','.join('?' * len(ids))})", (user, *ids))}
            if found != set(ids):
                raise DomainError("not_found", "有参与人不在你的联系人中", 404)
            if params["total_cents"] < len(ids) + (1 if params.get("include_self", True) else 0):
                raise DomainError("invalid_amount", "总金额太小，不够每人分到 1 分")
        elif tool == "funds.hold":
            day = self._future_date(params["release_date"], "释放日期")
            if day == self._today():
                raise DomainError("invalid_date", "释放日期至少要在明天")
            available = self._source(db, user)["balance_cents"] - self._held(db, user)
            if params["amount_cents"] > available:
                raise DomainError("insufficient_balance", "可用余额不足，无法锁定这笔资金")
        elif tool == "funds.release":
            if self._hold_row(db, user, params["hold_id"])["status"] != "active":
                raise DomainError("invalid_state", "这笔资金已经释放或用完")
        elif tool == "merchant.order":
            item = ITEM_BY_ID.get(params["item_id"])
            if not item:
                raise DomainError("not_found", "商品不存在", 404)
            if not db.execute("SELECT 1 FROM bank_contacts WHERE user_id=? AND id=?", (user, params["contact_id"])).fetchone():
                raise DomainError("not_found", "收货联系人不存在", 404)
            self._future_date(params["execute_date"], "下单日期")
            if params.get("hold_id"):
                hold = self._hold_row(db, user, params["hold_id"])
                if hold["status"] != "active" or hold["amount_cents"] - hold["used_cents"] < item["price_cents"]:
                    raise DomainError("insufficient_hold", "锁定资金不足以支付这件商品")
        elif tool == "wealth.subscribe":
            product = PRODUCT_BY_ID.get(params["product_id"])
            if not product:
                raise DomainError("not_found", "理财产品不存在", 404)
            profile = self._profile(db, user)
            if not profile:
                raise DomainError("assessment_required", "购买理财前需要先完成风险测评")
            if profile["expired"]:
                raise DomainError("assessment_expired", "风险测评已过期，请重新测评后再购买")
            if product["risk"] > profile["level"]:
                raise DomainError("suitability_mismatch", f"{product['name']}为 R{product['risk']} {RISK_NAMES[product['risk']]}，"
                                  f"高于你的测评结果 C{profile['level']} {profile['name']}，按适当性规定不能购买")
            if params["amount_cents"] < product["min_cents"]:
                raise DomainError("below_minimum", f"起购金额为 {product['min_cents'] / 100:,.2f} 元")
            available = self._source(db, user)["balance_cents"] - self._held(db, user)
            if params["amount_cents"] > available:
                raise DomainError("insufficient_balance", "可用余额不足")
        elif tool == "wealth.redeem":
            holding = next((h for h in self._holdings(db, user) if h["id"] == params["holding_id"]), None)
            if not holding:
                raise DomainError("not_found", "持仓不存在", 404)
            if not holding["redeemable"]:
                raise DomainError("holding_locked", f"还没到最短持有期，{holding['days_to_redeemable']} 天后可以赎回")
            if params.get("amount_cents", holding["principal_cents"]) > holding["principal_cents"]:
                raise DomainError("invalid_amount", "赎回金额超过持有本金")

    def _risk(self, db, user, tool, params):
        """Server-side tiering. Red = multi-factor, yellow = explicit confirmation."""
        if tool in ("card.report_lost", "card.unlock", "card.unfreeze", "card.pin_reset", "wealth.subscribe"):
            return "red"
        if tool == "transfer":
            return "red" if self._daily(db, user) + params["amount_cents"] > YELLOW_LIMIT else "yellow"
        if tool == "transfer.schedule":
            same_day = sum(json.loads(r["params"])["amount_cents"] for r in db.execute(
                "SELECT params FROM bank_schedules WHERE user_id=? AND kind='transfer' AND status='scheduled' AND execute_date=?",
                (user, params["execute_date"])))
            return "red" if same_day + params["amount_cents"] > YELLOW_LIMIT else "yellow"
        if tool == "card.limit":
            card = self._card(db, user, params["card_id"])
            return "red" if params["limit_cents"] > (card["limit_cents"] or 0) else "yellow"
        if tool == "card.controls":
            # Tightening protects the customer; loosening raises exposure.
            return "red" if params["enabled"] else "yellow"
        if tool == "merchant.order":
            return "red" if ITEM_BY_ID[params["item_id"]]["price_cents"] > YELLOW_LIMIT else "yellow"
        return "yellow"

    def create_operation(self, user_id, tool, params, idempotency_key):
        params = self._params(tool, params)
        if not isinstance(idempotency_key, str) or not 1 <= len(idempotency_key) <= 160:
            raise DomainError("invalid_idempotency_key", "幂等键必须为 1–160 字符")
        fingerprint = hashlib.sha256(canonical({"tool": tool, "params": params}).encode()).hexdigest()
        pending_error = None
        with self._tx() as db:
            self._guard(db, user_id)
            existing = db.execute("SELECT * FROM bank_operations WHERE user_id=? AND idem_key=?", (user_id, idempotency_key)).fetchone()
            if existing:
                if existing["fingerprint"] != fingerprint: raise DomainError("idempotency_conflict", "同一幂等键不能用于不同操作", 409)
                return self._operation(existing)
            recent = db.execute("SELECT COUNT(*) FROM bank_operations WHERE user_id=? AND created_at>?",
                                (user_id, (self._now() - timedelta(seconds=60)).isoformat())).fetchone()[0]
            if recent >= VELOCITY_LIMIT:
                self._lock(db, user_id, 5, "一分钟内发起的操作过多", {"operations_last_minute": recent})
                pending_error = DomainError("security_locked", "一分钟内发起的操作过多，账户操作已临时锁定 5 分钟", 423)
            else:
                self._check_resources(db, user_id, tool, params)
                risk = self._risk(db, user_id, tool, params)
                opid = _id("op")
                expiry = (self._now() + timedelta(minutes=10)).isoformat()
                db.execute("INSERT INTO bank_operations(id,user_id,tool,params,idem_key,fingerprint,risk,status,message,created_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                           (opid, user_id, tool, canonical(params), idempotency_key, fingerprint, risk, "awaiting_confirmation",
                            "请核对操作详情后确认" if risk == "yellow" else "此操作需要独立强验证", self._stamp(), expiry))
                self._event(db, user_id, "operation.created", {"operation_id": opid, "tool": tool, "risk": risk, "parameter_fingerprint": fingerprint})
                result = self._operation(self._load(db, user_id, opid))
        if pending_error:
            raise pending_error
        return result

    def _load(self, db, user, opid):
        self._user(db, user)
        row = db.execute("SELECT * FROM bank_operations WHERE id=? AND user_id=?", (opid, user)).fetchone()
        if not row: raise DomainError("not_found", "操作不存在", 404)
        return row

    def _operation(self, row):
        result = {k: row[k] for k in ["id", "tool", "risk", "status", "message", "created_at", "expires_at"]}
        result["params"] = json.loads(row["params"])
        result["receipt"] = json.loads(row["receipt"]) if row["receipt"] and row["status"] == "succeeded" else None
        if row["challenge_id"]: result["challenge_id"] = row["challenge_id"]
        return result

    def get_operation(self, user_id, operation_id):
        with self._tx() as db: return self._operation(self._load(db, user_id, operation_id))

    def _challenge(self, db, user, row):
        code = f"{secrets.randbelow(1_000_000):06d}"
        challenge = _id("challenge")
        expires = min(self._now() + timedelta(minutes=3), datetime.fromisoformat(row["expires_at"]))
        digest = hashlib.sha256((challenge + ":" + row["fingerprint"] + ":" + code).encode()).hexdigest()
        db.execute("UPDATE bank_operations SET risk='red',status='awaiting_verification',message=?,challenge_id=?,otp_hash=?,otp_demo=?,otp_expires=? WHERE id=?", ("请在独立认证面板输入模拟验证码", challenge, digest, code, expires.isoformat(), row["id"]))
        self._event(db, user, "authorization.challenge", {"operation_id": row["id"], "challenge_id": challenge, "expires_at": expires.isoformat()})

    @staticmethod
    def _weak_pin(pin):
        digits = "0123456789"
        return len(set(pin)) == 1 or pin in digits or pin in digits[::-1] or pin in "01234567890" or pin[::-1] in digits

    def authorize(self, user_id, operation_id, approve, otp=None, new_pin=None):
        if type(approve) is not bool: raise DomainError("invalid_approval", "确认必须为布尔值")
        if otp is not None and (not isinstance(otp, str) or len(otp) > 20): raise DomainError("invalid_otp", "验证码格式无效")
        pending_error = None
        with self._tx() as db:
            security = self._guard(db, user_id)
            row = self._load(db, user_id, operation_id)
            if row["status"] in ("succeeded", "unknown"):
                return self._operation(row)
            if row["status"] in ("cancelled", "failed"): raise DomainError("operation_terminal", "操作已结束", 409)
            if not approve:
                self._cancel(db, user_id, row)
            elif datetime.fromisoformat(row["expires_at"]) <= self._now():
                db.execute("UPDATE bank_operations SET status='failed',message='操作授权已过期，请重新发起',otp_demo=NULL,otp_hash=NULL WHERE id=?", (operation_id,))
                self._event(db, user_id, "authorization.expired", {"operation_id": operation_id})
                pending_error = DomainError("authorization_expired", "操作授权已过期，请重新发起", 409)
            else:
                params = json.loads(row["params"])
                try:
                    self._check_resources(db, user_id, row["tool"], params)
                except DomainError as exc:
                    db.execute("UPDATE bank_operations SET status='failed',message=?,otp_demo=NULL,otp_hash=NULL WHERE id=?", (exc.message + "，未执行", operation_id))
                    self._event(db, user_id, "operation.failed", {"operation_id": operation_id, "reason": exc.code})
                    self._sync_scheduled_operation(db, user_id, operation_id)
                    return self._operation(self._load(db, user_id, operation_id))
                required = self._risk(db, user_id, row["tool"], params)
                if required == "red" and row["risk"] == "yellow":
                    self._event(db, user_id, "authorization.risk_upgraded", {"operation_id": operation_id, "reason": "daily_cumulative"})
                    self._challenge(db, user_id, row)
                elif row["risk"] == "red":
                    if not row["challenge_id"] or not row["otp_expires"] or datetime.fromisoformat(row["otp_expires"]) <= self._now():
                        self._challenge(db, user_id, row)
                    elif otp is None:
                        pass
                    elif row["tool"] == "card.pin_reset" and (type(new_pin) is not str or not re.fullmatch(r"\d{6}", new_pin) or self._weak_pin(new_pin)):
                        pending_error = DomainError("weak_pin", "新密码须为 6 位数字，不能是连续或相同的数字")
                    else:
                        digest = hashlib.sha256((row["challenge_id"] + ":" + row["fingerprint"] + ":" + otp).encode()).hexdigest()
                        if not secrets.compare_digest(digest, row["otp_hash"] or ""):
                            failures = security["failures"] + 1
                            locked = (self._now() + timedelta(minutes=5)).isoformat() if failures >= 3 else None
                            db.execute("UPDATE bank_security SET failures=?,locked_until=?,lock_reason=? WHERE user_id=?", (failures, locked, "连续验证失败" if locked else security["lock_reason"], user_id))
                            self._event(db, user_id, "authorization.denied", {"operation_id": operation_id, "reason": "invalid_verification", "failure_count": failures, "locked": bool(locked)})
                            pending_error = DomainError("security_locked" if locked else "invalid_otp", "验证失败，操作未执行" + ("；账户已临时锁定" if locked else ""), 423 if locked else 400)
                        else:
                            db.execute("UPDATE bank_security SET failures=0,locked_until=NULL WHERE user_id=?", (user_id,))
                            self._event(db, user_id, "authorization.verified", {"operation_id": operation_id, "challenge_id": row["challenge_id"]})
                            # Consume the proof even if the downstream channel
                            # fails. A later retry needs a fresh challenge.
                            db.execute("UPDATE bank_operations SET otp_hash=NULL,otp_demo=NULL,otp_expires=NULL,challenge_id=NULL WHERE id=?", (operation_id,))
                            self._execute(db, user_id, row, params, new_pin=new_pin)
                else:
                    self._event(db, user_id, "authorization.confirmed", {"operation_id": operation_id, "parameter_fingerprint": row["fingerprint"]})
                    self._execute(db, user_id, row, params)
            self._sync_scheduled_operation(db, user_id, operation_id)
            result = self._operation(self._load(db, user_id, operation_id))
        if pending_error: raise pending_error
        return result

    def _move(self, db, ref, source, target, amount):
        db.execute("UPDATE bank_accounts SET balance_cents=balance_cents-? WHERE id=?", (amount, source))
        db.execute("UPDATE bank_accounts SET balance_cents=balance_cents+? WHERE id=?", (amount, target))
        for account, value in [(source, -amount), (target, amount)]:
            db.execute("INSERT INTO bank_ledger(account_id,operation_id,amount_cents,occurred_at) VALUES (?,?,?,?)", (account, ref, value, self._stamp()))

    def _fail(self, db, user, row, reason, message):
        db.execute("UPDATE bank_operations SET status='failed',message=?,otp_demo=NULL,otp_hash=NULL WHERE id=?", (message, row["id"]))
        self._event(db, user, "operation.failed", {"operation_id": row["id"], "reason": reason})

    def _execute(self, db, user, row, params, new_pin=None):
        security = db.execute("SELECT * FROM bank_security WHERE user_id=?", (user,)).fetchone()
        if security["channel_open_until"] and datetime.fromisoformat(security["channel_open_until"]) > self._now():
            db.execute("UPDATE bank_operations SET status='awaiting_confirmation',message='业务通道熔断中，请稍后重试或人工接管' WHERE id=?", (row["id"],))
            self._event(db, user, "channel.blocked", {"operation_id": row["id"]})
            return
        if security["fault"] == "channel_failure":
            count = security["channel_failures"] + 1
            opens = (self._now() + timedelta(seconds=60)).isoformat() if count >= 3 else None
            db.execute("UPDATE bank_security SET channel_failures=?,channel_open_until=? WHERE user_id=?", (count, opens, user))
            db.execute("UPDATE bank_operations SET status='awaiting_confirmation',message='业务通道暂不可用，未执行' WHERE id=?", (row["id"],))
            self._event(db, user, "channel.failure", {"operation_id": row["id"], "failure_count": count, "circuit_open": bool(opens)})
            return
        tool = row["tool"]
        receipt = {"id": _id("receipt"), "status": "succeeded", "tool": tool, "occurred_at": self._stamp(), "operation_id": row["id"], "demo": True}
        source = self._source(db, user)
        available = source["balance_cents"] - self._held(db, user)
        if tool == "transfer":
            contact = db.execute("SELECT * FROM bank_contacts WHERE user_id=? AND id=?", (user, params["contact_id"])).fetchone()
            amount = params["amount_cents"]
            if available < amount:
                return self._fail(db, user, row, "insufficient_balance", "可用余额不足，未执行" + ("（部分资金已锁定）" if self._held(db, user) else ""))
            self._move(db, row["id"], source["id"], contact["account_id"], amount)
            db.execute("INSERT INTO bank_transactions VALUES (?,?,?,?,?,?,?,?,?)", (_id("tx"), user, source["id"], contact["name"], -amount, "转账", self._stamp(), params.get("note", ""), row["id"]))
            receipt.update(amount_cents=amount, currency="CNY", contact_id=contact["id"], recipient=contact["name"], balance_cents=source["balance_cents"] - amount)
        elif tool == "transfer.schedule":
            contact = db.execute("SELECT name FROM bank_contacts WHERE user_id=? AND id=?", (user, params["contact_id"])).fetchone()
            sid = _id("sched")
            db.execute("INSERT INTO bank_schedules VALUES (?,?,?,?,?,?,?,?,?,?)", (sid, user, "transfer", canonical(params), params["execute_date"],
                       params.get("repeat", "none"), "scheduled", self._stamp(), row["id"], None))
            receipt.update(schedule_id=sid, recipient=contact["name"], amount_cents=params["amount_cents"], execute_date=params["execute_date"],
                           repeat=params.get("repeat", "none"), funds_reserved=False)
        elif tool == "schedule.cancel":
            for pending in db.execute("SELECT o.* FROM bank_operations o JOIN bank_schedule_runs r ON r.operation_id=o.id WHERE r.schedule_id=? AND r.user_id=? AND o.status IN ('awaiting_confirmation','awaiting_verification')", (params["schedule_id"], user)).fetchall():
                self._cancel(db, user, pending)
            db.execute("UPDATE bank_schedules SET status='cancelled' WHERE id=? AND user_id=?", (params["schedule_id"], user))
            receipt.update(schedule_id=params["schedule_id"], schedule_status="cancelled")
        elif tool == "split.create":
            ids = params["contact_ids"]
            include_self = params.get("include_self", True)
            if include_self:
                # Friends all see the same round share; the organiser absorbs the leftover cents.
                base = params["total_cents"] // (len(ids) + 1)
                others, own = [base] * len(ids), params["total_cents"] - base * len(ids)
            else:
                others, own = insights.split_shares(params["total_cents"], len(ids)), 0
            spid = _id("split")
            db.execute("INSERT INTO bank_splits VALUES (?,?,?,?,?,?)", (spid, user, params["total_cents"], params.get("note", "") or "AA 收款", own, self._stamp()))
            names = {r["id"]: r["name"] for r in db.execute("SELECT id,name FROM bank_contacts WHERE user_id=?", (user,))}
            listing = []
            for cid, amount in zip(ids, others):
                db.execute("INSERT INTO bank_split_shares VALUES (?,?,?,?,?,NULL)", (spid, cid, names[cid], amount, "requested"))
                listing.append({"contact_id": cid, "name": names[cid], "amount_cents": amount, "status": "requested"})
            receipt.update(split_id=spid, total_cents=params["total_cents"], self_share_cents=own, shares=listing, note=params.get("note", ""))
        elif tool in ("card.report_lost", "card.unlock", "card.freeze", "card.unfreeze"):
            status = {"card.report_lost": "lost", "card.unlock": "active", "card.freeze": "frozen", "card.unfreeze": "active"}[tool]
            db.execute("UPDATE bank_cards SET status=? WHERE id=? AND user_id=?", (status, params["card_id"], user))
            card = self._card(db, user, params["card_id"])
            receipt.update(card_id=params["card_id"], last4=card["last4"], card_status=status)
        elif tool == "card.limit":
            card = self._card(db, user, params["card_id"])
            db.execute("UPDATE bank_cards SET limit_cents=? WHERE id=?", (params["limit_cents"], card["id"]))
            receipt.update(card_id=card["id"], last4=card["last4"], previous_limit_cents=card["limit_cents"], limit_cents=params["limit_cents"])
        elif tool == "card.controls":
            card = self._card(db, user, params["card_id"])
            controls = {**DEFAULT_CONTROLS, **json.loads(card["controls"] or "{}"), params["control"]: params["enabled"]}
            db.execute("UPDATE bank_cards SET controls=? WHERE id=?", (canonical(controls), card["id"]))
            receipt.update(card_id=card["id"], last4=card["last4"], control=params["control"], enabled=params["enabled"], controls=controls)
        elif tool == "card.pin_reset":
            salt = secrets.token_hex(8)
            db.execute("UPDATE bank_cards SET pin_hash=?,pin_salt=? WHERE id=? AND user_id=?",
                       (hashlib.sha256((salt + ":" + new_pin).encode()).hexdigest(), salt, params["card_id"], user))
            card = self._card(db, user, params["card_id"])
            receipt.update(card_id=card["id"], last4=card["last4"], pin_updated=True)
        elif tool in ("card.virtual", "card.apply"):
            cardid = _id("card")
            last4 = f"{secrets.randbelow(10000):04d}"
            credit = params.get("card_type") == "credit"
            kind = "virtual" if tool == "card.virtual" else ("credit" if credit else "debit")
            status = "active" if tool == "card.virtual" else "processing"
            name = {"virtual": "拾迹虚拟卡", "credit": "拾迹信用卡", "debit": "拾迹借记卡"}[kind]
            db.execute("INSERT INTO bank_cards(id,user_id,last4,status,kind,name,limit_cents,max_limit_cents,used_cents,controls,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                       (cardid, user, last4, status, kind, name, 1_000_000 if credit else None, 2_000_000 if credit else None, 0,
                        canonical({**DEFAULT_CONTROLS, "atm": kind != "virtual"}), self._stamp()))
            receipt.update(card_id=cardid, last4=last4, card_status=status, kind=kind, name=name)
            if tool == "card.apply":
                receipt["note"] = "已受理，制卡和邮寄约 5–7 个工作日" + ("；初始额度 10,000 元，以审批结果为准" if credit else "")
        elif tool == "subscriptions.get":
            receipt["subscriptions"] = [dict(r) for r in db.execute("SELECT id,name,amount_cents,status,remind_days,billing_day FROM bank_subscriptions WHERE user_id=?", (user,))]
        elif tool == "subscriptions.cancel":
            db.execute("UPDATE bank_subscriptions SET status='cancelled' WHERE id=? AND user_id=?", (params["subscription_id"], user))
            name = db.execute("SELECT name FROM bank_subscriptions WHERE id=?", (params["subscription_id"],)).fetchone()[0]
            receipt.update(subscription_id=params["subscription_id"], name=name, subscription_status="cancelled")
        elif tool == "subscriptions.remind":
            db.execute("UPDATE bank_subscriptions SET remind_days=? WHERE id=? AND user_id=?", (params["days_before"], params["subscription_id"], user))
            name = db.execute("SELECT name FROM bank_subscriptions WHERE id=?", (params["subscription_id"],)).fetchone()[0]
            receipt.update(subscription_id=params["subscription_id"], name=name, remind_days=params["days_before"])
        elif tool == "goals.create":
            goalid = _id("goal")
            db.execute("INSERT INTO bank_goals VALUES (?,?,?,?,?)", (goalid, user, params["name"], params["amount_cents"], self._stamp()))
            receipt.update(goal_id=goalid, name=params["name"], amount_cents=params["amount_cents"], funds_reserved=False)
        elif tool == "funds.hold":
            if available < params["amount_cents"]:
                return self._fail(db, user, row, "insufficient_balance", "可用余额不足，未锁定")
            hid = _id("hold")
            db.execute("INSERT INTO bank_holds VALUES (?,?,?,?,?,?,?,?)", (hid, user, params["name"], params["amount_cents"], 0, "active", params["release_date"], self._stamp()))
            receipt.update(hold_id=hid, name=params["name"], amount_cents=params["amount_cents"], release_date=params["release_date"],
                           funds_reserved=True, available_after_cents=available - params["amount_cents"])
        elif tool == "funds.release":
            hold = self._hold_row(db, user, params["hold_id"])
            db.execute("UPDATE bank_holds SET status='released' WHERE id=?", (hold["id"],))
            receipt.update(hold_id=hold["id"], released_cents=hold["amount_cents"] - hold["used_cents"])
        elif tool == "merchant.order":
            item = ITEM_BY_ID[params["item_id"]]
            contact = db.execute("SELECT name FROM bank_contacts WHERE user_id=? AND id=?", (user, params["contact_id"])).fetchone()
            sid = _id("sched")
            db.execute("INSERT INTO bank_schedules VALUES (?,?,?,?,?,?,?,?,?,?)", (sid, user, "order", canonical(params), params["execute_date"],
                       "none", "scheduled", self._stamp(), row["id"], None))
            receipt.update(schedule_id=sid, item_id=item["id"], item=item["name"], merchant=item["merchant"], amount_cents=item["price_cents"],
                           execute_date=params["execute_date"], recipient=contact["name"], hold_id=params.get("hold_id"))
        elif tool == "wealth.subscribe":
            product = PRODUCT_BY_ID[params["product_id"]]
            if available < params["amount_cents"]:
                return self._fail(db, user, row, "insufficient_balance", "可用余额不足，未申购")
            hid = _id("pos")
            self._move(db, row["id"], source["id"], "acct-custody", params["amount_cents"])
            db.execute("INSERT INTO bank_transactions VALUES (?,?,?,?,?,?,?,?,?)", (_id("tx"), user, source["id"], product["name"], -params["amount_cents"], "理财", self._stamp(), "理财申购", row["id"]))
            db.execute("INSERT INTO bank_holdings VALUES (?,?,?,?,?,?)", (hid, user, product["id"], params["amount_cents"], self._stamp(), "active"))
            receipt.update(holding_id=hid, product_id=product["id"], product_name=product["name"], amount_cents=params["amount_cents"],
                           risk=product["risk"], confirm="T+1 确认份额，次日起计算收益" if product["liquidity_days"] else "当日确认")
        elif tool == "wealth.redeem":
            holding = next(h for h in self._holdings(db, user) if h["id"] == params["holding_id"])
            principal = params.get("amount_cents", holding["principal_cents"])
            income = round(holding["income_cents"] * principal / holding["principal_cents"])
            self._move(db, row["id"], "acct-custody", source["id"], principal + income)
            db.execute("INSERT INTO bank_transactions VALUES (?,?,?,?,?,?,?,?,?)", (_id("tx"), user, source["id"], holding["product_name"], principal + income, "理财", self._stamp(), "理财赎回", row["id"]))
            if principal == holding["principal_cents"]:
                db.execute("UPDATE bank_holdings SET status='redeemed' WHERE id=?", (holding["id"],))
            else:
                db.execute("UPDATE bank_holdings SET principal_cents=principal_cents-? WHERE id=?", (principal, holding["id"]))
            receipt.update(holding_id=holding["id"], product_name=holding["product_name"], principal_cents=principal, income_cents=income,
                           amount_cents=principal + income, settlement=PRODUCT_BY_ID[holding["product_id"]]["liquidity"] + "（模拟环境即时入账）")
        else: raise DomainError("unknown_tool", "执行器不支持此工具")
        unknown = security["fault"] == "timeout_after_commit"
        db.execute("UPDATE bank_operations SET status=?,message=?,receipt=?,otp_hash=NULL,otp_demo=NULL WHERE id=?", ("unknown" if unknown else "succeeded", "模拟通道回执丢失，结果待核实，请查询对账" if unknown else "操作已完成，以业务回执为准", canonical(receipt), row["id"]))
        db.execute("UPDATE bank_security SET channel_failures=0,channel_open_until=NULL WHERE user_id=?", (user,))
        self._event(db, user, "operation.committed", {"operation_id": row["id"], "receipt_id": receipt["id"], "tool": tool, "result_delivery": "unknown" if unknown else "delivered"})

    def _cancel(self, db, user, row):
        if row["status"] in ("succeeded", "unknown"): raise DomainError("cannot_cancel_committed", "已提交或结果未知的操作不能直接取消，请先对账", 409)
        if row["status"] == "cancelled": return
        if row["status"] == "failed": raise DomainError("operation_terminal", "操作已结束", 409)
        db.execute("UPDATE bank_operations SET status='cancelled',message='用户取消，未执行',otp_hash=NULL,otp_demo=NULL WHERE id=?", (row["id"],))
        self._event(db, user, "operation.cancelled", {"operation_id": row["id"]})
        self._sync_scheduled_operation(db, user, row["id"])

    def cancel_operation(self, user_id, operation_id):
        with self._tx() as db:
            row = self._load(db, user_id, operation_id)
            self._cancel(db, user_id, row)
            return self._operation(self._load(db, user_id, operation_id))

    # ------------------------------------------------------------------ scheduled execution
    def _scheduled_operations(self, db, user):
        return [{**self._operation(r), "schedule_id": r["schedule_id"], "run_date": r["run_date"]}
                for r in db.execute("SELECT o.*,r.schedule_id,r.run_date FROM bank_operations o JOIN bank_schedule_runs r ON r.operation_id=o.id WHERE o.user_id=? AND r.user_id=? ORDER BY o.created_at DESC LIMIT 100", (user, user))]

    def is_scheduled_operation(self, user_id, operation_id):
        """Only persisted bank-created occurrence links can bypass a plan lookup."""
        with self._tx() as db:
            return db.execute("SELECT 1 FROM bank_schedule_runs r JOIN bank_operations o ON o.id=r.operation_id WHERE r.user_id=? AND o.user_id=? AND o.id=?", (user_id, user_id, operation_id)).fetchone() is not None

    def _save_schedule_result(self, db, user, s, result):
        status = result["status"]
        if s["repeat"] == "monthly" and status == "succeeded":
            nxt = add_months(date.fromisoformat(s["execute_date"]), 1).isoformat()
            db.execute("UPDATE bank_schedules SET status='scheduled',execute_date=?,last_result=? WHERE id=?", (nxt, canonical(result), s["id"]))
        else:
            db.execute("UPDATE bank_schedules SET status=?,last_result=? WHERE id=?", ("done" if status == "succeeded" else status, canonical(result), s["id"]))
        self._event(db, user, "schedule.executed", {"schedule_id": s["id"], "kind": s["kind"], "status": status, "forced": result["forced"], "run_id": result["run_id"], "operation_id": result.get("operation_id")})

    def _sync_scheduled_operation(self, db, user, operation_id):
        run = db.execute("SELECT * FROM bank_schedule_runs WHERE user_id=? AND operation_id=?", (user, operation_id)).fetchone()
        if not run:
            return
        op = self._load(db, user, operation_id)
        if run["status"] == op["status"]:
            return
        s = db.execute("SELECT * FROM bank_schedules WHERE user_id=? AND id=?", (user, run["schedule_id"])).fetchone()
        last = json.loads(s["last_result"])
        result = {**last, "status": op["status"], "message": op["message"], "operation_id": operation_id}
        db.execute("UPDATE bank_schedule_runs SET status=?,occurred_at=?,message=? WHERE id=?", (op["status"], self._stamp(), op["message"], run["id"]))
        self._save_schedule_result(db, user, s, result)

    def _run_schedule(self, db, user, s, run_date, forced=False):
        """Re-check actual-day risk in the debit transaction, including demo runs."""
        previous = db.execute("SELECT * FROM bank_schedule_runs WHERE schedule_id=? AND run_date=?", (s["id"], run_date)).fetchone()
        if previous:
            return json.loads(s["last_result"])
        params = json.loads(s["params"])
        rid, stamp = _id("run"), self._stamp()
        source = self._source(db, user)
        security = db.execute("SELECT locked_until FROM bank_security WHERE user_id=?", (user,)).fetchone()
        status, message, amount = "failed", "", 0
        if security["locked_until"] and datetime.fromisoformat(security["locked_until"]) > self._now():
            message = "账户处于安全锁定，本次预约未执行"
        elif s["kind"] == "transfer":
            amount = params["amount_cents"]
            contact = db.execute("SELECT * FROM bank_contacts WHERE user_id=? AND id=?", (user, params["contact_id"])).fetchone()
            if source["balance_cents"] - self._held(db, user) < amount:
                message = "执行时可用余额不足，未转出"
            elif self._daily(db, user) + amount > YELLOW_LIMIT:
                # Creation-time consent never substitutes for this occurrence's
                # strong verification. Use the existing transfer/OTP path and
                # link its immutable operation to the unique occurrence.
                transfer = self._params("transfer", {"contact_id": params["contact_id"], "amount_cents": amount, "note": params.get("note") or "预约转账"})
                self._check_resources(db, user, "transfer", transfer)
                fingerprint = hashlib.sha256(canonical({"tool": "transfer", "params": transfer}).encode()).hexdigest()
                opid = _id("op")
                db.execute("INSERT INTO bank_operations(id,user_id,tool,params,idem_key,fingerprint,risk,status,message,created_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                           (opid, user, "transfer", canonical(transfer), f"schedule:{s['id']}:{run_date}", fingerprint, "red", "awaiting_confirmation", "本次预约超过实际当日累计限额，需要强验证", stamp, (self._now() + timedelta(minutes=10)).isoformat()))
                self._event(db, user, "operation.created", {"operation_id": opid, "tool": "transfer", "risk": "red", "parameter_fingerprint": fingerprint, "schedule_id": s["id"], "run_date": run_date})
                self._challenge(db, user, self._load(db, user, opid))
                message = "实际执行日累计超过1000元，请前往审批中心验证，本次预约尚未付款"
                result = {"run_id": rid, "status": "awaiting_verification", "message": message, "run_date": run_date, "amount_cents": amount, "forced": forced, "operation_id": opid}
                db.execute("INSERT INTO bank_schedule_runs(id,schedule_id,user_id,kind,run_date,amount_cents,status,occurred_at,message,operation_id) VALUES (?,?,?,?,?,?,?,?,?,?)", (rid, s["id"], user, s["kind"], run_date, amount, result["status"], stamp, message, opid))
                self._event(db, user, "authorization.risk_upgraded", {"operation_id": opid, "schedule_id": s["id"], "run_id": rid, "reason": "actual_day_cumulative"})
                self._save_schedule_result(db, user, s, result)
                return result
            else:
                self._move(db, rid, source["id"], contact["account_id"], amount)
                db.execute("INSERT INTO bank_transactions VALUES (?,?,?,?,?,?,?,?,?)", (_id("tx"), user, source["id"], contact["name"], -amount, "转账", stamp, params.get("note") or "预约转账", rid))
                status, message = "succeeded", f"已按预约向{contact['name']}转出"
        else:
            item = ITEM_BY_ID[params["item_id"]]
            amount = item["price_cents"]
            hold = db.execute("SELECT * FROM bank_holds WHERE id=? AND user_id=?", (params.get("hold_id"), user)).fetchone() if params.get("hold_id") else None
            from_hold = hold is not None and hold["status"] == "active" and hold["amount_cents"] - hold["used_cents"] >= amount
            free = source["balance_cents"] - self._held(db, user)
            if not from_hold and free < amount:
                message = "锁定资金和可用余额都不足，订单未支付"
            else:
                if from_hold:
                    used = hold["used_cents"] + amount
                    db.execute("UPDATE bank_holds SET used_cents=?,status=? WHERE id=?", (used, "consumed" if used >= hold["amount_cents"] else "active", hold["id"]))
                self._move(db, rid, source["id"], "acct-merchant", amount)
                db.execute("INSERT INTO bank_transactions VALUES (?,?,?,?,?,?,?,?,?)", (_id("tx"), user, source["id"], item["merchant"], -amount, "生活", stamp, item["name"] + "（预约订购）", rid))
                status, message = "succeeded", f"已向{item['merchant']}支付{item['name']}" + ("，从锁定资金中扣款" if from_hold else "")
        db.execute("INSERT INTO bank_schedule_runs(id,schedule_id,user_id,kind,run_date,amount_cents,status,occurred_at,message) VALUES (?,?,?,?,?,?,?,?,?)", (rid, s["id"], user, s["kind"], run_date, amount, status, stamp, message))
        result = {"run_id": rid, "status": status, "message": message, "run_date": run_date, "amount_cents": amount, "forced": forced}
        self._save_schedule_result(db, user, s, result)
        return result

    def run_due(self, user_id=None):
        today = self._today()
        with self._tx() as db:
            query = "SELECT * FROM bank_schedules WHERE status='scheduled' AND execute_date<=?" + (" AND user_id=?" if user_id else "") + " ORDER BY execute_date,created_at,id"
            for s in db.execute(query, (today.isoformat(), user_id) if user_id else (today.isoformat(),)).fetchall():
                self._run_schedule(db, s["user_id"], s, s["execute_date"])
            query = "SELECT * FROM bank_holds WHERE status='active' AND release_date<=?" + (" AND user_id=?" if user_id else "")
            for h in db.execute(query, (today.isoformat(), user_id) if user_id else (today.isoformat(),)).fetchall():
                db.execute("UPDATE bank_holds SET status='released' WHERE id=?", (h["id"],))
                self._event(db, h["user_id"], "funds.auto_released", {"hold_id": h["id"], "released_cents": h["amount_cents"] - h["used_cents"]})

    def run_schedule_now(self, user_id, schedule_id):
        """Demo only: run a future schedule as if its date had arrived."""
        with self._tx() as db:
            self._user(db, user_id)
            s = db.execute("SELECT * FROM bank_schedules WHERE id=? AND user_id=?", (schedule_id, user_id)).fetchone()
            if not s:
                raise DomainError("not_found", "预约不存在", 404)
            if s["status"] not in ("scheduled", "awaiting_verification", "awaiting_confirmation", "unknown"):
                raise DomainError("invalid_state", "预约已执行或已取消", 409)
            self._event(db, user_id, "demo.schedule_forced", {"schedule_id": schedule_id, "planned_date": s["execute_date"]})
            return self._run_schedule(db, user_id, s, s["execute_date"], forced=True)

    def settle_split_share(self, user_id, split_id, contact_id):
        """Demo only: pretend a friend paid their share."""
        with self._tx() as db:
            self._user(db, user_id)
            if not db.execute("SELECT 1 FROM bank_splits WHERE id=? AND user_id=?", (split_id, user_id)).fetchone():
                raise DomainError("not_found", "收款单不存在", 404)
            share = db.execute("SELECT * FROM bank_split_shares WHERE split_id=? AND contact_id=?", (split_id, contact_id)).fetchone()
            if not share:
                raise DomainError("not_found", "这位参与人不在收款单中", 404)
            if share["status"] == "paid":
                raise DomainError("invalid_state", "这一份已经收到了", 409)
            source = self._source(db, user_id)
            ref = f"{split_id}:{contact_id}"
            self._move(db, ref, "acct-clearing", source["id"], share["amount_cents"])
            db.execute("INSERT INTO bank_transactions VALUES (?,?,?,?,?,?,?,?,?)", (_id("tx"), user_id, source["id"], share["name"], share["amount_cents"], "收款", self._stamp(), "AA 收款", ref))
            db.execute("UPDATE bank_split_shares SET status='paid',paid_at=? WHERE split_id=? AND contact_id=?", (self._stamp(), split_id, contact_id))
            self._event(db, user_id, "demo.split_paid", {"split_id": split_id, "contact_id": contact_id, "amount_cents": share["amount_cents"]})
            return {"split_id": split_id, "contact_id": contact_id, "amount_cents": share["amount_cents"], "status": "paid"}

    # ------------------------------------------------------------------ misc
    def demo_inbox(self, user_id):
        with self._tx() as db:
            self._guard(db, user_id)
            messages = [{"operation_id": r["id"], "code": r["otp_demo"], "expires_at": r["otp_expires"]} for r in db.execute("SELECT * FROM bank_operations WHERE user_id=? AND status='awaiting_verification' AND otp_demo IS NOT NULL AND otp_expires>?", (user_id, self._stamp()))]
            return {"demo": True, "messages": messages, "warning": "仅为演示认证收件箱，不是真实短信或多因子认证提供方"}

    def reconcile(self, user_id, operation_id):
        with self._tx() as db:
            row = self._load(db, user_id, operation_id)
            if row["status"] == "unknown" and row["receipt"]:
                db.execute("UPDATE bank_operations SET status='succeeded',message='对账已核实成功，未重复执行' WHERE id=?", (operation_id,))
                self._event(db, user_id, "operation.reconciled", {"operation_id": operation_id, "receipt_id": json.loads(row["receipt"])["id"]})
            self._sync_scheduled_operation(db, user_id, operation_id)
            return self._operation(self._load(db, user_id, operation_id))

    def set_fault(self, user_id, mode):
        if mode not in ("none", "timeout_after_commit", "channel_failure"): raise DomainError("invalid_fault", "未知故障模式")
        with self._tx() as db:
            self._user(db, user_id)
            db.execute("UPDATE bank_security SET fault=? WHERE user_id=?", (mode, user_id))
            self._event(db, user_id, "demo.fault_configured", {"mode": mode})
        return {"mode": mode, "demo": True}

    def security_status(self, user_id):
        with self._tx() as db:
            row = self._guard_soft(db, user_id)
            now = self._now()
            locked = bool(row["locked_until"] and datetime.fromisoformat(row["locked_until"]) > now)
            channel_open = bool(row["channel_open_until"] and datetime.fromisoformat(row["channel_open_until"]) > now)
            recent = db.execute("SELECT COUNT(*) FROM bank_operations WHERE user_id=? AND created_at>?", (user_id, (now - timedelta(seconds=60)).isoformat())).fetchone()[0]
            events = [{"action": r["action"], "occurred_at": r["occurred_at"], "details": json.loads(r["details"])}
                      for r in db.execute("SELECT * FROM bank_audit WHERE user_id=? AND (action LIKE 'security.%' OR action LIKE 'authorization.%' OR action LIKE 'channel.%') ORDER BY id DESC LIMIT 30", (user_id,))]
            ops = db.execute("SELECT risk,status,COUNT(*) n FROM bank_operations WHERE user_id=? GROUP BY risk,status", (user_id,)).fetchall()
            return {"locked": locked, "locked_until": row["locked_until"] if locked else None, "lock_reason": row["lock_reason"] if locked else None,
                    "otp_failures": row["failures"], "otp_failure_limit": 3,
                    "suspicious_hits": row["suspicious_hits"] if row["suspicious_since"] and datetime.fromisoformat(row["suspicious_since"]) > now - timedelta(minutes=10) else 0,
                    "suspicious_limit": 3, "operations_last_minute": recent, "velocity_limit": VELOCITY_LIMIT,
                    "channel_failures": row["channel_failures"], "channel_open": channel_open,
                    "daily_transfer_cents": self._daily(db, user_id), "daily_limit_cents": YELLOW_LIMIT,
                    "operations": [dict(o) for o in ops], "events": events,
                    "tiers": self._tier_table()}

    @staticmethod
    def _tier_table():
        green = ["balance", "transactions", "bills", "analysis.expression", "cards", "subscriptions.detect", "wealth.profile",
                 "wealth.products", "wealth.holdings", "life.events", "schedules.list"]
        yellow = ["transfer", "transfer.schedule", "schedule.cancel", "split.create", "subscriptions.get", "subscriptions.cancel",
                  "subscriptions.remind", "card.virtual", "card.apply", "card.freeze", "card.limit", "card.controls",
                  "goals.create", "funds.hold", "funds.release", "merchant.order", "wealth.redeem"]
        red = ["card.report_lost", "card.unlock", "card.unfreeze", "card.pin_reset", "wealth.subscribe"]
        conditional = {"transfer": "当日累计超过 1000 元转为红色", "transfer.schedule": "同一执行日累计超过 1000 元转为红色",
                       "card.limit": "调高额度为红色，调低为黄色", "card.controls": "开启限制项为红色，关闭为黄色",
                       "merchant.order": "单笔超过 1000 元为红色"}
        return [{"tool": t, "label": LABELS[t], "tier": tier, "condition": conditional.get(t)}
                for tier, tools in (("green", green), ("yellow", yellow), ("red", red)) for t in tools]

    def audit(self, user_id):
        with self._tx() as db:
            self._user(db, user_id)
            rows = db.execute("SELECT * FROM bank_audit WHERE user_id=? ORDER BY id", (user_id,)).fetchall()
            prev = "0" * 64; valid = True; events = []
            for row in rows:
                details = json.loads(row["details"])
                payload = canonical({"user_id": row["user_id"], "action": row["action"], "occurred_at": row["occurred_at"], "details": details, "prev_hash": row["prev_hash"]})
                digest = hashlib.sha256(payload.encode()).hexdigest()
                if row["prev_hash"] != prev or row["event_hash"] != digest: valid = False
                prev = row["event_hash"]
                events.append({"id": row["id"], "action": row["action"], "occurred_at": row["occurred_at"], "details": details, "event_hash": row["event_hash"]})
            return {"events": events, "chain_valid": valid, "storage": "SQLite hash chain: tamper-evident, not immutable"}
