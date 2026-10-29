// Author the skill's structured sources. This file never draws or patches PPTX.
import fs from 'node:fs/promises';import path from 'node:path';
const dir=import.meta.dirname;const read=async f=>JSON.parse(await fs.readFile(path.join(dir,f),'utf8'));
const outline=await read('outline.json'),brief=await read('design_brief.json'),contract=await read('style_contract.json');
const handoff=await read('authoring-brief.json');
const root=path.resolve(dir,'../..');const evidence=await read('data/birthday-evidence.json');
const pages=[];
function add(id,title,variant,payload,note,source,section='main'){
 pages.push({id,type:id==='s01'?'title':'content',title,variant,slide_intent:variant==='flow'?'process':'evidence',
  message:payload.takeaway||payload.interpretation||title,notes:note+'\n代码与证据：'+source,
  sources:[source],...payload,_section:section});
}
function figure(name,caption,interpretation){
 const descriptions={
  architecture:['架构','系统架构图：工作台经同源API提交候选规划，工具契约校验后由编排器调用银行服务；会话、计划与银行分别保存，授权位于独立操作入口。'],
  execution:['执行','执行状态图：扫描前置成功的pending节点；读取保存观测，写入保存原operation并等待独立授权，再回到同一计划继续扫描。'],
  'birthday-dag':['任务','生日任务依赖图：查询纪念日和余额后锁定1000元，鲜花299元与蛋糕268元两个预约分别引用前置锁定回执hold_id。'],
  authorization:['授权','授权流程图：待本人确认的固定操作按服务端风险进入黄色复核或红色验证挑战，校验操作参数指纹、期限和一次消费后提交业务事务。'],
  idempotency:['事务','幂等与事务图：同键同参数复用原操作，不同参数拒绝；银行事务内更新余额和分录，响应丢失后按原ID核实，避免再次扣款。'],
  'answer-grounding':['回答','事实回答流程图：工具观测先形成确定性事实和段落，模型只选择已知内容标识，服务端映射核验文字并通过response.delta逐段显示。'],
  'anomaly-method':['算法','异常提示算法图：修正z分数使用中位数和MAD，并与境外、凌晨、首次商户及重复扣款规则形成可追溯的待核对交易线索。']
 };
 const [label,alt]=descriptions[name];
 return{figures:[{path:`assets/diagrams/${name}.png`,label,title:'',caption:''}],figure_alt_text:alt,figure_layout:'strip-readout',figure_frame:'open',caption,interpretation};
}
const sources={
 architecture:'architecture.md、api.py、orchestrator.py（18aa38d）',
 planner:'planner.py validate_nodes、tools.py（18aa38d）',
 executor:'orchestrator.py run / _resolve（18aa38d）',
 birthday:'data/birthday-evidence.json，固定模拟时钟2026-10-26',
 auth:'bank.py _risk / authorize（18aa38d）',
 recovery:'bank.py _move / reconcile，orchestrator.py（18aa38d）',
 security:'api.py、planner.py、bank.py、security-self-assessment.md',
 sandbox:'sandbox.py、sandbox_worker.py、run_journal.py',
 answer:'answers.py build_answer / synthesize（18aa38d）',
 qa:'pytest-review-20261026.xml、review-20261026.json',
 finance:'insights.py、catalog.py、tests/test_scenarios.py'
};

add('s01','TraceBank 拾迹银行','title',{
 kicker:'银行 AI 智能体比赛',subtitle:'系统架构、核心算法与安全设计\n模拟账户原型，代码18aa38d，2026-10-27',
 message:'自然语言生成候选计划，服务端授权后执行，回执支持结果核验',
 caption:'代码基线18aa38d，材料重制2026-10-27。账户、资金、商户与验证码均为模拟。'
},'主讲约8分45秒，附录用于追问。介绍一次自然语言需求从计划到回执的实际路径。本系统已接入qwen3.8-flash，当前扩展六场景有离线证据，尚未完成新增六场景的完整真实模型回归。不要声称真实银行上线或通用自主重规划。','problem.md、README.md、docs/current-release.md');

