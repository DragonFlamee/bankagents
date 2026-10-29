// Technical figures for the 2026-10-29 deck. HTML/SVG → PNG (3x) via Playwright + Edge.
// Usage (repo root): node demo/defense-20261029/figures.mjs
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const {chromium} = require(path.resolve(import.meta.dirname, '../../node_modules/playwright'));
const out = path.join(import.meta.dirname, 'figures');
fs.mkdirSync(out, {recursive: true});

// ---- palette (shared with build-deck.mjs) ----
const C = {
  ink: '#0B1F33', muted: '#4A5B6E', quiet: '#8796A8', rule: '#D8E0EA', bg: '#F6F8FB',
  accent: '#5B50E8', accentSoft: '#EEEDFF',
  green: '#167A4A', greenSoft: '#E7F5EE', amber: '#B26A00', amberSoft: '#FFF4DE',
  red: '#B42318', redSoft: '#FDECEA', teal: '#0E7490', tealSoft: '#E3F4F8',
  slate: '#334155', slateSoft: '#EEF2F6', navy: '#122338',
};
const TONE = {
  blue: [C.accent, C.accentSoft], green: [C.green, C.greenSoft], amber: [C.amber, C.amberSoft],
  red: [C.red, C.redSoft], teal: [C.teal, C.tealSoft], slate: [C.slate, C.slateSoft], navy: [C.navy, '#E6EAF0'],
};

function fig(W, H) {
  const parts = [], svg = [], nodes = {};
  const api = {
    nodes,
    zone(x, y, w, h, label, tone = 'slate', {dash = false, strong = false, labelRight = ''} = {}) {
      const [line, soft] = TONE[tone];
      parts.push(`<div class="zone" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px;background:${soft}66;border:${strong ? 2 : 1.2}px ${dash ? 'dashed' : 'solid'} ${line}${strong ? '' : '88'}"></div>`);
      if (label) parts.push(`<div class="zlabel" style="left:${x + 12}px;top:${y - 10}px;color:${line}">${label}</div>`);
      if (labelRight) parts.push(`<div class="zlabel" style="right:${W - x - w + 12}px;top:${y - 10}px;color:${line}">${labelRight}</div>`);
    },
    lane(x, y, h, text, tone = 'slate') {
      const [line] = TONE[tone];
      parts.push(`<div class="lane" style="left:${x}px;top:${y}px;height:${h}px;border-color:${line};color:${line}">${text}</div>`);
    },
    box(id, x, y, w, h, title, sub = '', {tone = 'slate', emph = false, chip = '', code = '', fill = '#fff', center = false} = {}) {
      const [line, soft] = TONE[tone];
      nodes[id] = {x, y, w, h};
      parts.push(`<div class="box${emph ? ' emph' : ''}${center ? ' center' : ''}" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px;border-color:${emph ? line : line + '70'};background:${emph ? soft : fill}">
        <i style="background:${line}"></i><b>${title}</b>${sub ? `<span>${sub}</span>` : ''}${code ? `<code>${code}</code>` : ''}${chip ? `<em style="color:${line};border-color:${line}55">${chip}</em>` : ''}</div>`);
    },
    pill(x, y, text, tone = 'slate', {solid = false, size = 12} = {}) {
      const [line, soft] = TONE[tone];
      parts.push(`<div class="pill" style="left:${x}px;top:${y}px;font-size:${size}px;color:${solid ? '#fff' : line};background:${solid ? line : soft};border-color:${line}55">${text}</div>`);
    },
    text(x, y, html, style = '') { parts.push(`<div class="t" style="left:${x}px;top:${y}px;${style}">${html}</div>`); },
    raw(html) { parts.push(html); },
    svg(s) { svg.push(s); },
    // orthogonal edge through points; label at segment index
    edge(pts, {color = C.slate, dash = false, label = '', at = 0.5, seg = null, w = 1.6, head = true, lx = 0, ly = 0, ltone = null} = {}) {
      const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join(' ');
      const mid = color.replace('#', '');
      svg.push(`<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" ${dash ? 'stroke-dasharray="5 4"' : ''} stroke-linejoin="round" ${head ? `marker-end="url(#a${mid})"` : ''}/>`);
      markers.add(color);
      if (label) {
        const k = seg ?? Math.floor((pts.length - 1) / 2);
        const [a, b] = [pts[k], pts[k + 1]];
        const px = a[0] + (b[0] - a[0]) * at + lx, py = a[1] + (b[1] - a[1]) * at + ly;
        parts.push(`<div class="elabel" style="left:${px}px;top:${py}px;color:${ltone || color}">${label}</div>`);
      }
    },
    a(id, side, t = 0.5) {
      const n = nodes[id];
      if (side === 'l') return [n.x, n.y + n.h * t];
      if (side === 'r') return [n.x + n.w, n.y + n.h * t];
      if (side === 't') return [n.x + n.w * t, n.y];
      return [n.x + n.w * t, n.y + n.h];
    },
    html() {
      const defs = [...markers].map((c) => `<marker id="a${c.replace('#', '')}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${c}"/></marker>`).join('');
      return `<!doctype html><meta charset="utf-8"><style>${CSS}</style><div id="c" style="width:${W}px;height:${H}px">${parts.join('\n')}<svg width="${W}" height="${H}"><defs>${defs}</defs>${svg.join('\n')}</svg></div>`;
    },
  };
  const markers = new Set();
  return api;
}

