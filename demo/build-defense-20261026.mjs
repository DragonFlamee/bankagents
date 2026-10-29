// Current six-scenario defense deck. Run from the repository root.
// Uses the installed first-party presentation runtime and skill finalizer.
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const root=path.resolve(import.meta.dirname,'..');
const runtime=process.env.TRACEBANK_ARTIFACT_MODULE||'C:/Users/DA/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs';
const skill=process.env.TRACEBANK_PRESENTATION_SKILL||'C:/Users/DA/.codex/plugins/cache/openai-primary-runtime/presentations/26.1013.11914/skills/presentations';
process.env.RUNTIME_NODE_MODULES||=path.resolve(path.dirname(runtime),'../../..');
const {Presentation,PresentationFile,FileBlob}=await import(pathToFileURL(runtime));
const {finalizePresentation}=await import(pathToFileURL(path.join(skill,'container_tools/artifact_tool_utils.mjs')));
const build=path.join(root,'.build/defense-20261026');
const preview=path.join(root,'demo/defense-20261026-slides');
await fs.mkdir(build,{recursive:true});await fs.mkdir(preview,{recursive:true});
const qa=JSON.parse(await fs.readFile(path.join(root,'evals/results/review-20261026.json'),'utf8'));
if(qa.offline_tests.passed!==183||qa.browser.pages.length!==30)throw new Error('Expected current evidence is missing');
const C={navy:'#142235',ink:'#0A2540',muted:'#425466',quiet:'#60758B',accent:'#635BFF',soft:'#F3F5FA',line:'#D9E2EB',white:'#FFFFFF',gold:'#AC8128',goldSoft:'#FFF5DF',red:'#A13E32'};
const font='Microsoft YaHei';
const p=Presentation.create({slideSize:{width:1280,height:720}});
const allText=[];
function rect(s,x,y,w,h,fill,line='none',radius=0){return s.shapes.add({geometry:radius?'roundRect':'rect',position:{left:x,top:y,width:w,height:h},fill,line:{fill:line,width:line==='none'?0:1},...(radius?{borderRadius:radius}:{})});}
function text(s,value,x,y,w,h,size=25,color=C.ink,bold=false){const b=s.shapes.add({geometry:'textbox',name:'text-'+String(allText.length),position:{left:x,top:y,width:w,height:h},fill:'none',line:{fill:'none',width:0}});b.text=String(value);b.text.style={typeface:font,fontSize:size,color,bold};b.text.insets=0;allText.push({slide:p.slides.items.length,text:String(value)});return b;}
function line(s,x,y,w,h=1,color=C.line){return rect(s,x,y,w||1,h||1,color);}
function base(title,notes,dark=false){const s=p.slides.add();s.background.fill=dark?C.navy:C.white;text(s,title,56,43,1168,74,42,dark?C.white:C.ink,true);text(s,String(p.slides.items.length).padStart(2,'0'),1175,675,50,24,16,dark?'#B6C2D3':C.quiet);s.speakerNotes.text=notes;return s;}
function para(s,title,body,x,y,w,color=C.accent){text(s,title,x,y,w,42,28,color,true);text(s,body,x,y+57,w,115,24,C.muted);}
function node(s,title,sub,x,y,w,h=108,{fill=C.soft,color=C.ink,border=C.line}={}){rect(s,x,y,w,h,fill,border,6);text(s,title,x+18,y+17,w-36,36,25,color,true);text(s,sub,x+18,y+60,w-36,h-65,19,fill===C.navy?'#B6C2D3':C.muted);}
function arrow(s,x,y,w,color=C.accent){line(s,x,y,w-8,2,color);s.shapes.add({geometry:'triangle',position:{left:x+w-12,top:y-5,width:12,height:12,rotation:90},fill:color,line:{fill:'none',width:0}});}
function leftArrow(s,x,y,w,color=C.accent){line(s,x+8,y,w-8,2,color);s.shapes.add({geometry:'triangle',position:{left:x,top:y-5,width:12,height:12,rotation:270},fill:color,line:{fill:'none',width:0}});}
async function image(s,file,x,y,w,h,crop){const b=await fs.readFile(path.join(root,file));s.images.add({blob:b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),contentType:'image/png',alt:file,fit:'contain',...(crop?{crop}:{}),position:{left:x,top:y,width:w,height:h}});}
function table(s,values,x,y,w,h,widths){const t=s.tables.add({rows:values.length,columns:values[0].length,left:x,top:y,width:w,height:h,columnWidths:widths,values});t.styleOptions={headerRow:true,bandedRows:false};t.borders.assign({fill:C.line,width:1,style:'solid'});for(let r=0;r<values.length;r++)for(let c=0;c<values[r].length;c++){const cell=t.getCell(r,c);cell.fill=r===0?C.navy:(r%2?C.white:C.soft);cell.text.style={typeface:font,fontSize:r===0?23:22,bold:r===0||c===0,color:r===0?C.white:C.ink};}return t;}