add('s02','六类业务共用一套 Agent 执行内核','table',{
 headers:['业务方向','当前模拟能力'],column_weights:[.25,.75],
 rows:[['智能转账','姓名/手机号转账、预约、AA'],['账单分析','分类对比、异常、来源交易'],['理财操作','风险测评、产品匹配、申购赎回'],['卡片管理','挂失、冻结、调额、交易限制'],['订阅管理','周期识别、涨价、提醒、取消'],['跨场景联动','纪念日、锁定资金、商户预约']],takeaway:'六类场景\n同一执行内核\n全部模拟',
 caption:'共享工具契约、任务编排与服务端授权。'
},'这里先明确覆盖范围。六类功能不是六套独立聊天提示词，它们共用工具契约、计划编排、银行权限与审计。用户可以从业务页进入工作台，连续追问保留历史，每轮操作绑定自己的operation。以下重点解释这套共同内核。',sources.birthday+'；tools.py');

add('s03','系统把候选规划、授权执行和证据分开','scientific-figure',
 figure('architecture','同源API、单进程、三个SQLite数据库','模型不能直接记账或读取OTP'),
 '按图从上到下看。API从会话确定用户，规划器只输出候选任务。共享工具契约与DAG校验拦住非法字段，编排器保存检查点，银行服务独立判断风险和授权。计划、银行、会话分别持久化，跨库不是一个原子事务，所以恢复必须核实原操作。图中的认证面板是逻辑分离，不是已接入真实认证服务。',sources.architecture);

add('s04','一次请求经历四个可观察阶段','flow',{
 flow_layout:'strip',flow_steps:[
 {title:'提交运行',detail:'会话确定用户\n保存run与\nconversation'},
 {title:'候选计划',detail:'工具、参数\n依赖经过\n服务端校验'},
 {title:'授权后执行',detail:'记录工具输入\n观测和\n暂停原因'},
 {title:'核验后回答',detail:'成功依据回执\n已核验内容\n逐段展示'}],
 takeaway:'run、plan、node、operation、receipt 关联同一条行动记录'
},'提交运行返回运行编号，页面显示真实的规划或工具阶段。后台处理会写model.completed、tool.started、tool.result、authorization.required和response.delta等事件。前端读取持久化事件并增量显示。我们没有把虚构的思考文字当作工作流，也不展示模型私密推理。',sources.executor+'；run_journal.py');

add('s05','候选 DAG 必须通过结构和语义约束','flow',{
 flow_layout:'bands',flow_steps:[
 {title:'工具与字段',detail:'共享注册表拒绝未知工具、额外字段与伪造身份'},
 {title:'参数与精度',detail:'金额用整数分，严格类型和范围由服务端复核'},
 {title:'依赖与引用',detail:'ID唯一，依赖存在，回执字段只能引用直接前置节点'},
 {title:'无环检查',detail:'反复寻找依赖已满足的节点，无进展则拒绝计划'}],
 caption:'最多12个节点。校验候选合法，不等于证明模型总能正确理解用户意图。'
},'校验先用严格模型拒绝额外字段，再按统一工具表检查参数。回执引用只能指向直接依赖允许的字段，例如hold_id。随后检查拓扑是否能推进，否则拒绝环或不存在的依赖。当前实现是有界反复扫描，不宣称实现了线性复杂度的Kahn队列算法。',sources.planner);

add('s06','执行器只推进前置成功的节点','scientific-figure',
 figure('execution','读操作保存观测，写操作保存原operation','停止不会撤销已提交交易'),
 '执行器扫描pending节点，前置失败或取消则停止后继，全部前置成功才进入工具。读工具直接保存结果，写工具先准备银行操作，用plan_id和node_id构造幂等键，并把operation_id保存在节点中。授权完成后仍回到原计划继续。当前是单进程锁和有序扫描，不声称多线程并行或跨worker租约。',sources.executor);