const CSS = `
*{box-sizing:border-box;margin:0}
body{background:#fff}
#c{position:relative;font-family:"Microsoft YaHei","PingFang SC",sans-serif;color:${C.ink};background:#fff;overflow:hidden}
svg{position:absolute;left:0;top:0;pointer-events:none;z-index:3}
.zone{position:absolute;border-radius:12px;z-index:0}
.zlabel{position:absolute;font-size:12.5px;font-weight:700;letter-spacing:.04em;background:#fff;padding:0 7px;z-index:2;line-height:20px}
.lane{position:absolute;width:30px;border-left:3px solid;display:flex;align-items:center;justify-content:center;writing-mode:vertical-rl;letter-spacing:.3em;font-size:13px;font-weight:700;z-index:1}
.box{position:absolute;border:1.2px solid;border-radius:8px;padding:9px 12px 8px 16px;z-index:2;overflow:hidden;box-shadow:0 1px 2px rgba(15,30,50,.06)}
.box.emph{border-width:2px;box-shadow:0 4px 14px rgba(40,40,120,.10)}
.box.center{text-align:center;padding-left:12px}
.box i{position:absolute;left:0;top:0;bottom:0;width:4px}
.box b{display:block;font-size:15.5px;line-height:21px;font-weight:700}
.box span{display:block;font-size:12.5px;line-height:18px;color:${C.muted};margin-top:3px}
.box code{display:block;font:12px/17px Consolas,"Cascadia Mono",monospace;color:${C.slate};margin-top:4px;white-space:pre}
.box em{position:absolute;right:8px;top:8px;font:600 11px/16px Consolas,monospace;font-style:normal;border:1px solid;border-radius:4px;padding:0 5px;background:#fff}
.pill{position:absolute;border:1px solid;border-radius:999px;padding:1px 9px;font-weight:600;line-height:18px;white-space:nowrap;z-index:4}
.t{position:absolute;z-index:4;font-size:12.5px;line-height:18px;color:${C.muted}}
.elabel{position:absolute;transform:translate(-50%,-50%);background:#fff;font-size:11.5px;font-weight:600;padding:0 5px;line-height:16px;white-space:nowrap;z-index:5;border-radius:3px}
.mono{font-family:Consolas,"Cascadia Mono",monospace}
.legend{position:absolute;display:flex;gap:18px;font-size:11.5px;color:${C.muted};z-index:4;align-items:center}
.legend s{display:inline-block;width:22px;height:0;border-top:2px solid;vertical-align:middle;margin-right:5px}
`;

const figures = {};