// 1. Cover, with one concrete user goal rather than decorative UI panels.
let s=base('TraceBank 拾迹银行','25秒。模拟银行Agent。当前功能基线18aa38d。六场景离线实现，qwen3.8-flash为已接入模型，新增六场景完整真实模型回归未完成。账户、资金、商户和验证码均为模拟。来源：problem.md、README.md、docs/current-release.md。',true);
text(s,'银行 AI 智能体',56,176,1130,88,62,C.white,true);
text(s,'自然语言目标驱动的模拟银行业务办理',60,288,1110,56,31,'#B6C2D3');
line(s,60,391,1158,1,'#3A4B62');
text(s,'“我爱人生日快到了，锁定 1000 元，\n生日前两天订鲜花和蛋糕”',60,430,1090,112,35,C.white);
text(s,'模型候选计划与服务端分级授权',60,595,1100,40,26,'#B6C2D3');

// 2. The interaction on the actual current UI.
s=base('每轮对话都有可核对的行动记录','35秒。工作台中执行过程在回答之前，支持连续追问、刷新恢复，旧轮次的授权绑定原操作。状态文字来自服务端事件，不展示私密思考正文。图片为2026-10-26离线模拟截图，不能当作本轮真实模型生成。来源：apps/frontend/src/ConversationTurn.tsx、Workspace.tsx、evals/results/review-20261026.json。');
text(s,'用户提目标，Agent 排步骤，服务端保存每次行动',58,126,1140,45,27,C.muted);
await image(s,'artifacts/screenshots/review-20261026/birthday.png',55,202,838,343,{left:.30,top:90/960,right:.14,bottom:540/960});
text(s,'每轮保留自己的操作与回执',57,579,838,37,25,C.muted);
line(s,920,208,1,416,C.line);
para(s,'执行过程','工具名、输入、观测\n按需展开核对',952,220,260);
para(s,'业务回答','说明已完成什么\n保留后续待办',952,429,260);
text(s,'当前界面截图，离线模拟环境',57,651,1000,25,17,C.quiet);

// 3. A native, editable scenario matrix.
s=base('六类场景已有模拟业务实现','40秒。逐行点出实际业务，而非仅有按钮。权限由服务端根据参数和账户状态决定；表内是概括而非完整策略矩阵。预约累计缺口在第11页明确。检测周期扣费与订阅签约查询的授权口径待复核。来源：tools.py、bank.py、tests/test_scenarios.py、docs/requirements.md。');
table(s,[['场景','当前可办理的模拟业务','主要权限'],['智能转账','姓名或手机号转账、预约、AA 收款','确认 / 累计升级验证'],['账单分析','分类与对比、来源交易、异常提示','查询直接执行'],['理财操作','风险测评、产品对比、申购与赎回','申购验证 / 赎回确认'],['卡片管理','挂失、冻结、调额、交易限制、PIN 重置','按敏感程度分级'],['订阅管理','识别周期扣费、涨价、提醒、取消','识别 / 查询 / 确认'],['跨场景联动','查纪念日、锁定资金、预约鲜花蛋糕','分步确认']],56,154,1168,440,[180,660,328]);
text(s,'账户、产品、资金、商户和验证码均为模拟',57,622,1160,35,23,C.muted);