add('s07','生日任务用前置回执串起跨场景业务','scientific-figure',
 figure('birthday-dag','实际离线计划，锁定1000元，预约共567元','可用余额已减少，未来付款尚未发生'),
 `这是本轮在全新离线模拟账户中重新生成的计划，共${evidence.initial_plan.nodes.length}个节点。确认前两个读节点完成，锁定等待本人确认。确认锁定后，两项订单分别准备并获得本人确认，引用锁定回执的hold_id。1000元锁定额度中安排299元和268元，共567元，尚余433元。计划成功表示锁定及预约创建成功，商户未来付款尚未发生。`,sources.birthday);

add('s08','服务端按业务参数决定授权级别','table',{
 headers:['级别','执行条件','典型范围'],column_weights:[.15,.40,.45],
 rows:[['绿色','意图校验后\n直接读取','余额、账单\n交易、持仓'],['黄色','固定详情\n本人明确确认','小额转账、锁定\nAA、取消订阅'],['红色','绑定本次操作\n验证挑战与OTP','大额、挂失\n放开限制、申购']],takeaway:'普通转账\n累计超1000元\n升级验证',
 caption:'普通转账规则：当日已提交金额 + 本次金额 > 100000分时升级红色。',
 footnotes:['预约到期尚未结合实际日累计重新升级验证，已列P1待修复。']
},'风险级别来自银行服务，模型不能指定自己已经授权。黄色确认固定参数，红色需要与operation和参数指纹绑定的挑战。普通转账在提交事务中重新计算累计，所以原先黄色也可能升级为红色。必须明确：预约执行是另一条代码路径，目前未做同等实际日累计复核，后面证据页披露。',sources.auth);

add('s09','验证凭据绑定当前操作及其参数','scientific-figure',
 figure('authorization','提交前重新检查普通操作的业务条件','验证一次消费，参数变化需重新授权'),
 '红色操作生成challenge，OTP摘要结合challenge_id和fingerprint计算。服务端检查账户归属、期限和一次消费，执行前再次检查业务条件。验证失败累计三次会触发临时锁定，验证成功后即使下游通道失败也消费旧凭据。当前OTP可以从同一演示应用收件箱读取，不是生产级独立多因子认证。',sources.auth);

add('s10','幂等标识与银行事务约束重复执行','scientific-figure',
 figure('idempotency','同键同参数复用，冲突参数拒绝','unknown先核实原操作，避免重复扣款'),
 '银行事务在BEGIN IMMEDIATE内完成余额、正负分录、交易、回执与审计。相同键相同参数返回原操作，不同参数拒绝。若提交已经成功但回执响应丢失，状态为unknown，查询原ID核实，而不是创建第二次扣款。计划库和银行库分开，所以崩溃恢复还需更多注入测试，不能只靠有SQLite就声称万无一失。',sources.recovery);

add('s11','四类攻击在不同边界受到约束','table',{
 headers:['威胁入口','服务端控制','验证边界'],column_weights:[.23,.47,.30],
 rows:[['身份 / 授权','会话定归属\n严格请求、独立授权','聊天确认\n不构成授权'],['注入 / 非法工具','辅助拦截关键词\n工具与参数白名单','未知攻击\n未全面验证'],['余额 / 成功编造','读取工具事实\n成功须有业务回执','候选合法\n不保证意图正确'],['重放 / 并发故障','指纹、幂等、事务\n按原操作核实','多worker与跨库\n仍有边界']],takeaway:'控制落在\n实际执行入口\n提示词仅辅助',
 caption:'防线落在执行入口，提示词与前端按钮仅是辅助。'
},'把安全设计按攻击入口解释。第一层从会话确定身份并检查CSRF和同源。第二层校验候选计划。第三层由银行服务要求独立授权。最后结果只能引用工具事实。关键词拦截不能证明普遍防注入，已有测试也不能替代真实认证、未知工具输出攻击与生产安全评估。',sources.security);