// ======================= F1 architecture =======================
figures.architecture = () => {
  const W = 1200, H = 600, f = fig(W, H);
  const X = [96, 360, 624, 888], w = 246, rows = [34, 170, 306, 448];
  f.lane(18, rows[0] - 6, 92, '交互', 'blue');
  f.lane(18, rows[1] - 6, 92, '规划', 'red');
  f.lane(18, rows[2] - 6, 92, '编排', 'slate');
  f.lane(18, rows[3] - 6, 106, '银行', 'green');
  // zones
  f.zone(80, rows[0] - 16, 1070, 112, '接入层 · 同源 HTTP', 'blue');
  f.zone(80, rows[1] - 16, 1070, 112, '规划层', 'slate');
  f.zone(X[1] - 10, rows[1] - 8, w + 20, 96, '', 'red', {dash: true});
  f.zone(80, rows[2] - 16, 1070, 112, '持久化编排 · orchestrator.py', 'slate');
  f.zone(80, rows[3] - 16, 1070, 128, '银行服务 · bank.py', 'green', {strong: true, labelRight: '可信边界：风险、授权与资金只在此判定'});
  // row 1
  f.box('ui', X[0], rows[0], w, 80, 'React 工作台', '连续对话 · 执行过程 · 结果卡片', {tone: 'navy'});
  f.box('api', X[1], rows[0], w, 80, '同源 API', '会话定归属 · CSRF · Origin 校验', {tone: 'blue', chip: 'sessions.sqlite3'});
  f.box('op', X[2], rows[0], w, 80, '操作员工作台', '人工接管 · 填写说明 · 交还客户', {tone: 'slate'});
  f.box('auth', X[3], rows[0], w, 80, '独立授权面板', '本人确认 · 操作绑定 OTP', {tone: 'amber', emph: true});
  // row 2
  f.box('plan', X[1], rows[1], w, 80, '候选规划器', 'LLM qwen3.8-flash / 离线规则<br>输出候选 DAG JSON', {tone: 'red', chip: '不可信'});
  f.box('contract', X[2], rows[1], w, 80, '工具契约 + DAG 校验', '白名单 · 整数分 · 引用 · 无环', {tone: 'blue', emph: true});
  f.text(X[0] + 8, rows[1] + 14, '<b style="color:#B42318">模型输出 = 候选</b><br>不能直接记账、<br>授权或读取 OTP', 'font-size:12.5px');
  f.text(X[3] + 30, rows[1] + 16, '<b style="color:#B26A00">授权不经过模型</b><br>确认与验证码<br>直达银行服务', 'font-size:12.5px');
  // row 3
  f.box('ans', X[0], rows[2], w, 80, '事实回答组织', '工具事实 → 段落 → response.delta', {tone: 'teal'});
  f.box('orch', X[1], rows[2], w * 2 + 18, 80, '编排器：只推进前置成功的节点', '依赖推进 · 检查点 · 暂停 / 人工接管 / 取消 · 读写分离', {tone: 'slate', emph: true, chip: 'agent.sqlite3'});
  f.box('sbx', X[3], rows[2], w, 80, '受限计算 worker', 'AST 白名单 · 128 MiB · 2 s CPU', {tone: 'slate'});
  // row 4 bank
  const bw = 236, by = rows[3] + 4;
  const BX = [100, 362, 624, 886];
  f.box('risk', BX[0], by, bw, 84, '① 风险分级', '绿 自动 · 黄 确认 · 红 强验证<br>日累计 &gt; 1000 元升级', {tone: 'green'});
  f.box('verify', BX[1], by, bw, 84, '② 授权校验', '归属 · 期限 · 一次消费<br>参数指纹必须一致', {tone: 'green'});
  f.box('tx', BX[2], by, bw, 84, '③ 幂等 + 事务', '同键同参复用原操作<br>BEGIN IMMEDIATE 单事务', {tone: 'green'});
  f.box('rcpt', BX[3], by, bw, 84, '④ 回执与审计', 'receipt · hash 链 · 脱敏', {tone: 'green', chip: 'bank.sqlite3'});
  for (const [a, b] of [['risk', 'verify'], ['verify', 'tx'], ['tx', 'rcpt']]) f.edge([f.a(a, 'r'), f.a(b, 'l')], {color: C.green});
  // edges
  f.edge([f.a('ui', 'r'), f.a('api', 'l')], {color: C.accent});
  f.edge([f.a('op', 'l'), f.a('api', 'r')], {color: C.slate});
  f.edge([f.a('api', 'b'), f.a('plan', 't')], {color: C.accent, label: '用户目标 + 会话上下文'});
  f.edge([f.a('plan', 'r'), f.a('contract', 'l')], {color: C.red});
  f.edge([f.a('contract', 'b'), [f.a('contract', 'b')[0], rows[2]]], {color: C.accent, label: '通过才持久化'});
  f.edge([[X[1] + 120, rows[2] + 80], [X[1] + 120, by]], {color: C.slate, label: '准备 / 提交 operation'});
  f.edge([f.a('orch', 'l'), f.a('ans', 'r')], {color: C.teal});
  f.edge([[X[0] + 215, rows[2]], [X[0] + 215, rows[0] + 80]], {color: C.teal, label: '逐段推送', at: 0.12});
  f.edge([f.a('orch', 'r'), f.a('sbx', 'l')], {color: C.slate});
  // auth rail outside zones
  const rx = 1172;
  f.edge([f.a('auth', 'r'), [rx, rows[0] + 40], [rx, by + 42], [1150, by + 42]], {color: C.amber, w: 2.2});
  
  // footer
  f.raw(`<div class="legend" style="left:96px;top:${H - 30}px"><span><s style="border-color:${C.accent}"></s>请求 / 计划</span><span><s style="border-color:${C.green}"></s>银行内部步骤</span><span><s style="border-color:${C.amber}"></s>本人授权通道</span><span><s style="border-color:${C.red};border-top-style:dashed"></s>不可信边界</span><span style="margin-left:16px;color:${C.ink}">三个 SQLite 分库，不构成同一原子事务 → 恢复须按原 operation 对账</span></div>`);
  return f;
};

