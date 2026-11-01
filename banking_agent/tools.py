"""Single tool registry shared by the planner validator and the bank executor.

Each parameter is (type, required). Types:
  str      short text (<=200)       code   sandbox expression (<=4096)
  amount   integer cents, 1..5_000_000
  period   month | last_month | year
  date     YYYY-MM-DD (China time)
  ids      list of 1..12 short ids
  bool     strict boolean
  days     integer 1..30
"""
from __future__ import annotations

import re
from datetime import date

READ, WRITE = "read", "write"

TOOLS: dict[str, dict] = {
    # Green: read-only, executes after intent is validated.
    "balance": {"kind": READ, "params": {}},
    "cards": {"kind": READ, "params": {}},
    "transactions": {"kind": READ, "params": {"period": ("period", False)}},
    "bills": {"kind": READ, "params": {"period": ("period", False)}},
    "analysis.expression": {"kind": READ, "params": {"code": ("code", True), "period": ("period", False)}},
    "subscriptions.detect": {"kind": READ, "params": {}},
    "subscriptions.offers": {"kind": READ, "params": {}},
    "wealth.profile": {"kind": READ, "params": {}},
    "wealth.products": {"kind": READ, "params": {}},
    "wealth.holdings": {"kind": READ, "params": {}},
    "life.events": {"kind": READ, "params": {}},
    "schedules.list": {"kind": READ, "params": {}},
    # Yellow / red: create an operation that waits for the user.
    "transfer": {"kind": WRITE, "params": {"contact_id": ("str", True), "amount_cents": ("amount", True), "note": ("str", False)}},
    "transfer.schedule": {"kind": WRITE, "params": {"contact_id": ("str", True), "amount_cents": ("amount", True),
                          "execute_date": ("date", True), "repeat": ("repeat", False), "note": ("str", False)}},
    "schedule.cancel": {"kind": WRITE, "params": {"schedule_id": ("str", True)}},
    "split.create": {"kind": WRITE, "params": {"total_cents": ("amount", True), "contact_ids": ("ids", True),
                     "include_self": ("bool", False), "note": ("str", False)}},
    "card.report_lost": {"kind": WRITE, "params": {"card_id": ("str", True)}},
    "card.unlock": {"kind": WRITE, "params": {"card_id": ("str", True)}},
    "card.freeze": {"kind": WRITE, "params": {"card_id": ("str", True)}},
    "card.unfreeze": {"kind": WRITE, "params": {"card_id": ("str", True)}},
    "card.virtual": {"kind": WRITE, "params": {}},
    "card.apply": {"kind": WRITE, "params": {"card_type": ("card_type", True)}},
    "card.limit": {"kind": WRITE, "params": {"card_id": ("str", True), "limit_cents": ("limit", True)}},
    "card.controls": {"kind": WRITE, "params": {"card_id": ("str", True), "control": ("control", True), "enabled": ("bool", True)}},
    "card.pin_reset": {"kind": WRITE, "params": {"card_id": ("str", True)}},
    "subscriptions.get": {"kind": WRITE, "params": {}},
    "subscriptions.subscribe": {"kind": WRITE, "params": {"offer_id": ("str", True)}},
    "subscriptions.cancel": {"kind": WRITE, "params": {"subscription_id": ("str", True)}},
    "subscriptions.remind": {"kind": WRITE, "params": {"subscription_id": ("str", True), "days_before": ("days", True)}},
    "goals.create": {"kind": WRITE, "params": {"name": ("str", True), "amount_cents": ("amount", True)}},
    "funds.hold": {"kind": WRITE, "params": {"name": ("str", True), "amount_cents": ("amount", True), "release_date": ("date", True)}},
    "funds.release": {"kind": WRITE, "params": {"hold_id": ("str", True)}},
    "merchant.order": {"kind": WRITE, "params": {"item_id": ("str", True), "execute_date": ("date", True),
                       "contact_id": ("str", True), "hold_id": ("str", False), "note": ("str", False)}},
    "wealth.subscribe": {"kind": WRITE, "params": {"product_id": ("str", True), "amount_cents": ("amount", True)}},
    "wealth.redeem": {"kind": WRITE, "params": {"holding_id": ("str", True), "amount_cents": ("amount", False)}},
}

READ_TOOLS = {k for k, v in TOOLS.items() if v["kind"] == READ}
WRITE_TOOLS = {k for k, v in TOOLS.items() if v["kind"] == WRITE}

