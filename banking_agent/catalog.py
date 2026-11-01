"""Static demo catalogs: wealth products, suitability questionnaire, partner merchants.

Product names are fictional. Risk levels follow the five-tier PR1–PR5 / C1–C5
convention used by Chinese bank wealth sales (商业银行理财业务监督管理办法):
an investor may only buy products at or below their own tier.
"""
from __future__ import annotations

import math
import random

RISK_NAMES = {1: "低风险", 2: "中低风险", 3: "中风险", 4: "中高风险", 5: "高风险"}
INVESTOR_NAMES = {1: "保守型", 2: "稳健型", 3: "平衡型", 4: "成长型", 5: "进取型"}

# Versioned offer IDs bind confirmation to fixed server-owned prices and terms.
SUBSCRIPTION_OFFERS = [{
    "id": "reading-monthly-v1", "name": "知行阅读", "description": "电子书与财经月刊会员（模拟服务）",
    "amount_cents": 1500, "period": "monthly", "auto_renew": True,
    "terms_version": "v1", "charge_mode": "schedule_only",
    "terms": "15 元/月，按月续费，可随时取消后续代扣。本次仅开通模拟协议，不立即扣款；后续扣费仅作日程展示。",
}]

PRODUCTS = [
    {"id": "wm-cash", "name": "天天盈现金管理", "type": "现金管理类", "risk": 1,
     "yield_label": "七日年化", "yield_bp": 182, "one_year_bp": 186, "volatility_bp": 3, "max_drawdown_bp": 0,
     "min_cents": 100, "liquidity": "T+0 快赎（单日 1 万元）", "liquidity_days": 0, "holding_days": 0,
     "fee_bp": 32, "benchmark": "七天通知存款利率", "issuer": "拾迹理财（模拟）",
     "fit": "随用随取的零钱和应急备用金"},
    {"id": "wm-bond90", "name": "稳享 90 天持有", "type": "固定收益类", "risk": 2,
     "yield_label": "业绩比较基准", "yield_bp": 255, "benchmark_range": "2.30%–2.80%", "one_year_bp": 261,
     "volatility_bp": 25, "max_drawdown_bp": 12, "min_cents": 100, "liquidity": "每笔持有满 90 天可赎回，T+1 到账",
     "liquidity_days": 1, "holding_days": 90, "fee_bp": 45, "benchmark": "中债新综合财富指数",
     "issuer": "拾迹理财（模拟）", "fit": "三个月内用不到的钱，想比活期多一点收益"},
    {"id": "wm-shortbond", "name": "中短债 A", "type": "债券基金", "risk": 2,
     "yield_label": "近一年收益", "yield_bp": 245, "one_year_bp": 245, "volatility_bp": 40, "max_drawdown_bp": 35,
     "min_cents": 1000, "liquidity": "开放式，T+1 确认，T+2 到账", "liquidity_days": 2, "holding_days": 7,
     "fee_bp": 38, "benchmark": "中债总财富(1–3年)指数", "issuer": "代销 · 某公募基金（模拟）",
     "fit": "半年左右的闲钱，接受偶尔小幅波动"},
    {"id": "wm-plus180", "name": "安盈固收+ 6 个月", "type": "混合类（固收+）", "risk": 3,
     "yield_label": "业绩比较基准", "yield_bp": 330, "benchmark_range": "2.80%–3.80%", "one_year_bp": 312,
     "volatility_bp": 210, "max_drawdown_bp": 86, "min_cents": 100, "liquidity": "180 天封闭期，到期自动赎回",
     "liquidity_days": 1, "holding_days": 180, "fee_bp": 70, "benchmark": "90% 债券 + 10% 沪深300",
     "issuer": "拾迹理财（模拟）", "fit": "一年内不动用，可以接受短期浮亏"},
    {"id": "wm-hs300", "name": "沪深300 指数增强", "type": "股票指数基金", "risk": 4,
     "yield_label": "近一年收益", "yield_bp": 840, "one_year_bp": 840, "volatility_bp": 1850, "max_drawdown_bp": 2130,
     "min_cents": 1000, "liquidity": "开放式，T+1 确认，T+3 到账", "liquidity_days": 3, "holding_days": 7,
     "fee_bp": 135, "benchmark": "95% 沪深300 + 5% 活期", "issuer": "代销 · 某公募基金（模拟）",
     "fit": "三年以上的长期投资，能承受 20% 以上回撤"},
    {"id": "wm-tech", "name": "科创成长混合", "type": "偏股混合基金", "risk": 5,
     "yield_label": "近一年收益", "yield_bp": -620, "one_year_bp": -620, "volatility_bp": 3100, "max_drawdown_bp": 3860,
     "min_cents": 1000, "liquidity": "开放式，T+1 确认，T+3 到账", "liquidity_days": 3, "holding_days": 7,
     "fee_bp": 150, "benchmark": "80% 科创50 + 20% 中债", "issuer": "代销 · 某公募基金（模拟）",
     "fit": "小比例配置，波动非常大，可能长期亏损"},
]
PRODUCT_BY_ID = {p["id"]: p for p in PRODUCTS}


