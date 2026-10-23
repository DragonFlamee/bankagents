import { useMemo, useState } from "react";
import { Lock, MessageSquareText, ShieldCheck } from "lucide-react";
import { money, useData } from "./api";
import { Button, Empty, SectionHead } from "./components";
import { Skeleton } from "./controls";
import { Questionnaire } from "./Questionnaire";
import type { WealthData } from "./types";
import { Gauge, investorName, NavChart, ProjectionChart, riskColor, RiskLadder, riskName } from "./viz";

const pct = (bp: number) => `${(bp / 100).toFixed(2)}%`;

export function WealthPage({ onAsk }: { onAsk: (prompt: string) => void }) {
  const { data, loading, error, reload } = useData<WealthData>("/api/wealth");
  const [assess, setAssess] = useState(false);
  const [shown, setShown] = useState<string[] | null>(null);
  const [pick, setPick] = useState("wm-bond90");
  const [amount, setAmount] = useState(10000);
  const [months, setMonths] = useState(12);
  const products = data?.products || [];
  const profile = data?.profile && !data.profile.expired ? data.profile : null;
  const visible = shown || products.filter((p) => p.suitable).map((p) => p.id);
  const product = products.find((p) => p.id === pick);
  const projection = useMemo(() => {
    if (!product) return null;
    const annual = product.one_year_bp / 10000;
    const vol = product.volatility_bp / 10000;
    const t = months / 12;
    const mid = amount * 100 * Math.pow(1 + annual, t);
    const spread = amount * 100 * vol * Math.sqrt(t);
    const fee = amount * 100 * (product.fee_bp / 10000) * t;
    return { annual, vol, mid, lo: Math.max(0, mid - spread), hi: mid + spread, fee };
  }, [product, amount, months]);
  if (loading && !data)
    return (
      <div className="loading-panel"><Skeleton /><Skeleton /><Skeleton /></div>
    );
  if (error || !data) return <Empty title="理财数据没有加载出来">{error}</Empty>;
  const h = data.holdings;
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>理财</h1>
          <p>先看清风险等级和流动性，再决定买不买。</p>
        </div>
        <div className="button-row">
          <Button onClick={() => onAsk("帮我推荐一下理财产品")}>
            <MessageSquareText size={15} />
            让 Agent 帮我挑
          </Button>
          <Button kind="primary" onClick={() => setAssess((v) => !v)}>
            <ShieldCheck size={15} />
            {profile ? "重新测评" : "开始风险测评"}
          </Button>
        </div>
      </div>
      <div className="wealth-top">
        <section className="panel profile-panel">
          <Gauge
            value={profile?.level || 0}
            max={5}
            color={riskColor[profile?.level || 1]}
            label={profile ? `C${profile.level}` : "未测评"}
            sub={profile ? investorName[profile.level] : data.profile?.expired ? "测评已过期" : "买理财前需要先测评"}
          />
          <div>
            <h2>{profile ? `${profile.name}投资者` : "还没有有效测评"}</h2>
            <p>
              {profile
                ? `${profile.score} 分，可以购买 R${profile.level}（${riskName[profile.level]}）及以下的产品。`
                : "按适当性规定，测评结果决定你能买的最高风险等级。"}
            </p>
            {profile && <p className="small-note">有效期至 {profile.expires_at.slice(0, 10)}</p>}
          </div>
        </section>
        <div className="metrics-band three compact">
          <div>
            <span>理财现值</span>
            <strong>{money(h.total_value_cents)}</strong>
            <small>{h.holdings.length} 笔持仓</small>
          </div>
          <div>
            <span>累计收益</span>
            <strong className="positive">+{money(h.total_income_cents)}</strong>
            <small>按年化收益逐日估算</small>
          </div>
          <div>
            <span>昨日收益</span>
            <strong>+{money(h.holdings.reduce((s, x) => s + x.yesterday_income_cents, 0))}</strong>
            <small>以产品实际净值为准</small>
          </div>
        </div>
      </div>
      {assess && (
        <section className="panel">
          <SectionHead title="风险承受能力测评" description="共 8 题，需要本人作答。Agent 不会替你选。" />
          <div className="panel-body">
            <Questionnaire
              questions={data.questionnaire}
              initial={data.profile?.answers}
              onDone={() => {
                setAssess(false);
                setShown(null);
                void reload();
              }}
            />
          </div>
        </section>
      )}
      <section className="panel">
        <SectionHead title="我的持仓" />
        <div className="table-scroll">
          <table className="data-table holdings-table">
            <thead>
              <tr><th>产品</th><th>本金</th><th>收益</th><th>持有</th><th>赎回</th><th /></tr>
            </thead>
            <tbody>
              {h.holdings.map((x) => (
                <tr key={x.id}>
                  <td>
                    <div className="product-cell">
                      <span className="risk-pill" style={{ ["--risk" as string]: riskColor[x.risk] }}>R{x.risk}</span>
                      <div><strong>{x.product_name}</strong><span className="row-sub">{x.type}</span></div>
                    </div>
                  </td>
                  <td className="tabular">{money(x.principal_cents)}</td>
                  <td className="tabular positive">+{money(x.income_cents)}</td>
                  <td>{x.days_held} 天</td>
                  <td>{x.redeemable ? x.liquidity : `还差 ${x.days_to_redeemable} 天`}</td>
                  <td>
                    <Button disabled={!x.redeemable} onClick={() => onAsk(`把${x.product_name}全部赎回`)}>赎回</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel">
        <SectionHead title="风险等级与你的上限" description="灰色区域的产品高于你的测评等级，不能购买" />
        <div className="panel-body">
          <RiskLadder level={profile?.level || 0} products={products} />
        </div>
      </section>
      <div className="report-grid">
        <section className="panel span-2">
          <SectionHead title="近一年走势" description="模拟净值，起点统一为 0%。点击下方图例显示或隐藏" />
          <div className="panel-body">
            <NavChart
              series={products
                .filter((p) => visible.includes(p.id))
                .map((p) => ({ id: p.id, name: p.name, color: riskColor[p.risk], points: p.nav, dim: !p.suitable }))}
            />
            <div className="series-toggles">
              {products.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={visible.includes(p.id)}
                  onClick={() => setShown(visible.includes(p.id) ? visible.filter((v) => v !== p.id) : [...visible, p.id])}
                  style={{ ["--risk" as string]: riskColor[p.risk] }}
                >
                  <i />{p.name}
                </button>
              ))}
            </div>
          </div>
        </section>
        <section className="panel span-2">
          <SectionHead title="收益测算" description="中间线按近一年收益复利推算，阴影是按历史波动估计的大致范围，都不代表承诺" />
          <div className="panel-body projection">
            <div className="projection-controls">
              <label>
                产品
                <select value={pick} onChange={(e) => setPick(e.target.value)}>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}（R{p.risk}）{p.suitable ? "" : " · 超出等级"}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                金额（元）
                <input type="number" min={product ? product.min_cents / 100 : 1} step={1000} value={amount}
                       onChange={(e) => setAmount(Math.max(1, Math.min(50000, Number(e.target.value) || 0)))} />
              </label>
              <label>
                持有 {months} 个月
                <input type="range" min={3} max={36} step={3} value={months} onChange={(e) => setMonths(Number(e.target.value))} />
              </label>
            </div>
            {product && projection && (
              <div className="projection-body">
                <ProjectionChart amount={amount * 100} months={months} annual={projection.annual} vol={projection.vol} color={riskColor[product.risk]} />
                <dl className="projection-figures">
                  <div><dt>中间估计</dt><dd>{money(projection.mid)}</dd></div>
                  <div><dt>收益</dt><dd className={projection.mid < amount * 100 ? "negative" : "positive"}>{money(projection.mid - amount * 100)}</dd></div>
                  <div><dt>大致范围</dt><dd>{money(projection.lo)} – {money(projection.hi)}</dd></div>
                  <div><dt>其中费用约</dt><dd>{money(projection.fee)}</dd></div>
                </dl>
                <div className="projection-action">
                  {product.suitable ? (
                    <Button kind="primary" onClick={() => onAsk(`买${amount}元${product.name}`)}>
                      交给 Agent 申购
                    </Button>
                  ) : (
                    <p className="lock-note"><Lock size={13} /> {product.name}是 R{product.risk}，高于你的测评等级，不能申购。</p>
                  )}
                  <p className="small-note">申购属于高风险操作，需要短信验证。</p>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
      <section className="panel">
        <SectionHead title="产品对比" />
        <div className="table-scroll">
          <table className="compare-table full">
            <thead>
              <tr>
                <th>产品</th><th>风险</th><th>收益参考</th><th>近一年</th><th>年化波动</th><th>最大回撤</th>
                <th>起购</th><th>流动性</th><th>费率/年</th><th>适合</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className={p.suitable ? "" : "is-locked"}>
                  <td><strong>{p.name}</strong><span>{p.type} · {p.issuer}</span></td>
                  <td><span className="risk-pill" style={{ ["--risk" as string]: riskColor[p.risk] }}>R{p.risk}</span></td>
                  <td className="tabular"><b>{p.benchmark_range || pct(p.yield_bp)}</b><span>{p.yield_label}</span></td>
                  <td className={`tabular ${p.one_year_bp < 0 ? "negative" : ""}`}>{pct(p.one_year_bp)}</td>
                  <td className="tabular">{pct(p.volatility_bp)}</td>
                  <td className="tabular">{p.max_drawdown_bp ? `-${pct(p.max_drawdown_bp)}` : "0.00%"}</td>
                  <td className="tabular">{money(p.min_cents)}</td>
                  <td>{p.liquidity}</td>
                  <td className="tabular">{pct(p.fee_bp)}</td>
                  <td className="fit-cell">{p.fit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="disclaimer padded">{data.disclaimer} 产品与数据均为模拟。</p>
      </section>
    </>
  );
}