// ======================= F2 request lifecycle =======================
figures.lifecycle = () => {
  const W = 640, H = 470, f = fig(W, H);
  const cols = [20, 168, 430];
  f.text(cols[0], 4, '阶段', `font-weight:700;color:${C.quiet};font-size:12px;letter-spacing:.1em`);
  f.text(cols[1], 4, '持久化事件 run_journal', `font-weight:700;color:${C.quiet};font-size:12px;letter-spacing:.1em`);
  f.text(cols[2], 4, '关联标识', `font-weight:700;color:${C.quiet};font-size:12px;letter-spacing:.1em`);
  const st = [
    ['① 提交运行', '会话确定用户', ['run.created', 'conversation.turn'], 'run_id', 'blue'],
    ['② 候选计划', '服务端校验', ['model.completed', 'plan.validated'], 'plan_id', 'red'],
    ['③ 执行 / 等待授权', '记录输入与观测', ['tool.started', 'tool.result', 'authorization.required'], 'node_id · operation_id', 'amber'],
    ['④ 核验后回答', '依据回执逐段展示', ['response.delta', 'run.completed'], 'receipt_id', 'green'],
  ];
  st.forEach(([t, s, ev, id, tone], i) => {
    const y = 34 + i * 106;
    f.box('s' + i, cols[0], y, 132, 86, t, s, {tone, emph: i === 2});
    ev.forEach((e, k) => f.pill(cols[1] + (k % 2) * 128, y + 12 + Math.floor(k / 2) * 30, e, 'slate', {size: 11.5}));
    f.raw(`<div class="t mono" style="left:${cols[2]}px;top:${y + 30}px;font-size:13px;color:${C.ink};font-weight:700">${id}</div>`);
    f.edge([f.a('s' + i, 'r'), [cols[1] - 6, y + 43]], {color: C.quiet, w: 1.2});
    if (i < 3) f.edge([f.a('s' + i, 'b'), [cols[0] + 66, y + 106]], {color: C.slate});
  });
  // id chain rail
  f.edge([[cols[2] - 12, 70], [cols[2] - 12, 386]], {color: C.accent, w: 2, label: '', head: true});
  f.text(cols[1], 440, '同一条行动记录：可从回执回溯到原始请求', `color:${C.accent};font-weight:700`);
  return f;
};

// ======================= F3 DAG validation gates =======================
figures.validation = () => {
  const W = 1200, H = 410, f = fig(W, H);
  // input candidate json
  f.box('in', 10, 40, 230, 250, '候选 DAG（模型输出）', '', {tone: 'red', code:
`{"nodes":[
 {"id":"n3",
  "tool":"funds.hold",
  "args":{"amount_cents":
          100000},
  "deps":["n2"]},
 {"id":"n4",
  "tool":"merchant.order",
  "args":{"hold_id":
     "$n3.hold_id"},
  "deps":["n3"]} ]}`});
  const G = [
    ['第 1 关', '工具与字段', '共享注册表；拒绝未知工具、额外字段与伪造 user_id', 'transfer_all ✕'],
    ['第 2 关', '参数与精度', '金额一律整数分；类型与范围由服务端复核', '300.5 元 ✕ → 30000 分 ✓'],
    ['第 3 关', '依赖与引用', 'ID 唯一、依赖存在；回执字段只能引用直接前置', '$n1.hold_id ✕'],
    ['第 4 关', '无环可推进', '反复寻找依赖已满足节点；一轮无进展即拒绝', 'n4 → n5 → n4 ✕'],
  ];
  const gx = (i) => 290 + i * 200;
  G.forEach(([k, t, s, bad], i) => {
    const x = gx(i);
    f.raw(`<div style="position:absolute;left:${x}px;top:30px;width:170px;height:270px;border-radius:10px;background:${C.accentSoft};border:1.2px solid ${C.accent}55;z-index:1"></div>`);
    f.text(x + 14, 42, `<span style="color:${C.accent};font-weight:700">${k}</span>`);
    f.text(x + 14, 64, `<b style="font-size:16px;color:${C.ink}">${t}</b>`);
    f.text(x + 14, 92, s, 'font-size:12.5px;width:150px');
    // gate bar
    f.raw(`<div style="position:absolute;left:${x + 70}px;top:160px;width:30px;height:60px;border-radius:6px;background:${C.accent};z-index:2;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700">✓</div>`);
    f.edge([[x + 85, 220], [x + 85, 322]], {color: C.red, dash: true, w: 1.4});
    f.raw(`<div class="pill mono" style="left:${x + 6}px;top:330px;color:${C.red};background:${C.redSoft};border-color:${C.red}55;font-size:11.5px">${bad}</div>`);
  });
  // main flow line
  f.edge([[240, 190], [gx(0) + 70, 190]], {color: C.ink, w: 2});
  for (let i = 0; i < 3; i++) f.edge([[gx(i) + 100, 190], [gx(i + 1) + 70, 190]], {color: C.ink, w: 2});
  f.edge([[gx(3) + 100, 190], [1080, 190]], {color: C.green, w: 2.4});
  f.box('ok', 1082, 130, 108, 120, '可执行计划', '持久化为<br>plan / nodes<br>≤ 12 节点', {tone: 'green', emph: true, center: true});
  f.text(290, 372, `<span style="color:${C.red};font-weight:700">任一关失败 → 整个计划拒绝，不执行任何节点</span>　　有界反复扫描，非 Kahn 队列；校验保证“候选合法”，不证明意图理解正确`, 'font-size:12.5px');
  return f;
};