add('s12','审计保存证据，受限计算限制能力','comparison-2col',{
 comparison_mode:'open-columns',comparison_body_font_size:18,
 left:{title:'关联审计',body:['plan / node / operation / receipt 串联','保留工具输入、策略、授权和结果','清洗OTP、密钥、PIN与私密推理','hash链无外部锚，不能称不可篡改']},
 right:{title:'数值 DSL worker',body:['白名单AST解释，无eval或exec','没有文件、网络和银行API语法','Windows Job：128 MiB、2秒CPU','不是任意Python的OS命名空间沙箱']},
 verdict:'失败即拒绝或留下失败记录，不把受限执行包装成全面安全认证'
},'左侧是可追溯证据，hash链可发现现有记录的局部改写，不能完整发现删尾或整体重算。右侧是数值DSL，独立进程与资源限制控制计算，输入表达式上限4096字符、256AST节点和24层深度。系统不提供任意Python执行，因此文件和网络拒绝来自语言没有相应能力。',sources.sandbox);

add('s13','回答模型只能组织已核验的事实','scientific-figure',
 figure('answer-grounding','事实与文字先确定，模型只选择内容标识','不由模型自由生成金融金额或回执'),
 '规划和回答是两个不同阶段。账单回答先把工具观测转成事实与可用段落，模型按原问题选择已知标识，服务端映射回真实文字，并通过response.delta逐段显示。若模型回答失败，查询本身不重做，界面保留已核验结果并说明边界。这个机制约束金额编造，但不证明任意建议或意图理解都正确。',sources.answer);

add('s14','当前证据覆盖离线执行，仍保留明确缺口','table',{
 headers:['证据 / 状态','实际范围','不能推出的结论'],column_weights:[.27,.40,.33],
 rows:[['183项测试','明确offline\n独立模拟数据','全路径安全\n未知攻击安全'],['30组页面尺寸','10个视图\n各3种宽度','物理手机认证\n屏幕阅读器认证'],['六场景巡检','当前UI、连续追问\n刷新恢复','新增六场景\n完整模型验收'],['预约累计P1','普通300+预约1000\n未追加OTP','未修复\n不可宣称全覆盖']],takeaway:'通过项有分母\n已知缺口保留\n不扩大结论',
 caption:'离线证据不替代新增六场景模型验收，预约P1待修复。'
},'给评委准确的验证分母。183是测试项数，30是页面乘视口，不是业务成功率。新增六场景已做离线巡检，历史真实模型结果只对应其原版本。额外复现的预约问题不在183项覆盖内，需在到期日实际累计超过阈值时转待验证，而不是自动付款。现有原型不连接真实银行或商户。主讲到此结束，以下三页用于技术问答。',sources.qa);

add('s15','附录A：异常账单提示保留可解释规则','scientific-figure',
 figure('anomaly-method','统计规则与来源交易共同形成待核对线索','提示异常不自动认定欺诈，当前没有训练机器学习模型'),
 'MAD修正z分数为0.6745乘金额偏离中位数再除MAD。同类历史不足五笔或MAD为零时不采用此统计项。阈值3.5之外还有限额条件。规则同时覆盖境外、凌晨、首次商户与短时重复扣款，逐项记录原因。示例1980元来自模拟账户，不是外部真实欺诈案件。',sources.finance,'appendix');

add('s16','附录B：适当性、持有期与AA都由规则计算','table',{
 headers:['算法对象','确定性计算 / 校验','执行约束'],column_weights:[.23,.48,.29],
 rows:[['风险适当性','8题映射C1–C5\n产品为R1–R5','超等级\n拒绝申购'],['理财交易','测评期限、起购金额\n最短持有期','申购验证\n赎回确认'],['AA拆分','整数分均分\n余数归发起人','本人确认后\n创建请求'],['资金锁定','可用余额扣除\n未使用的有效锁定','订单引用\n真实hold_id']],takeaway:'金额用整数分\n规则独立计算\n模型不自由记账',
 caption:'产品、净值与收益均为模拟；“演示：对方已付”是模拟入账，不是真实收款。'
},'这些算法不依赖模型自由计算钱。风险问卷有不能接受亏损等上限/否决规则，风险等级是模拟匹配。AA总金额按分拆分，余数由发起人承担。锁定与储蓄目标不同，funds.hold实际减少模拟可用余额，goals.create仅记目标。收入与支出、已锁定与已付款要分开解释。',sources.finance+'；bank.py','appendix');