// 4. Editable architecture with explicit trust boundaries.
s=base('模型生成候选计划，银行服务决定能否执行','45秒。前端与API同源，会话决定user_id。Planner输出候选DAG，tools.py统一契约和参数验证，最多12个节点。Orchestrator保存计划与operation关联，银行服务处理风险、幂等和账本。回答来自已核对观测；后台调度还有已知P1。来源：docs/architecture.md、api.py、planner.py、orchestrator.py、bank.py。');
node(s,'用户与工作台','连续对话、确认、独立验证',56,164,1168,90,{fill:C.navy,color:C.white,border:C.navy});
node(s,'候选计划','模型 / 离线规则',56,310,270,108);arrow(s,335,363,55);
node(s,'契约与 DAG 校验','共享工具、参数、≤12 节点',400,310,345,108);arrow(s,754,363,55);
node(s,'持久化编排','依赖、检查点、原操作编号',820,310,404,108);
line(s,1019,418,2,42,C.accent);
node(s,'模拟银行服务','归属、分级授权、幂等、回执',820,460,404,108,{fill:'#F0EEFF',border:'#BDB7FF'});
node(s,'观测与回答','运行事件、核验结果、来源',400,460,345,108);
node(s,'模拟数据与算法','账本、理财、锁定、预约',56,460,270,108);
leftArrow(s,754,513,55);
line(s,1019,568,2,22,C.accent);line(s,191,588,830,2,C.accent);line(s,191,568,2,22,C.accent);
text(s,'OTP 与记账权限留在服务端，候选计划不含有效授权',57,615,1165,40,26,C.muted);

// 5. Real branching dependencies, represented natively.
s=base('生日安排拆成五个有依赖的步骤','50秒。近期纪念日与余额查询是绿色，锁定资金先等本人确认。两个merchant.order节点共享funds.hold前置依赖，并引用真实回执里的hold_id，订单分别确认。分支图不等于多线程并发。该例1000元锁定、299元鲜花、268元蛋糕，未来付款尚未发生。来源：tests/test_scenarios.py首例、planner.py、orchestrator.py、review截图birthday.png。');
text(s,'“锁定 1000 元，生日前两天订鲜花和蛋糕”',57,130,1160,50,29,C.muted);
node(s,'查纪念日','life.events',56,248,230);arrow(s,296,300,42);
node(s,'核对余额','balance',350,248,230);arrow(s,590,300,42);
node(s,'锁定 ¥1,000','funds.hold，等本人确认',644,248,286,122,{fill:C.goldSoft,border:'#D8BC7C'});
line(s,943,211,2,260,C.accent);line(s,930,309,14,2,C.accent);arrow(s,944,211,38);arrow(s,944,470,38);
node(s,'鲜花 ¥299','merchant.order，确认预约',989,161,235,115,{fill:C.goldSoft,border:'#D8BC7C'});
node(s,'蛋糕 ¥268','merchant.order，确认预约',989,420,235,115,{fill:C.goldSoft,border:'#D8BC7C'});
text(s,'两个订单引用锁定回执的 hold_id',56,459,830,43,29,C.accent,true);
text(s,'分支表示依赖，不宣称多线程执行',56,522,830,43,25,C.muted);
text(s,'已安排 ¥567，剩余锁定额度 ¥433',56,611,1165,40,27,C.ink,true);

// 6. Current result evidence. Different crop from slide 2 uses another screenshot.
s=base('预约成功与未来付款分别展示','40秒。成功是锁定及预约创建成功，不能说未来商户已经收款或发货。图片来自本轮离线日程页面；最终付款须到期执行。1000减299减268等于433。来源：ResultVisual.tsx、bank.py及当前巡检截图。');
await image(s,'artifacts/screenshots/review-20261026/planner-after.png',56,180,760,373,{left:249/1440,top:866/1611,right:623/1440,bottom:466/1611});
text(s,'订单等待到期，付款尚未发生',57,570,760,35,23,C.muted);
text(s,'锁定金额',863,179,343,33,23,C.muted);text(s,'¥1,000',860,228,350,75,52,C.ink,true);
text(s,'鲜花与蛋糕预约',863,344,343,33,23,C.muted);text(s,'¥567',860,392,350,75,52,C.accent,true);
text(s,'余下 ¥433 在锁定释放日前仍受约束',57,611,1155,40,26,C.muted);

// 7. Permissions, with editable native rows instead of UI-like cards.
s=base('分级授权由服务端执行','40秒。绿色查询直接执行。黄色先展示固定参数再明确确认。红色验证绑定操作和参数。1000元为题面日累计阈值，普通转账实现了提交时升级，预约到期实际日累计仍有缺口，切勿把这页当作全路径认证。来源：bank._risk、bank.authorize、security-self-assessment.md。');
const tiers=[['查询直接执行','余额、流水、账单、持仓等查询',C.accent],['本人确认','小额转账、锁定、AA、取消订阅等',C.gold],['操作绑定验证','大额转账、挂失、放开限制、理财申购',C.red]];
tiers.forEach(([title,detail,color],i)=>{const y=170+i*137;line(s,56,y,8,98,color);text(s,title,90,y+5,326,45,31,color,true);text(s,detail,450,y+10,750,63,27,C.ink);if(i<2)line(s,90,y+115,1130,1);});
text(s,'普通转账累计超过 ¥1,000 升级验证，预约执行缺口待修复',56,614,1164,40,23,C.muted);