// ======================= F4 executor state machine =======================
figures.execution = () => {
  const W = 1200, H = 400, f = fig(W, H);
  f.box('scan', 20, 150, 170, 84, '扫描 pending 节点', '按依赖顺序，有界', {tone: 'slate', emph: true});
  f.box('chk', 250, 150, 170, 84, '前置全部成功？', 'deps.status = succeeded', {tone: 'blue'});
  f.box('stop', 250, 300, 170, 70, '停止后继', '前置失败 / 取消 / 接管', {tone: 'red'});
  f.box('read', 490, 40, 200, 84, '读工具', '查询事实，保存观测<br>tool.result', {tone: 'green'});
  f.box('prep', 490, 236, 200, 84, '写工具：准备操作', '幂等键 plan_id:node_id<br>保存原 operation_id', {tone: 'amber'});
  f.box('wait', 760, 236, 190, 84, '等待独立授权', 'authorization.required<br>任务在此暂停', {tone: 'amber', emph: true});
  f.box('commit', 1010, 236, 170, 84, '银行事务提交', '返回 receipt', {tone: 'green'});
  f.box('done', 1010, 40, 170, 84, '节点 succeeded', '写检查点', {tone: 'green', emph: true});
  f.edge([f.a('scan', 'r'), f.a('chk', 'l')], {color: C.slate});
  f.edge([f.a('chk', 'b'), f.a('stop', 't')], {color: C.red, label: '否'});
  f.edge([[420, 175], [455, 175], [455, 82], [490, 82]], {color: C.green, label: '是 · 读', seg: 1});
  f.edge([[420, 210], [455, 210], [455, 278], [490, 278]], {color: C.amber, label: '是 · 写', seg: 1});
  f.edge([f.a('read', 'r'), f.a('done', 'l')], {color: C.green});
  f.edge([f.a('prep', 'r'), f.a('wait', 'l')], {color: C.amber});
  f.edge([f.a('wait', 'r'), f.a('commit', 'l')], {color: C.amber, label: '本人确认 / OTP', ly: -14});
  f.edge([f.a('commit', 't'), f.a('done', 'b')], {color: C.green});
  // loop back
  f.edge([[1095, 40], [1095, 14], [105, 14], [105, 150]], {color: C.accent, dash: true, label: '回到同一计划继续扫描（不重新规划）', seg: 1});
  f.raw(`<div style="position:absolute;left:470px;top:345px;width:710px;padding:8px 14px;border-radius:8px;background:${C.redSoft};border:1px solid ${C.red}44;font-size:12.5px;line-height:19px;color:${C.ink};z-index:4"><b style="color:${C.red}">边界</b>　取消任务不撤回已提交资金，不显示为退款；单进程锁 + 有序扫描，不声称多 worker 并行</div>`);
  return f;
};