def nav_series(product_id: str, months: int = 12) -> list[float]:
    """Deterministic simulated net-value path (weekly points), starting at 1.0.

    Drift and volatility come from the product's stated figures so the curve's
    shape matches its numbers. It is illustrative, not historical data.
    """
    p = PRODUCT_BY_ID[product_id]
    rng = random.Random(product_id)
    weeks = months * 52 // 12
    mu = p["one_year_bp"] / 10_000 / 52
    sigma = p["volatility_bp"] / 10_000 / math.sqrt(52)
    value, points = 1.0, [1.0]
    for _ in range(weeks):
        value *= 1 + mu + sigma * rng.gauss(0, 1)
        points.append(round(value, 5))
    # Bend the path multiplicatively so it ends exactly at the stated return.
    target = 1 + p["one_year_bp"] / 10_000
    fix = target / points[-1]
    return [round(v * fix ** (i / weeks), 5) for i, v in enumerate(points)]


QUESTIONNAIRE = [
    {"id": "age", "title": "你的年龄", "options": [
        ("18–30 岁", 8), ("31–45 岁", 10), ("46–55 岁", 6), ("56–65 岁", 3), ("65 岁以上", 1)]},
    {"id": "income", "title": "家庭年收入（税后）", "options": [
        ("10 万元以下", 2), ("10–30 万元", 5), ("30–80 万元", 8), ("80 万元以上", 10)]},
    {"id": "share", "title": "准备投资的钱，占家庭金融资产的比例", "options": [
        ("70% 以上", 2), ("50%–70%", 4), ("20%–50%", 7), ("20% 以下", 10)]},
    {"id": "experience", "title": "你的投资经历", "options": [
        ("只存过银行存款", 0), ("买过银行理财或货币基金", 3), ("持有债券或基金 1–3 年", 7), ("股票或偏股基金 3 年以上", 10)]},
    {"id": "horizon", "title": "这笔钱多久之内不会用到", "options": [
        ("半年以内", 2), ("半年到一年", 5), ("一到三年", 8), ("三年以上", 10)]},
    {"id": "goal", "title": "你更看重哪一点", "options": [
        ("本金安全，略高于存款就好", 2), ("稳健增值，能接受小幅波动", 6), ("追求更高收益，波动大也可以", 10)]},
    {"id": "loss", "title": "一年内最多能接受亏损多少", "options": [
        ("不能接受亏损", 0), ("5% 以内", 4), ("5%–15%", 8), ("15%–30%", 12), ("30% 以上", 15)]},
    {"id": "drawdown", "title": "如果持有的产品三个月跌了 20%，你会", "options": [
        ("立即全部赎回", 1), ("赎回一部分", 5), ("继续持有等待回升", 10), ("趁低加仓", 15)]},
]
QUESTIONNAIRE_MAX = sum(max(s for _, s in q["options"]) for q in QUESTIONNAIRE)


def score_answers(answers: list[int]) -> dict:
    if type(answers) is not list or len(answers) != len(QUESTIONNAIRE):
        raise ValueError("请完成全部题目")
    total = 0
    for q, a in zip(QUESTIONNAIRE, answers):
        if type(a) is not int or not 0 <= a < len(q["options"]):
            raise ValueError("答案超出选项范围")
        total += q["options"][a][1]
    score = round(100 * total / QUESTIONNAIRE_MAX)
    level = 1 if score <= 20 else 2 if score <= 40 else 3 if score <= 60 else 4 if score <= 80 else 5
    notes = []
    # Veto rules: an explicit "no loss" answer, or age over 65, caps the tier.
    if answers[6] == 0:
        level = 1
        notes.append("选择了“不能接受亏损”，按保守型处理，只匹配低风险产品。")
    if answers[0] == 4 and level > 2:
        level = 2
        notes.append("65 岁以上客户最高按稳健型匹配，购买时需要额外提示。")
    if answers[4] == 0 and level > 2:
        level = 2
        notes.append("资金半年内要用，流动性优先，最高按稳健型匹配。")
    return {"score": score, "level": level, "name": INVESTOR_NAMES[level], "notes": notes}


MERCHANT_ITEMS = [
    {"id": "flower-rose19", "merchant": "花间集", "category": "鲜花", "name": "19 枝红玫瑰花束", "price_cents": 29_900},
    {"id": "flower-sun", "merchant": "花间集", "category": "鲜花", "name": "向日葵混搭花束", "price_cents": 23_900},
    {"id": "cake-berry6", "merchant": "麦香记", "category": "蛋糕", "name": "6 寸草莓慕斯", "price_cents": 26_800},
    {"id": "cake-fruit8", "merchant": "麦香记", "category": "蛋糕", "name": "8 寸鲜奶水果蛋糕", "price_cents": 35_800},
]
ITEM_BY_ID = {i["id"]: i for i in MERCHANT_ITEMS}
