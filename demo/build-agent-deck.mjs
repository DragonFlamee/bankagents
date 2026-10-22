// Agent workflow narrative; editable text and process diagrams, real browser evidence.
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const root=path.resolve(import.meta.dirname,'..');
const runtime=process.env.TRACEBANK_ARTIFACT_MODULE || 'C:/Users/DA/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs';
process.env.RUNTIME_NODE_MODULES ||= path.resolve(path.dirname(runtime),'../../..');
const {Presentation,PresentationFile,FileBlob}=await import(pathToFileURL(runtime));
const skill='C:/Users/DA/.codex/plugins/cache/openai-primary-runtime/presentations/26.1013.11914/skills/presentations';
const {finalizePresentation}=await import(pathToFileURL(path.join(skill,'container_tools/artifact_tool_utils.mjs')));
const build=path.join(root,'.build/agent-delivery-deck');
const previews=path.join(root,'demo/agent-slides');
await fs.mkdir(build,{recursive:true});await fs.mkdir(previews,{recursive:true});
const evidence=JSON.parse(await fs.readFile(path.join(root,'evals/results/agent-workflow-browser.json'),'utf8'));
if(evidence.status!=='passed')throw new Error('Workflow evidence must pass before authoring final claims');
const run=evidence.runs.find(r=>r.plan?.nodes.length===3);
const usage=run.events.find(e=>e.type==='model.completed').data.usage;
const p=Presentation.create({slideSize:{width:1280,height:720}});
const font='Microsoft YaHei';const C={ink:'#173B38',muted:'#6D8077',teal:'#14816B',bg:'#F6F7F0',line:'#CEDBD0',amber:'#9A681B'};
function text(s,value,x,y,w,h,size=27,color=C.ink,bold=false){const b=s.shapes.add({geometry:'textbox',position:{left:x,top:y,width:w,height:h},fill:'none',line:{fill:'none',width:0}});b.text=value;b.text.style={typeface:font,fontSize:size,color,bold};return b;}
function slide(title,tag,notes){const s=p.slides.add();s.background.fill=C.bg;text(s,tag,64,30,1130,32,16,C.teal,true);text(s,title,64,83,1150,82,42,C.ink,true);text(s,'TRACEBANK   拾迹银行    /    Agent 工作流',64,675,1000,24,14,C.muted);text(s,String(p.slides.items.length).padStart(2,'0'),1160,675,50,24,14,C.muted);s.speakerNotes.text=notes;return s;}
async function image(s,file,x,y,w,h,crop){const b=await fs.readFile(path.join(root,file));s.images.add({blob:b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),contentType:'image/png',alt:file,fit:'contain',...(crop?{crop}:{}),position:{left:x,top:y,width:w,height:h}});}
function step(s,n,title,detail,x,y,w=350){text(s,n,x,y,w,50,35,C.teal,true);text(s,title,x,y+66,w,50,28,C.ink,true);text(s,detail,x,y+126,w,150,24,C.muted);}
// Native editable execution diagram. Rectangles represent actual workflow nodes.
function node(s,label,sub,x,y,w=330,h=120,color=C.teal){const b=s.shapes.add({geometry:'rect',position:{left:x,top:y,width:w,height:h},fill:'#E9F1E8',line:{fill:C.line,width:1}});text(s,label,x+18,y+15,w-36,42,26,color,true);text(s,sub,x+18,y+60,w-36,55,18,C.muted);return b;}
let s=slide('拾迹银行 Agent','银行 AI 智能体比赛  /  2026.10','主线：给出一个目标，现场看到模型规划、工具调用、授权关卡和业务回执。界面记录真实服务端行动事件，不展示模型私密思考。模型为真实 qwen3.8-flash，银行、账户、资金和验证码均为模拟。');
text(s,'把目标交给 Agent\n把每次行动留在眼前',64,218,600,170,46,C.teal,true);
text(s,'“分析本月账单，然后给李娜转 300 元，\n最后挂失尾号 1024 的卡片”',64,449,1090,105,29);
text(s,'真实模型规划    模拟银行执行',64,600,1100,40,23,C.muted);
s=slide('Agent 执行工作台','一次需求的执行现场','截图来自本次真实浏览器录屏。界面左侧为行动记录，右侧为校验后的计划、依赖及授权。六类场景与账户上下文收纳为辅助入口。来源：artifacts/screenshots/agent/workspace.png，evals/results/agent-workflow-browser.json。');
await image(s,'artifacts/screenshots/agent/workspace.png',64,177,1152,438,{left:264/1440,top:228/1050,right:42/1440,bottom:392/1050});
s=slide('目标如何成为可执行计划','模型规划与服务端校验','本实现每个请求只调用一次模型生成结构化候选计划。服务端校验工具白名单、参数、节点依赖与无环性，然后执行保存的 DAG；它不执行多轮自主反思。明确顺序另有保守串行约束。截图：本轮真实模型请求进行期间。来源：banking_agent/planner.py、orchestrator.py，tests/test_runs.py。');
text(s,'输入自然语言目标',64,210,480,50,30,C.teal,true);
text(s,'模型生成结构化候选计划\n包含工具、参数与节点依赖',64,285,500,110,28);
text(s,'服务端校验通过后才执行\n每个请求一次模型规划',64,455,500,100,28);
await image(s,'artifacts/screenshots/agent/planning-focus.png',615,190,600,430,{left:0,top:0,right:0,bottom:.57});
s=slide('三个节点与两次授权暂停','已保存的执行计划','这是本次复合任务实际产生的顺序。账单查询自动完成；300元转账先明确确认，提交得到回执后才创建挂失操作；挂失另需独立验证。恢复任务沿保存的依赖图继续，不再次请求模型。来源：evals/results/agent-workflow-browser.json 的三节点任务。');
node(s,'1  分析本月账单','bills · 读取模拟交易',64,220);
text(s,'依赖 1',410,258,70,35,20,C.muted);
node(s,'2  给李娜转 300 元','transfer · 等待明确确认',485,220);
text(s,'依赖 2',832,258,70,35,20,C.muted);
node(s,'3  挂失尾号 1024','card.report_lost\n独立验证',910,220,306);
text(s,'自动查询完成',64,405,330,65,26,C.teal,true);
text(s,'用户确认后提交',485,405,330,65,26,C.amber,true);
text(s,'验证码通过后提交',910,405,306,65,26,C.amber,true);
text(s,'前一步没有回执，依赖它的后续操作保持等待。',64,555,1150,65,27,C.muted);
s=slide('每次工具调用都有输入和观测','行动记录','左图来自实际执行事件，可展开核对工具输入与返回值。tool.started 的 prepare 阶段仅创建待授权操作，不能据此判断转账完成。业务成功以 operation.result 内的回执为依据。来源：banking_agent/orchestrator.py、run_journal.py。');
await image(s,'artifacts/screenshots/agent/tool-focus.png',64,190,640,435,{left:0,top:.16,right:0,bottom:0});
text(s,'调用什么',760,220,430,50,31,C.teal,true);
text(s,'工具名、参数、前置节点',760,284,430,65,26);
text(s,'返回什么',760,405,430,50,31,C.teal,true);
text(s,'查询数据、待授权操作\n或业务回执',760,470,430,105,26);
s=slide('授权是执行中的一道关卡','用户始终掌握提交权','黄色转账需核对后明确确认，红色挂失在独立面板验证。模型的“已确认”文字不能替代服务器保存的授权。验证码不会进入对话规划或行动记录。模拟OTP不等同于真实多因子认证。来源：tests/test_runs.py、test_api.py，本轮录屏。');
await image(s,'artifacts/screenshots/agent/verification-focus.png',64,185,600,450);
text(s,'Agent 暂停在待授权节点',730,220,475,80,33,C.teal,true);
text(s,'用户核对收款人、金额或卡片\n独立验证绑定当前操作',730,350,475,110,27);
text(s,'授权通过才提交\n拿到回执再继续后续步骤',730,520,475,100,27);
s=slide('停止与异常都有可核对的状态','控制与恢复','规划期间请求停止，当前HTTP调用返回后不再调用本轮工具。已提交资金不能靠停止撤销。模拟回执超时会进入unknown，必须查询原操作；本轮对账返回同一操作的回执，没有新建转账。故障由本地测试夹具注入。来源：本轮浏览器证据、tests/test_runs.py、bank.py。');
step(s,'停止','规划中请求停止','等待当前模型请求返回\n本轮后续工具调用为 0',64,220,500);
step(s,'结果未知','提交后回执超时','按原操作 ID 查询结果\n核对原回执后继续',710,220,500);
text(s,'暂停、恢复和转人工也会写入同一条行动记录。',64,582,1140,50,26,C.muted);
s=slide('模型调用也有可核对的凭据','本次复合任务的实际 API 响应','数据来自本次真实模型请求的响应元数据。思考Token属于输出Token子集，不能重复相加。不展示reasoning_content。Request ID可辅助在同一工作空间核对用量。来源：evals/results/agent-workflow-browser.json，三节点run的model.completed事件。');
text(s,usage.model,64,215,1120,70,48,C.teal,true);
text(s,`输入 ${usage.prompt_tokens} Token     输出 ${usage.completion_tokens} Token`,64,325,1140,60,32);
text(s,`总计 ${usage.total_tokens} Token     HTTP ${usage.http_status}`,64,410,1140,60,32);
text(s,`Request ID\n${usage.request_id}`,64,515,1150,80,24,C.muted);
s=slide('本次验证范围','可重放的工程证据','项目完整tests目录140项通过，1项Starlette HTTPX弃用提醒；本轮真实模型浏览器工作流6组通过：增量规划、授权依赖续跑、刷新不重放、停止、原操作对账、390px布局。此前15例固定模型集是历史开发集，保留其15/15结果，不将其冒充本轮新增留出验证。所有数据、授权均为脚本夹具，没有人类被试。来源：evals/results/pytest-workflow.xml、agent-workflow-browser.json、live-20261021.json。');
text(s,'140',64,220,500,125,94,C.teal,true);text(s,'项目自动化测试通过',64,365,500,65,31);
text(s,`${evidence.tests.length} 组`,715,220,500,125,82,C.teal,true);text(s,'真实模型浏览器工作流验证',715,365,500,65,31);
text(s,'包含授权续跑、停止、刷新恢复与原操作对账\n合成银行数据、脚本确认，尚无真人使用研究',64,515,1150,110,26,C.muted);
s=slide('现场演示与实现范围','演示收尾','先播放或现场运行demo/tracebank-agent-workflow.webm，对照真实事件观察模型规划、工具输入、两次授权暂停、继续执行、停止和超时对账。银行业务为模拟。当前Agent是一次模型规划加确定性DAG执行，尚无多轮自主重规划。理财交易、预约、AA、资金冻结、真实银行和真实认证均未实现。用户自己发布GitHub，未配置远端URL。');
text(s,'一次目标，观察完整行动记录',64,215,1120,65,39,C.teal,true);
text(s,`本地实录约 ${Math.round(evidence.duration_seconds)} 秒\n也可直接在 Agent 工作台现场操作`,64,325,1140,110,30);
text(s,'当前实现：一次模型规划 + 依赖图执行 + 独立授权',64,495,1150,55,27);
text(s,'尚未实现多轮自主重规划、理财交易、预约、AA 与真实银行接入',64,582,1150,50,23,C.muted);
const candidate=path.join(build,'candidate.pptx');await(await PresentationFile.exportPptx(p)).save(candidate);
const finalPath=path.join(root,'demo/tracebank-agent.pptx');
const result=await finalizePresentation({workspaceDir:root,candidatePath:candidate,finalPath,pythonExecutable:path.join(root,'.venv/Scripts/python.exe'),integrityValidatorPath:path.join(skill,'container_tools/inspect_presentation_package_integrity.py'),layoutValidatorPath:path.join(skill,'container_tools/inspect_presentation_layout_geometry.py'),layoutArgs:['--expected-slide-size-emu','12192000,6858000','--validate-bullet-geometry','--validate-heading-fit'],fontPolicy:{basis:'design',families:[font]},verifyArtifactToolImport:true,receiptPath:path.join(build,'validation.json')});
console.log('Finalized',JSON.stringify(result));
const exact=await PresentationFile.importPptx(await FileBlob.load(finalPath));
for(let i=0;i<exact.slides.items.length;i++){const blob=await exact.export({slide:exact.slides.items[i],format:'png',scale:1});await fs.writeFile(path.join(previews,`slide-${String(i+1).padStart(2,'0')}.png`),new Uint8Array(await blob.arrayBuffer()));console.log('Rendered exact final',i+1);}