// ======================= F5 birthday DAG =======================
figures.birthday = () => {
  const W = 700, H = 470, f = fig(W, H);
  f.box('n1', 20, 30, 190, 74, 'n1 查纪念日', 'events → 周屿 11/10', {tone: 'green', chip: '绿'});
  f.box('n2', 20, 150, 190, 74, 'n2 查可用余额', 'balance → ¥28,650.00', {tone: 'green', chip: '绿'});
  f.box('n3', 260, 150, 200, 74, 'n3 锁定 ¥1,000', 'funds.hold → hold_id', {tone: 'amber', emph: true, chip: '黄'});
  f.box('n4', 500, 60, 190, 84, 'n4 鲜花 ¥299', '19 枝红玫瑰 · 11/08<br><span class="mono">hold_id=$n3.hold_id</span>', {tone: 'amber', chip: '黄'});
  f.box('n5', 500, 230, 190, 84, 'n5 蛋糕 ¥268', '6 寸草莓慕斯 · 11/08<br><span class="mono">hold_id=$n3.hold_id</span>', {tone: 'amber', chip: '黄'});
  f.edge([f.a('n1', 'b'), f.a('n2', 't')], {color: C.slate});
  f.edge([f.a('n2', 'r'), f.a('n3', 'l')], {color: C.slate});
  f.edge([[460, 175], [480, 175], [480, 102], [500, 102]], {color: C.amber, label: '引用回执', seg: 1, lx: -2});
  f.edge([[460, 200], [480, 200], [480, 272], [500, 272]], {color: C.amber});
  // budget bar
  const bx = 20, by = 360, bw = 670;
  f.text(bx, by - 30, `<b style="color:${C.ink};font-size:13.5px">锁定额度使用</b>　可用余额 ¥28,650 → ¥27,650；11/11 自动释放剩余额度`);
  const seg = [[299, '鲜花 ¥299', C.amber], [268, '蛋糕 ¥268', '#D9921C'], [433, '剩余 ¥433', '#CBD5E1']];
  let x = bx;
  for (const [v, l, c] of seg) {
    const w = bw * v / 1000;
    f.raw(`<div style="position:absolute;left:${x}px;top:${by}px;width:${w - 3}px;height:34px;background:${c};border-radius:5px;z-index:2;color:${c === '#CBD5E1' ? C.ink : '#fff'};font-size:13px;font-weight:700;display:flex;align-items:center;padding-left:10px">${l}</div>`);
    x += w;
  }
  f.text(bx, by + 44, '预约已创建 ≠ 已付款：商户付款在到期日从锁定资金发生（模拟）');
  return f;
};

// ======================= F6 authorization binding =======================
figures.authorization = () => {
  const W = 780, H = 450, f = fig(W, H);
  f.box('op', 20, 30, 230, 104, '已保存的 operation', '', {tone: 'slate', code: 'op_id   = op_7f3…\nparams  = {to: 李娜,\n           amount: 120000}'});
  f.box('fp', 20, 180, 230, 70, '参数指纹', '', {tone: 'blue', code: 'fp = H(canonical(params))'});
  f.box('ch', 300, 30, 230, 120, '验证挑战 challenge', '', {tone: 'amber', emph: true, code: 'challenge_id\nop_id · fp\nexpires_at\nused = false'});
  f.box('otp', 300, 200, 230, 70, 'OTP 摘要', '', {tone: 'amber', code: 'H(otp, challenge_id, fp)'});
  f.edge([f.a('op', 'b'), f.a('fp', 't')], {color: C.slate});
  f.edge([f.a('op', 'r', .4), [300, 72]], {color: C.slate});
  f.edge([f.a('fp', 'r'), [275, 215], [275, 120], [300, 120]], {color: C.blue || C.accent});
  f.edge([f.a('ch', 'b'), f.a('otp', 't')], {color: C.amber});
  // checks
  const cx = 580, checks = ['账户归属一致', '未过期', '未被消费（一次性）', '指纹与当前参数一致', '提交前复核业务条件'];
  f.raw(`<div style="position:absolute;left:${cx}px;top:30px;width:185px;height:244px;border-radius:10px;border:2px solid ${C.green};background:${C.greenSoft};z-index:1"></div>`);
  f.text(cx + 14, 40, `<b style="color:${C.green};font-size:14px">服务端校验</b>`);
  checks.forEach((c, i) => f.text(cx + 14, 72 + i * 38, `<span style="color:${C.green};font-weight:700">✓</span>　${c}`, `color:${C.ink};font-size:13px`));
  f.edge([f.a('otp', 'r'), [cx, 235]], {color: C.amber});
  f.edge([[cx + 92, 274], [cx + 92, 318]], {color: C.green, label: '全部通过 → 提交事务', at: 0.5, lx: 0});
  // failure lanes
  const fy = 330;
  f.raw(`<div style="position:absolute;left:20px;top:${fy}px;width:745px;height:104px;border-radius:10px;border:1.2px dashed ${C.red};background:${C.redSoft}88;z-index:1"></div>`);
  f.text(36, fy + 12, `<b style="color:${C.red}">参数被改</b><br>金额 1200 → 5000：指纹不符，旧凭据作废，必须重新授权`, 'width:230px');
  f.text(290, fy + 12, `<b style="color:${C.red}">连续失败</b><br>验证失败累计 3 次 → 临时锁定（熔断）`, 'width:220px');
  f.text(530, fy + 12, `<b style="color:${C.red}">聊天里说“我已确认”</b><br>不构成授权；模型看不到 OTP`, 'width:225px');
  return f;
};

