"""Deterministic analytics over transaction rows. No model involvement.

Rows are dicts with merchant, amount_cents (negative = spend), category and an
ISO occurred_at timestamp. Every flag carries the rule that produced it, so the
answer layer can quote the reason instead of inventing one.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from statistics import median

CN = timezone(timedelta(hours=8))


def local(ts: str) -> datetime:
    return datetime.fromisoformat(ts).astimezone(CN)


def robust_z(value: float, sample: list[float]) -> float | None:
    """Iglewicz–Hoaglin modified z-score, 0.6745 * (x - median) / MAD."""
    if len(sample) < 5:
        return None
    m = median(sample)
    mad = median(abs(x - m) for x in sample)
    if mad == 0:
        return None
    return 0.6745 * (value - m) / mad


def anomalies(rows: list[dict], baseline: list[dict]) -> list[dict]:
    """Flag spend that deserves a second look. A flag is not a fraud verdict."""
    history = defaultdict(list)
    seen_merchants = set()
    for r in baseline:
        if r["amount_cents"] < 0:
            history[r["category"]].append(-r["amount_cents"])
            seen_merchants.add(r["merchant"])
    flagged: dict[str, dict] = {}

    def flag(row, code, reason, score):
        item = flagged.setdefault(row["id"], {"transaction_id": row["id"], "merchant": row["merchant"],
                                              "amount_cents": -row["amount_cents"], "occurred_at": row["occurred_at"],
                                              "category": row["category"], "rules": [], "score": 0.0})
        item["rules"].append({"code": code, "reason": reason})
        item["score"] = max(item["score"], score)

    spend = [r for r in rows if r["amount_cents"] < 0 and r["category"] not in {"转账", "理财"}]
    for r in spend:
        amount = -r["amount_cents"]
        if r["category"] != "居住":
            z = robust_z(amount, history.get(r["category"], []))
            if z is not None and z > 3.5 and amount >= 20_000:
                flag(r, "robust_z", f"比过去半年同类{r['category']}支出的中位水平高出很多（修正 z 分数 {z:.1f}，阈值 3.5）", min(z / 3.5, 3))
            elif amount >= 100_000:
                flag(r, "large_single", "单笔非固定支出超过 1000 元", 1.2)
        if "海外" in r["merchant"] or "境外" in r["merchant"]:
            flag(r, "overseas", "境外或跨境线上商户", 1.4)
        hour = local(r["occurred_at"]).hour
        if 0 <= hour < 5 and amount >= 5_000:
            flag(r, "night", f"凌晨 {hour} 点发生的较大额消费", 1.1)
        if r["merchant"] not in seen_merchants and amount >= 50_000 and baseline:
            flag(r, "new_merchant", "首次出现的商户，金额较大", 1.0)
    # Same merchant, same amount, within 10 minutes: likely a double charge.
    ordered = sorted(spend, key=lambda r: r["occurred_at"])
    for a, b in zip(ordered, ordered[1:]):
        if a["merchant"] == b["merchant"] and a["amount_cents"] == b["amount_cents"] \
                and (local(b["occurred_at"]) - local(a["occurred_at"])) <= timedelta(minutes=10):
            flag(b, "duplicate", f"与 {local(a['occurred_at']).strftime('%H:%M')} 的一笔同商户同金额，可能重复扣款", 1.6)
    return sorted(flagged.values(), key=lambda x: (-x["score"], x["occurred_at"]))


def recurring(rows: list[dict], today: date, cash_flow: bool = False) -> list[dict]:
    """Find monthly charges from history: >=3 hits, 26–35 day gaps, stable amount.

    cash_flow=True also keeps rent, regular transfers and income, for forecasting."""
    groups = defaultdict(list)
    for r in rows:
        if cash_flow:
            if r["category"] != "理财":
                groups[(r["merchant"], r["amount_cents"] > 0)].append(r)
        elif r["amount_cents"] < 0 and r["category"] not in {"转账", "居住", "理财"}:
            groups[r["merchant"]].append(r)
    found = []
    for key, items in groups.items():
        merchant = key[0] if cash_flow else key
        items.sort(key=lambda r: r["occurred_at"])
        if len(items) < 3:
            continue
        days = [local(r["occurred_at"]).date() for r in items]
        gaps = [(b - a).days for a, b in zip(days, days[1:])]
        if not all(26 <= g <= 35 for g in gaps):
            continue
        amounts = [abs(r["amount_cents"]) for r in items]
        last, previous = amounts[-1], amounts[-2]
        prior = amounts[:-1]
        mid = median(prior)
        spread = max(abs(a - mid) / mid for a in prior)
        # Earlier charges must be stable; the latest may carry a price change.
        if spread > 0.15 or abs(last - mid) / mid > 0.6:
            continue
        cadence = round(sum(gaps) / len(gaps))
        # Monthly patterns follow the calendar (the 10th stays the 10th), not a fixed day count.
        step, next_day = 1, _next_month(days[-1], 1)
        while next_day < today:
            step += 1
            next_day = _next_month(days[-1], step)
        confidence = min(0.99, 0.55 + 0.1 * len(items) - 0.5 * spread)
        found.append({
            "merchant": merchant, "category": items[-1]["category"], "count": len(items), "inflow": items[-1]["amount_cents"] > 0,
            "cadence_days": cadence, "last_amount_cents": last, "previous_amount_cents": previous,
            "price_change_cents": last - previous, "annual_cents": last * 12,
            "last_charged": days[-1].isoformat(), "next_expected": next_day.isoformat(),
            "days_until": (next_day - today).days, "confidence": round(confidence, 2),
            "transaction_ids": [r["id"] for r in items],
        })
    return sorted(found, key=lambda x: x["days_until"])


def _next_month(day: date, months: int) -> date:
    import calendar
    m = day.month - 1 + months
    y, m = day.year + m // 12, m % 12 + 1
    return date(y, m, min(day.day, calendar.monthrange(y, m)[1]))


def split_shares(total_cents: int, people: int) -> list[int]:
    """Exact-cent split. Leftover cents go one each to the first shares."""
    if people < 1:
        raise ValueError("至少需要一位参与人")
    base, rest = divmod(total_cents, people)
    return [base + (1 if i < rest else 0) for i in range(people)]


def month_key(ts: str) -> str:
    return local(ts).strftime("%Y-%m")


def monthly_series(rows: list[dict]) -> list[dict]:
    months = defaultdict(lambda: {"income_cents": 0, "expense_cents": 0, "transfer_cents": 0})
    for r in rows:
        m = months[month_key(r["occurred_at"])]
        if r["amount_cents"] > 0:
            m["income_cents"] += r["amount_cents"]
        else:
            m["expense_cents"] += -r["amount_cents"]
            if r["category"] == "转账":
                m["transfer_cents"] += -r["amount_cents"]
    return [{"month": k, **v} for k, v in sorted(months.items())]


def daily_series(rows: list[dict]) -> list[dict]:
    days = defaultdict(int)
    for r in rows:
        if r["amount_cents"] < 0:
            days[local(r["occurred_at"]).date().isoformat()] += -r["amount_cents"]
    return [{"day": k, "expense_cents": v} for k, v in sorted(days.items())]


def top_merchants(rows: list[dict], limit: int = 5) -> list[dict]:
    totals = defaultdict(lambda: [0, 0])
    for r in rows:
        if r["amount_cents"] < 0 and r["category"] not in {"转账", "理财"}:
            totals[r["merchant"]][0] += -r["amount_cents"]
            totals[r["merchant"]][1] += 1
    ranked = sorted(totals.items(), key=lambda kv: -kv[1][0])[:limit]
    return [{"merchant": k, "total_cents": v[0], "count": v[1]} for k, v in ranked]