add('s17','附录C：每项主张都有源码或实测入口','table',{
 headers:['主张','可核对的入口','边界'],column_weights:[.24,.50,.26],
 rows:[['计划与引用','planner.py、tools.py\nbirthday-evidence.json','≤12节点\n有界扫描'],['授权与幂等','bank.py\ntest_scenarios.py','模拟OTP\n预约P1未修'],['回答 / 审计','answers.py\nrun_journal.py','不展示\n私密推理'],['历史模型证据','model-integration.md\n历史评测JSON','不可移作\n本轮全场景证据']],takeaway:'源码可追溯\n图稿可重建\n密钥不进材料',
 caption:'SVG、提纲与脚本随工程保存；部署及仓库入口见README。'
},'附录用于回答评委如何复现。规划与工具契约、授权和幂等、事实回答与审计分别对应表中源码。生日计划保留独立离线观测，历史模型记录按其原版本解释。模型服务凭据仅在服务端环境变量中，源码和PPT不写密钥。详细技术说明与验证证据从docs/submission.md进入。',sources.qa+'；docs/submission.md','appendix');

const getContract=handoff.outline_contract?.deck_style?.readability_contract||{title_min_pt:28,body_min_pt:16,caption_min_pt:9};
outline.title='TraceBank 银行AI智能体技术答辩';outline.subtitle='系统架构、核心算法与安全设计';
outline.deck_style={...outline.deck_style,font_pair:'system_clean_v1',palette_key:'enterprise_graphite_v1',visual_density:'medium',title_motif:'none',header_mode:'lab-clean',header_variant:'plain',footer_mode:'source-line',footer_source_label:'依据',footer_page_numbers:true,comparison_mode:'open-columns',table_treatment:'standard',figure_table_treatment:'figure-first',figure_frame:'open',readability_contract:getContract};
outline.metadata={...outline.metadata,starter_outline_status:'replaced_with_source_backed_project_content',source_commit:'18aa38d',material_date:'2026-10-27',validation_evidence_date:'2026-10-26',section_counts:{main:14,appendix:3}};
delete outline.metadata.starter_outline_version;
outline.slides=pages.map(({_section,...s})=>s);
const items=Object.entries(sources).map(([id,claim])=>({id,claim,source:claim,source_type:'local_code_or_observed_evidence',slides:pages.filter(s=>s.sources[0].includes(claim)).map(s=>s.id)}));
const sourceFor=s=>Object.keys(sources).filter(k=>s.sources[0].includes(sources[k]));
const plan={topic:outline.title,audience:'银行AI智能体比赛技术评委',objective:'解释系统如何规划、执行、授权和核验，明确测试及生产边界',thesis:'共享工具契约、持久化DAG与独立银行授权把自然语言目标转换为可核对的模拟业务',
 narrative_arc:[{act:'范围与架构',purpose:'用实际业务和模块定义可信边界',slides:pages.slice(0,4).map(s=>s.id)},{act:'核心算法',purpose:'解释候选校验、执行状态与回执引用',slides:pages.slice(4,7).map(s=>s.id)},{act:'安全设计',purpose:'解释授权、幂等、攻击边界、审计和可信回答',slides:pages.slice(7,13).map(s=>s.id)},{act:'证据与技术附录',purpose:'给出分母、已知缺口和复现入口',slides:pages.slice(13).map(s=>s.id)}],
 slide_plan:pages.map(s=>({slide_id:s.id,role:s.type==='title'?'title':s.variant==='table'?'table':s.variant==='comparison-2col'?'comparison':'evidence',message:s.message,variant:s.variant,visual_strategy:s.variant==='scientific-figure'?'一张主图解释模块/算法/状态，原始SVG随工程保存':s.variant==='table'?'可编辑表格对齐相同业务或证据字段':s.variant==='flow'?'原生可编辑方法步骤，保留条件和顺序':s.variant==='timeline'?'按一次运行的实际时间顺序呈现阶段':'按证据形成阅读顺序',evidence_needs:sourceFor(s)}))};