// ======================= F7 idempotency + transaction =======================
figures.idempotency = () => {
  const W = 1200, H = 410, f = fig(W, H);
  f.box('req', 20, 150, 180, 84, '写请求', '', {tone: 'slate', code: 'key = plan:node\nparams'});
  f.box('lk', 250, 150, 170, 84, '查幂等键', 'idempotency_key', {tone: 'blue', emph: true});
  f.box('same', 480, 26, 220, 74, '同键 · 同参数', '返回原 operation，不重复扣款', {tone: 'green'});
  f.box('diff', 480, 310, 220, 74, '同键 · 参数不同', '拒绝（冲突），需新授权', {tone: 'red'});
  f.edge([f.a('req', 'r'), f.a('lk', 'l')], {color: C.slate});
  f.edge([[420, 172], [450, 172], [450, 63], [480, 63]], {color: C.green, seg: 1});
  f.edge([[420, 212], [450, 212], [450, 347], [480, 347]], {color: C.red, seg: 1});
  f.edge([f.a('lk', 'r'), [740, 192]], {color: C.ink, w: 2, label: '新键', ly: -12});
  // transaction box
  f.raw(`<div style="position:absolute;left:740px;top:120px;width:240px;height:150px;border-radius:10px;border:2px solid ${C.green};background:${C.greenSoft};z-index:1"></div>`);
  f.text(756, 130, `<span class="mono" style="color:${C.green};font-weight:700">BEGIN IMMEDIATE</span>`);
  ['付款方余额 −a', '借贷分录：−a / +a，合计 0', '交易 + 回执 receipt', '审计事件（脱敏）'].forEach((t, i) => f.text(756, 156 + i * 22, '· ' + t, `color:${C.ink}`));
  f.text(756, 246, `<span class="mono" style="color:${C.green};font-weight:700">COMMIT</span>`);
  f.edge([[980, 195], [1020, 195]], {color: C.green});
  f.box('ok', 1022, 150, 160, 84, 'succeeded', '回执可核对', {tone: 'green', emph: true});
  // unknown path
  f.edge([[860, 270], [860, 330]], {color: C.amber, dash: true, label: '提交后响应丢失'});
  f.box('unk', 760, 332, 200, 64, '状态 unknown', '不重新建单', {tone: 'amber'});
  f.edge([f.a('unk', 'r'), [1022, 364]], {color: C.amber, label: '按原 ID 对账', ly: -12});
  f.box('rec', 1022, 332, 160, 64, 'reconcile', '确认成功或失败', {tone: 'amber'});
  return f;
};

// ======================= F8 answer grounding =======================
figures.grounding = () => {
  const W = 700, H = 450, f = fig(W, H);
  f.box('obs', 20, 20, 300, 96, '工具观测', '', {tone: 'slate', code: 'bills.analyze → 支出 1086980 分\nanomaly → 海外线上商户 198000 分'});
  f.box('fact', 20, 150, 300, 110, '确定性事实与候选段落', '', {tone: 'blue', emph: true, code: 'P1 本月支出 ¥10,869.80\nP2 3 笔需要核对（规则提示）\nP3 购物较上期 +¥3,115.80'});
  f.box('llm', 380, 150, 300, 110, '回答模型', '只按问题选择段落 ID', {tone: 'red', code: '→ ["P2","P1"]'});
  f.box('map', 380, 300, 300, 76, '服务端映射 ID → 已核验文字', '未知 ID 丢弃；金额不由模型书写', {tone: 'green', emph: true});
  f.box('ui', 20, 300, 300, 76, '逐段推送 response.delta', '前端按段显示，可展开依据', {tone: 'teal'});
  f.edge([f.a('obs', 'b'), f.a('fact', 't')], {color: C.slate});
  f.edge([f.a('fact', 'r'), f.a('llm', 'l')], {color: C.red, label: '仅段落 ID 与摘要', ly: -12});
  f.edge([f.a('llm', 'b'), f.a('map', 't')], {color: C.red});
  f.edge([f.a('map', 'l'), f.a('ui', 'r')], {color: C.green});
  f.text(20, 400, `<b style="color:${C.ink}">回答失败时</b>：保留已完成查询，不重做业务、不编造成功`, 'font-size:13px');
  return f;
};

