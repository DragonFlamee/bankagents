// Reproducible, source-editable technical figures. The skill builds the PPTX.
import fs from 'node:fs/promises';import path from 'node:path';
const base=import.meta.dirname,out=path.join(base,'assets/diagrams');await fs.mkdir(out,{recursive:true});
const C={ink:'#11243B',muted:'#42556B',blue:'#245D9B',gold:'#B58A2B',red:'#A74335',line:'#BFCFDF',pale:'#F1F5FA',white:'#FFFFFF',goldPale:'#FFF5DC'};
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
function canvas(w=1200,h=430){let a=[`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs><marker id="a" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0L8 4L0 8" fill="none" stroke="${C.blue}" stroke-width="1.4"/></marker></defs><rect width="${w}" height="${h}" fill="white"/><g font-family="Microsoft YaHei,sans-serif">`];return{a,text(t,x,y,size=30,color=C.ink,bold=false){String(t).split('\n').forEach((v,i)=>a.push(`<text x="${x}" y="${y+i*size*1.35}" font-size="${size}" fill="${color}" font-weight="${bold?700:400}">${esc(v)}</text>`));},box(x,y,w,h,title,body='',tone='blue'){const fill=tone==='dark'?C.ink:tone==='gold'?C.goldPale:C.pale,fg=tone==='dark'?C.white:C.ink;a.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="7" fill="${fill}" stroke="${C.line}" stroke-width="1.4"/>`);this.text(title,x+20,y+39,32,fg,true);if(body)this.text(body,x+20,y+74,23,tone==='dark'?'#C6D4E3':C.muted);},edge(d){a.push(`<path d="${d}" fill="none" stroke="${C.blue}" stroke-width="2.4" marker-end="url(#a)"/>`);},rule(x,y,w,color=C.line){a.push(`<path d="M${x} ${y}h${w}" fill="none" stroke="${color}"/>`);},finish(){return a.join('')+'</g></svg>';}};}
const figures=[];
async function save(name,g,meaning){await fs.writeFile(path.join(out,name+'.svg'),g.finish());figures.push({name,source:'assets/diagrams/'+name+'.svg',png:'assets/diagrams/'+name+'.png',meaning});}

// A. Architecture separates proposal, execution, and persistent evidence.
let g=canvas();
g.box(12,10,345,90,'React 工作台','连续对话、过程、结果','dark');
g.box(424,10,345,90,'同源 API','sessions.sqlite3 / CSRF');
g.box(836,10,352,90,'独立授权面板','本人确认、操作绑定 OTP','gold');
g.edge('M357 66H417');g.edge('M769 66H829');
g.box(12,175,250,90,'候选规划','LLM / 离线规则');
g.box(318,175,250,90,'工具契约','参数 + DAG 校验');
g.box(624,175,250,90,'持久化编排','依赖、检查点');
g.box(930,175,258,90,'银行服务','权限、幂等、回执');
g.edge('M596 100V140H137V167');g.edge('M1012 100V140H1060V167');
g.edge('M262 221H311');g.edge('M568 221H617');g.edge('M874 221H923');
g.box(12,330,345,90,'受限分析 worker','AST 解释、资源限制');
g.box(424,330,345,90,'计划与运行记录','agent.sqlite3 / events');
g.box(836,330,352,90,'模拟业务账本','bank.sqlite3');
g.edge('M675 265V300H185V322');g.edge('M748 265V300H596V322');g.edge('M1059 265V300H1012V322');
await save('architecture',g,'架构与可信边界，模型不能直接记账或读取OTP');

// B. Saved execution state and eligibility, rather than decorative thinking.
g=canvas();
g.box(15,10,355,125,'扫描 pending 节点','全部前置成功才执行\n前置失败或取消则停止后继');
g.box(430,10,355,125,'读工具直接观测','读取所属用户数据\n保存 result 与来源');
g.box(430,220,355,125,'写工具准备操作','复用 plan_id:node_id\n保存原 operation_id','gold');
g.box(845,220,340,125,'等待独立授权','确认 / 验证通过才提交\n用回执继续推进','gold');
g.edge('M370 75H422');g.edge('M191 135V282H422');g.edge('M785 282H837');
g.edge('M1014 345V376H191V143');g.text('状态更新后继续检查，停止 / 接管阻止后续自动执行',15,418,29,C.blue,true);
await save('execution',g,'节点资格、读写分流、原操作与保存状态');

// C. Exact birthday DAG and the receipt field used by dependent nodes.
const ev=JSON.parse(await fs.readFile(path.join(base,'data/birthday-evidence.json'),'utf8'));
const nodes=ev.initial_plan.nodes;const hold=nodes.find(n=>n.tool==='funds.hold');
g=canvas();
g.box(12,155,228,115,'查纪念日','life.events');g.box(282,155,228,115,'查可用余额','balance');
g.box(552,155,281,125,'锁定 ¥1,000','funds.hold\n等待本人确认','gold');
g.box(902,10,285,125,'鲜花 ¥299','merchant.order\n确认后形成预约','gold');
g.box(902,280,285,125,'蛋糕 ¥268','merchant.order\n确认后形成预约','gold');
g.edge('M240 213H274');g.edge('M510 213H544');g.edge('M833 217H866V72H894');g.edge('M866 217V342H894');
g.text('订单参数引用前置锁定回执',12,345,33,C.blue,true);g.text(`hold_id = $${hold.id}.hold_id`,12,402,29,C.ink);
await save('birthday-dag',g,'由实际离线计划生成的五节点分支及回执引用');

// D. Authorization is server state bound to an immutable operation.
g=canvas();
g.box(12,165,278,120,'待本人确认','固定参数与操作指纹','gold');
g.box(460,10,330,120,'黄色：再次检查','风险不升级才执行');
g.box(460,280,330,135,'红色：验证挑战','操作ID与参数指纹\n期限与一次消费','gold');
g.box(910,165,278,120,'业务事务','校验、记账、回执');
g.edge('M290 224H365V70H452');g.edge('M365 224V347H452');g.edge('M790 70H847V223H902');g.edge('M790 347H847V240');
await save('authorization',g,'普通操作的授权门控，预约实际日累计缺口需另列');

// E. Transaction identity plus unknown-state reconciliation.
g=canvas();
g.box(12,10,550,130,'同一幂等键与相同参数','返回原 operation\n避免重复建单 / 重复提交');
g.box(638,10,550,130,'同一幂等键与不同参数','拒绝冲突，不迁移旧授权\n参数由服务端指纹约束');
g.box(12,220,350,130,'单个银行事务','BEGIN IMMEDIATE\n余额、分录、回执、审计');
g.box(425,220,350,130,'提交后响应丢失','进入 unknown\n禁止直接新建第二笔','gold');
g.box(838,220,350,130,'按原 ID 核实','读取已提交回执\n恢复后续步骤');
g.edge('M362 285H417');g.edge('M775 285H830');
g.text('付款方 −a，收款方 +a，分录合计为 0',12,418,32,C.blue,true);
await save('idempotency',g,'幂等指纹、银行事务与结果未知的恢复路径');

// F. Facts are constrained before synthesis, so narration cannot invent balances.
g=canvas();
g.box(12,10,350,130,'工具观测 / 回执','真实模拟状态\n金额、状态、来源ID');
g.box(425,10,350,130,'确定性事实与段落','build_answer 生成事实\n金额不由模型自由改写');
g.box(838,10,350,130,'模型选择内容标识','按原问题组织重点\n仅接受已知 section_id');
g.edge('M362 75H417');g.edge('M775 75H830');
g.box(425,230,350,130,'核验后的增量回答','服务端映射回已知文字\nresponse.delta 逐段显示');
g.edge('M1013 140V185H600V222');
g.text('回答失败时保留已完成查询，不编造业务成功',12,418,30,C.blue,true);
await save('answer-grounding',g,'回答模型仅选择标识，不自由生成金额或回执');

// G. Readable diagnostic example; all values are explicitly synthetic.
g=canvas();
g.text('修正 z = 0.6745 × (金额 − 中位数) / MAD',12,52,37,C.ink,true);
g.box(12,100,550,205,'统计线索','同类历史至少 5 笔\nMAD = 0 时跳过该统计项\nz > 3.5 且满足金额条件才提示');
g.box(638,100,550,205,'业务规则线索','境外、凌晨、首次商户\n同商户同金额 10 分钟内重复\n逐条保留命中原因');
g.text('模拟案例：海外线上商户 ¥1,980.00',12,366,35,C.blue,true);
g.text('输出待核对交易和来源 ID，不自动认定欺诈',12,418,29,C.ink);
await save('anomaly-method',g,'MAD公式、退化条件、规则和解释性输出');

await fs.writeFile(path.join(base,'assets/figure-manifest.json'),JSON.stringify({date:'2026-10-26',tool:'deterministic SVG source; no generated evidentiary images',figures},null,2)+'\n');
console.log('Wrote',figures.length,'editable SVG figures');