// 8. Financial analysis screenshot paired with explicit algorithm scope.
s=base('分析结果保留规则与业务依据','35秒。账单用整数分统计并关联原始交易ID，MAD修正z分数加规则产生待核对线索。风险问卷与产品匹配是模拟适当性规则；图中数据均为模拟而非真实净值。模型不会获得自由编造交易回执的权限。来源：insights.py、catalog.py、bank.py、docs/algorithms.md。');
text(s,'一笔需要核对的交易',56,167,624,50,31,C.ink,true);
text(s,'海外线上商户',56,253,624,45,27,C.muted);
text(s,'¥1,980.00',56,317,624,93,68,C.accent,true);
line(s,56,446,600,2,C.line);
text(s,'高于同类历史水平\n境外商户，首次出现',56,479,624,90,27,C.ink);
para(s,'账单异常提示','MAD 修正 z 分数与规则\n保留来源交易，提示本人核对',733,177,480);
para(s,'理财适当性','8 题测评匹配 C1–C5\n超风险等级拒绝，申购需要验证',733,387,480);
text(s,'异常线索不等于欺诈，模拟收益不构成收益承诺',56,619,1167,40,24,C.muted);

// 9. State transitions and explicit boundaries.
s=base('中断与异常沿原操作核实','45秒。暂停/接管停止后续执行，取消不会冲正已提交交易。unknown只查询原operation，不新建付款。审计关联plan/node/operation/receipt，hash链没有外部可信锚。独立DSL worker仅解释数值表达式，不是任意PythonOS沙箱。来源：orchestrator.py、run_journal.py、bank.py、sandbox.py和安全设计。');
node(s,'待确认 / 待验证','没有授权时不提交',56,180,330);arrow(s,400,232,74);
node(s,'提交 / 回执','业务事务与关联编号',489,180,330);arrow(s,834,232,60);
node(s,'继续后续节点','以前置业务状态为准',909,180,315);
line(s,652,288,2,68,C.accent);
node(s,'结果未知','查询原 operation 核实，不重新扣款',386,356,570,115,{fill:C.goldSoft,border:'#D8BC7C'});
text(s,'用户控制',56,523,260,45,29,C.accent,true);text(s,'暂停、恢复、停止与独立人工接管',330,526,870,50,28);
text(s,'审计边界',56,598,260,45,29,C.accent,true);text(s,'关联事件可追溯，hash 链不等于不可篡改',330,601,870,50,26,C.muted);

// 10. Evidence, without adding unlike counts or inventing success rates.
s=base('本轮离线回归与浏览器证据','35秒。183为测试项，30为页面和尺寸组合，不能相加为业务成功率。两轮连续追问、刷新恢复及展开已通过。六场景巡检是离线，不是本轮完整真实模型验收。先前模型集属于其原版本。来源：evals/results/review-20261026.json、pytest-review-20261026.xml。');
text(s,'183',56,171,540,120,100,C.accent,true);text(s,'项离线测试通过',60,305,530,55,32,C.ink);
text(s,'30',700,171,500,120,100,C.ink,true);text(s,'组页面与尺寸检查',704,305,510,55,32,C.ink);
line(s,56,400,1167,1);
text(s,'六场景巡检、连续追问、刷新恢复与展开详情通过',56,436,1165,55,30,C.ink);
text(s,'没有页面脚本错误或整页横向溢出',56,510,1165,45,27,C.muted);
text(s,'新增六场景真实模型验收尚未完成',56,594,1165,45,27,C.red,true);