// ======================= F9 anomaly method =======================
figures.anomaly = () => {
  const W = 1200, H = 330, f = fig(W, H);
  // dot plot
  const px = 30, py = 40, pw = 560, ph = 210;
  f.raw(`<div style="position:absolute;left:${px}px;top:${py}px;width:${pw}px;height:${ph}px;border-left:1px solid ${C.rule};border-bottom:1px solid ${C.rule};z-index:1"></div>`);
  const vals = [86, 120, 132, 145, 150, 158, 166, 172, 180, 188, 196, 210, 228, 236, 260, 1980];
  const sx = (v) => px + 20 + (v / 2100) * (pw - 40);
  vals.forEach((v, i) => {
    const out = v > 1000;
    f.raw(`<div style="position:absolute;left:${sx(v) - 6}px;top:${py + ph - 40 - (i % 5) * 26 - (out ? 60 : 0)}px;width:12px;height:12px;border-radius:50%;background:${out ? C.red : C.accent}${out ? '' : '99'};z-index:3"></div>`);
  });
  const med = sx(176);
  f.raw(`<div style="position:absolute;left:${med}px;top:${py}px;height:${ph}px;border-left:2px dashed ${C.green};z-index:2"></div>`);
  f.pill(med + 6, py + 6, '中位数 ¥176', 'green', {size: 11.5});
  f.raw(`<div style="position:absolute;left:${sx(176 - 40)}px;top:${py + ph - 18}px;width:${sx(216) - sx(136)}px;height:8px;background:${C.green}44;z-index:2"></div>`);
  f.pill(sx(1980) - 200, py + 80, '海外线上商户 ¥1,980 · z ≫ 3.5', 'red', {size: 11.5});
  [0, 500, 1000, 1500, 2000].forEach((v) => f.text(sx(v) - 14, py + ph + 6, v ? '¥' + v.toLocaleString() : '0', 'font-size:11px;color:#8796A8'));
  f.text(px, py + ph + 30, '同类商户历史消费金额（模拟账户，示意分布）', 'font-size:12px');
  // formula
  f.raw(`<div style="position:absolute;left:640px;top:40px;width:540px;height:96px;border-radius:10px;background:${C.accentSoft};border:1.2px solid ${C.accent}55;z-index:1"></div>`);
  f.text(660, 52, `<span style="font:italic 700 21px 'Cambria Math',Cambria,serif;color:${C.ink}">M<sub>i</sub> = 0.6745 · (x<sub>i</sub> − x̃) / MAD</span>`);
  f.text(660, 92, '同类历史 ≥ 5 笔且 MAD &gt; 0 时启用；|M| &gt; 3.5 且超过金额下限才提示', 'font-size:12.5px;width:510px');
  const rules = [['境外商户', 'amber'], ['凌晨 0–5 点', 'amber'], ['首次出现商户', 'amber'], ['10 分钟内重复扣款', 'amber']];
  f.text(640, 156, `<b style="color:${C.ink}">并行业务规则</b>`);
  rules.forEach(([r, t], i) => f.pill(640 + i * 134, 182, r, t, {size: 12}));
  f.raw(`<div style="position:absolute;left:640px;top:226px;width:540px;padding:10px 14px;border-radius:8px;border:1px solid ${C.rule};background:${C.bg};font-size:12.5px;line-height:19px;z-index:3;color:${C.ink}">输出：<b>待核对线索</b> + 原因标签 + 来源交易 ID<br><span style="color:${C.red}">不自动认定欺诈；当前未训练机器学习分类模型</span></div>`);
  return f;
};

const browser = await chromium.launch({channel: 'msedge'});
const page = await browser.newPage({deviceScaleFactor: 3});
const manifest = {};
for (const [name, make] of Object.entries(figures)) {
  const f = make();
  const html = f.html();
  fs.writeFileSync(path.join(out, name + '.html'), html);
  await page.setContent(html);
  await page.evaluate(() => document.fonts.ready);
  const el = await page.$('#c');
  const box = await el.boundingBox();
  await el.screenshot({path: path.join(out, name + '.png')});
  manifest[name] = {w: box.width, h: box.height};
  console.log(name, box.width, box.height);
}
fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));
await browser.close();
