"""Generate editable F6 from the actual fixed-set JSON; no invented data."""
from pathlib import Path
import json, subprocess, shutil

here = Path(__file__).resolve().parent
data = json.loads((here.parent / 'evals/results/offline-20261021.json').read_text(encoding='utf-8'))
summary = data['summary']
full = summary['full']
control = summary['first_node_control']
csv = 'group,goals,total,cases,case_total,p50_ms,p95_ms,confirmations,otp\n'
for key, value in [('full', full), ('first_node_control', control)]:
    csv += f"{key},{value['tasks_completed']},{value['goal_case_count']},{value['cases_passed']},{value['case_count']},{value['task_latency_p50_ms']},{value['task_latency_p95_ms']},{value['confirmation_actions']},{value['otp_submissions']}\n"
(here/'evaluation.csv').write_text(csv, encoding='utf-8')
tex = r'''\documentclass[tikz,border=5mm]{standalone}
\input{figure-style.tex}
\begin{document}
\begin{tikzpicture}
\node[title] at (0,8.1) {F6 固定离线任务：完成情况与交互负担};
\node[subtitle] at (0,7.5) {2026-10-21；规则规划；每组25用例，业务目标22个；无真实模型或人类被试};
\begin{axis}[at={(0cm,1.2cm)},anchor=south west,width=8.2cm,height=5.8cm,
 ybar,bar width=18pt,ymin=0,ymax=28,ytick={0,5,10,15,20,25},
 symbolic x coords={Full,Control},xtick=data,xticklabels={完整编排,首节点受限对照},
 ylabel={通过/完成数},nodes near coords,
 legend style={at={(.5,1.05)},anchor=south,legend columns=2},
 enlarge x limits=.5]
\addplot[fill=cbBlue,draw=cbBlue] coordinates {(Full,FCASE)(Control,CCASE)};
\addplot[fill=cbOrange,draw=cbOrange] coordinates {(Full,FGOAL)(Control,CGOAL)};
\legend{用例通过（共25）,业务完成（共22）}
\end{axis}
\begin{axis}[at={(9cm,1.2cm)},anchor=south west,width=8.2cm,height=5.8cm,
 ybar,bar width=18pt,ymin=0,ymax=28,ytick={0,5,10,15,20,25},
 symbolic x coords={Full,Control},xtick=data,xticklabels={完整编排,首节点受限对照},
 ylabel={脚本动作次数},nodes near coords,
 legend style={at={(.5,1.05)},anchor=south,legend columns=2},enlarge x limits=.5]
\addplot[fill=cbGreen,draw=cbGreen] coordinates {(Full,FCONF)(Control,CCONF)};
\addplot[fill=cbPurple,draw=cbPurple] coordinates {(Full,FOTP)(Control,COTP)};
\legend{确认动作,验证码提交}
\end{axis}
\node[note,text width=17cm,anchor=north west] at (0,.6) {对照只执行首节点，因此天然缺少复合任务覆盖；较少确认不代表体验更好。安全探针10/10通过，\newline
不等于未知攻击安全证明。任务时延完整组p50/p95：FP50/FP95 ms，对照组CP50/CP95 ms。\newline
每任务一次运行，排除真人等待与模型推理；数据源：evals/results/offline-20261021.json。};
\end{tikzpicture}
\end{document}
'''
replacements = {'FCASE':full['cases_passed'],'CCASE':control['cases_passed'],'FGOAL':full['tasks_completed'],'CGOAL':control['tasks_completed'],'FCONF':full['confirmation_actions'],'CCONF':control['confirmation_actions'],'FOTP':full['otp_submissions'],'COTP':control['otp_submissions'],'FP50':full['task_latency_p50_ms'],'FP95':full['task_latency_p95_ms'],'CP50':control['task_latency_p50_ms'],'CP95':control['task_latency_p95_ms']}
for key,value in replacements.items(): tex=tex.replace(key,str(value))
(here/'evaluation.tex').write_text(tex,encoding='utf-8')
for n in (1,2):
    run=subprocess.run([shutil.which('xelatex'),'--disable-installer','-interaction=nonstopmode','-halt-on-error','evaluation.tex'],cwd=here,capture_output=True)
    (here/f'evaluation.pass{n}.txt').write_bytes(run.stdout+run.stderr)
    if run.returncode: raise SystemExit(run.stdout.decode('utf-8','replace')[-3000:])
subprocess.run([shutil.which('pdftoppm'),'-png','-r','160','-singlefile','evaluation.pdf','evaluation.preview'],cwd=here,check=True)
print('Generated evaluation.tex, evaluation.csv, vector PDF and PNG from measured JSON.')