// 11. Known issue is factual, not hidden behind all-pass counts.
s=base('预约累计验证仍有待修复缺口','35秒。这是本轮额外复现的P1，不在183项测试覆盖内。先创建明天1000元预约并黄色确认，次日普通转300元，再正常run_due，累计1300元却无OTP。实现只重查余额与安全锁定，需要在实际到期日重算并进入待验证流程。也要完善移动图表与新增六场景模型验收。来源：review-20261026.json、bank.py _risk / _run_schedule。');
text(s,'提前确认的预约',56,166,610,45,30,C.muted);text(s,'¥1,000',56,225,610,94,72,C.ink,true);
text(s,'到期日普通转账',705,166,510,45,30,C.muted);text(s,'¥300',705,225,510,94,72,C.ink,true);
line(s,56,361,1167,1);
text(s,'当日合计 ¥1,300，预约未追加强验证',56,402,1160,70,38,C.red,true);
text(s,'修复要求：执行前重算实际日累计，升级后等待操作绑定验证',56,502,1165,72,27,C.ink);
text(s,'其他边界：手机图表可读性、真实认证、外部冲正与多 worker 编排',56,606,1165,43,23,C.muted);

// 12. Delivery and a real demonstration entry, with no fabricated submission status.
s=base('源码与当前材料可追溯','25秒。仓库已发布，当前PPT与材料为这次更新，未冒称报名系统已提交。现场一分钟用独立离线账户展示生日任务的查询、锁定确认与订单预约，不使用演示提前执行混淆付款。正式提交前修P1、补模型验收、重录当前UI视频并真人排练。来源：docs/submission.md、demo/agent-defense-script.md。',true);
text(s,'github.com/DragonFlamee/bankagents',56,186,1165,68,41,C.white,true);
text(s,'README、架构与算法、安全自评、测试证据',56,294,1160,55,31,'#B6C2D3');
line(s,56,397,1167,1,'#3A4B62');
text(s,'现场演示：生日安排',56,439,1160,61,39,C.white,true);
text(s,'查看计划、本人确认、核对预约结果',56,533,1160,52,29,'#B6C2D3');
text(s,'当前材料截至 2026 年 10 月 26 日，业务均在模拟账户中完成',56,632,1165,32,19,'#B6C2D3');

await fs.writeFile(path.join(build,'text-manifest.json'),JSON.stringify(allText,null,2));
const candidate=path.join(build,'candidate-v2.pptx');
await(await PresentationFile.exportPptx(p)).save(candidate);
console.log('Exported draft',p.slides.items.length);
for(let i=0;i<p.slides.items.length;i++){const blob=await p.export({slide:p.slides.items[i],format:'png',scale:1});await fs.writeFile(path.join(preview,`slide-${String(i+1).padStart(2,'0')}.png`),new Uint8Array(await blob.arrayBuffer()));console.log('Rendered',i+1);}
if(process.argv.includes('--finalize')){
 const finalPath=path.join(root,'demo/tracebank-defense-20261026-v2.pptx');
 const validation=await finalizePresentation({workspaceDir:root,candidatePath:candidate,finalPath,pythonExecutable:process.env.TRACEBANK_ARTIFACT_PYTHON||path.join(root,'.venv/Scripts/python.exe'),integrityValidatorPath:path.join(skill,'container_tools/inspect_presentation_package_integrity.py'),layoutValidatorPath:path.join(skill,'container_tools/inspect_presentation_layout_geometry.py'),layoutArgs:['--expected-slide-size-emu','12192000,6858000','--validate-bullet-geometry','--validate-heading-fit','--require-native-table-slide','3'],requiredNativeTableOwnerSlides:[3],fontPolicy:{basis:'design',families:[font]},verifyArtifactToolImport:true,receiptPath:path.join(build,'validation-v2.json')});
 console.log('Finalized',validation.finalSha256||'passed');
 const exact=await PresentationFile.importPptx(await FileBlob.load(finalPath));
 for(let i=0;i<exact.slides.items.length;i++){const blob=await exact.export({slide:exact.slides.items[i],format:'png',scale:1});await fs.writeFile(path.join(preview,`slide-${String(i+1).padStart(2,'0')}.png`),new Uint8Array(await blob.arrayBuffer()));}
 await fs.writeFile(path.join(root,'evals/results/presentation-20261026.json'),JSON.stringify({date:'2026-10-26',source_commit:'18aa38d',slide_count:12,file:'demo/tracebank-defense-20261026-v2.pptx',font_policy:{basis:'design',families:[font]},authoring:'first-party artifact-tool; live Artifact Session host unavailable',validation,preview_directory:'demo/defense-20261026-slides',native_powerpoint_opened:false,video_updated:false,known_schedule_permission_issue_fixed:false},null,2)+'\n');
}