ENUMS = {
    "period": {"month", "last_month", "year"},
    "repeat": {"none", "monthly"},
    "card_type": {"debit", "credit"},
    "control": {"online", "overseas", "atm", "contactless"},
}

LABELS = {
    "balance": "查询余额", "cards": "查询卡片", "transactions": "查询交易", "bills": "账单分析",
    "analysis.expression": "受限分析", "subscriptions.detect": "识别周期扣费", "wealth.profile": "读取风险测评",
    "subscriptions.offers": "查看可订阅服务", "subscriptions.subscribe": "开通订阅",
    "wealth.products": "理财产品对比", "wealth.holdings": "持仓收益", "life.events": "检查近期纪念日",
    "schedules.list": "查看资金日程", "transfer": "转账", "transfer.schedule": "预约转账",
    "schedule.cancel": "取消预约", "split.create": "发起AA收款", "card.report_lost": "卡片挂失",
    "card.unlock": "卡片解挂", "card.freeze": "临时冻结卡片", "card.unfreeze": "解除冻结",
    "card.virtual": "申请虚拟卡", "card.apply": "申请新卡", "card.limit": "调整信用额度",
    "card.controls": "调整交易限制", "card.pin_reset": "重置交易密码", "subscriptions.get": "查询订阅",
    "subscriptions.cancel": "取消订阅", "subscriptions.remind": "设置续费提醒", "goals.create": "储蓄目标记录",
    "funds.hold": "锁定活期资金", "funds.release": "释放锁定资金", "merchant.order": "预约订购",
    "wealth.subscribe": "申购理财", "wealth.redeem": "赎回理财",
}

_ID = re.compile(r"^[A-Za-z0-9_.:-]{1,80}$")


class ParamError(ValueError):
    pass


def check_params(tool: str, params) -> dict:
    """Raise ParamError on anything outside the declared contract."""
    if tool not in TOOLS:
        raise ParamError("此工具未被允许")
    if not isinstance(params, dict):
        raise ParamError("参数必须为对象")
    spec = TOOLS[tool]["params"]
    if set(params) - set(spec):
        raise ParamError("工具参数不能包含身份、权限或未声明字段")
    for name, (kind, required) in spec.items():
        if name not in params:
            if required:
                raise ParamError("请补充完整的业务参数")
            continue
        value = params[name]
        if kind == "amount":
            if type(value) is not int or not 0 < value <= 5_000_000:
                raise ParamError("金额须为有效正整数分，演示上限为 50000 元")
        elif kind == "limit":
            if type(value) is not int or not 0 < value <= 100_000_000:
                raise ParamError("额度须为有效正整数分")
        elif kind == "days":
            if type(value) is not int or not 1 <= value <= 30:
                raise ParamError("提醒天数须在 1–30 天之间")
        elif kind == "bool":
            if type(value) is not bool:
                raise ParamError("开关参数必须为布尔值")
        elif kind == "ids":
            if type(value) is not list or not 1 <= len(value) <= 12 or len(set(value)) != len(value) \
                    or any(type(v) is not str or not _ID.match(v) for v in value):
                raise ParamError("参与人列表不合法")
        elif kind == "date":
            if type(value) is not str or not re.fullmatch(r"20\d{2}-\d{2}-\d{2}", value):
                raise ParamError("日期格式应为 YYYY-MM-DD")
            try:
                date.fromisoformat(value)
            except ValueError:
                raise ParamError("日期无效") from None
        elif kind in ENUMS:
            if value not in ENUMS[kind]:
                raise ParamError("参数取值不在允许范围内")
        else:
            limit = 4096 if kind == "code" else 200
            if type(value) is not str or len(value) > limit or (name != "note" and not value.strip()):
                raise ParamError("文本参数无效或过长")
    return params


def json_schema_for(tool: str) -> dict:
    """Generation-time constraint for model output; check_params still decides."""
    types = {"str": {"type": "string"}, "code": {"type": "string"},
             "amount": {"type": "integer", "minimum": 1, "maximum": 5_000_000},
             "days": {"type": "integer", "minimum": 1, "maximum": 30}, "bool": {"type": "boolean"},
             "limit": {"type": "integer", "minimum": 1, "maximum": 100_000_000},
             "ids": {"type": "array", "items": {"type": "string"}, "maxItems": 12},
             "date": {"type": "string", "pattern": r"^20\d{2}-\d{2}-\d{2}$"}}
    props = {}
    for name, (kind, _) in TOOLS[tool]["params"].items():
        props[name] = {"type": "string", "enum": sorted(ENUMS[kind])} if kind in ENUMS else types[kind]
    return props