brief.audience_posture='competition technical judges';brief.topic=outline.title;brief.content_maturity='source-backed technical prototype';brief.emotional_register='precise and inspectable';
brief.user_intake={audience:'比赛技术评委',purpose:'重点讲清系统架构、核心算法、安全设计',evidence:'18aa38d代码与2026-10-26离线证据，不编造新增模型结果',style:'白色/海军蓝，少量金色，图形主导，禁止三卡片模板'};
brief.evidence_continuity={policy:'代码、图稿、事实、幻灯片ID逐项绑定；测试项数不是业务成功率',threads:['同一生日任务从候选DAG、本人确认到预约回执','同一操作ID从授权、幂等、unknown到审计','183项离线测试与额外P1复现使用不同分母'],carry_forward_rule:'封面说明规划与授权边界，正文用图、状态与同一模拟任务继续举证，不重复装饰图案',known_gaps:['预约实际日累计强验证P1未修复','新增六场景完整真实模型回归尚缺','标准LibreOffice渲染器未安装，补充渲染单独披露']};
brief.structure_strategy={...brief.structure_strategy,narrative_arc:plan.narrative_arc,composition_grammar:brief.structure_strategy?.composition_grammar||'consulting-answer-pyramid',rhythm_break:'表格、整幅架构图、原生方法流程、状态图和开放双栏交替；不新增装饰卡片'};
brief.visual_system={...brief.visual_system,style_preset:'data-heavy-boardroom',font_policy:'原生文本使用skill system_clean_v1字体对；SVG用Microsoft YaHei中文字体',primary_evidence:'占据主要内容区的源码技术图，配可编辑方法步骤与表格'};
contract.build.output_pptx='build/tracebank-technical-defense-20261027.pptx';contract.build.palette_key='enterprise_graphite_v1';
const manifest=await read('assets/figure-manifest.json');
const assetPlan={topic:outline.title,images:manifest.figures.map(f=>({name:f.name,path:f.png,title:f.meaning,source_note:'项目原创技术图，依据18aa38d代码与离线模拟证据；SVG主源见'+f.source,source_type:'original_project_diagram',credit:'TraceBank project',license:'project-original'})),backgrounds:[],charts:[],tables:[],generated_images:[],icons:[]};
for(const [file,value] of Object.entries({'outline.json':outline,'content_plan.json':plan,'design_brief.json':brief,'style_contract.json':contract,'evidence_plan.json':{topic:outline.title,source_policy:'Only local code or observed synthetic evidence; no invented models, measurements, or live-bank claims',items,chart_candidates:[],open_questions:['预约累计强验证待修复及复测','新增六场景模型验收','最终视频与报名系统上传']} ,'asset_plan.json':assetPlan}))await fs.writeFile(path.join(dir,file),JSON.stringify(value,null,2)+'\n');
await fs.writeFile(path.join(dir,'notes.md'),'# 技术答辩制作依据\n\n2026-10-27重制，功能代码18aa38d。14页主讲加3页附录，目标约8分45秒主讲加45秒演示，未经真人计时。\n\n七张技术图使用原创SVG，不使用AI图片充当系统或实验事实。原生表格和方法步骤可在PPT编辑，图的文字和连接在对应SVG源中编辑。\n\n当前六场景联调是离线模拟，真实模型历史记录单独保留。预约累计验证P1未修复，材料不把测试通过误写为全路径安全。\n\n标准渲染依赖及可选数据包的安装状态见最终QA回执，未运行的检查不能标为通过。\n');
console.log(JSON.stringify({slides:pages.length,main:14,appendix:3,figures:manifest.figures.length,style:outline.deck_style.style_preset}));
