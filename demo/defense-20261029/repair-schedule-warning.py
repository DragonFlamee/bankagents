"""Patch extracted reference XML only; use the skill's unpack/clean/pack CLIs.

The committed, manually adjusted reference deck is the layout authority.
Its old template generator differs, so rebuilding that generator would lose
the user's edits. All unrelated package parts must remain byte-identical.
"""
from pathlib import Path
from lxml import etree as ET
import hashlib, json, subprocess, sys, zipfile, time

ROOT=Path(__file__).resolve().parents[2]
WORK=ROOT/'.build/schedule-ppt-repair'
INPUT=WORK/'before.pptx'
TREE=WORK/('unpacked-'+str(time.time_ns()))
SOURCE='89c39bc'
PART='demo/tracebank-technical-defense-20261029.pptx'
NS={'p':'http://schemas.openxmlformats.org/presentationml/2006/main','a':'http://schemas.openxmlformats.org/drawingml/2006/main'}
SKILL=Path.home()/'.codex/skills/presentation-skill'
PY=SKILL/'.venv/Scripts/python.exe'
OUT=ROOT/'demo/defense-20261029/repaired.pptx'

def cli(script,*args):
    subprocess.run([str(PY),str(SKILL/'scripts'/script),*map(str,args)],check=True)

def text(node):return ''.join(node.itertext()) if node.tag.endswith('}t') else ''.join(node.xpath('.//a:t/text()',namespaces=NS))

def set_text(node,value):
    runs=node.xpath('.//a:t',namespaces=NS)
    assert runs,'No text runs to replace'
    runs[0].text=value
    for run in runs[1:]:run.text=''

WORK.mkdir(parents=True,exist_ok=True)
INPUT.write_bytes(subprocess.check_output(['git','show',SOURCE+':'+PART],cwd=ROOT))
assert not TREE.exists(),'Use a fresh work tree for a reproducible patch'
cli('unpack_pptx.py','--input',INPUT,'--outdir',TREE)
changes=[]

def edit(part,fn):
    path=TREE/part
    original=path.read_bytes()
    doc=ET.fromstring(original)
    fn(doc)
    path.write_bytes(ET.tostring(doc,xml_declaration=True,encoding='UTF-8',standalone=True))
    changes.append({'part':part,'before_sha256':hashlib.sha256(original).hexdigest(),'after_sha256':hashlib.sha256(path.read_bytes()).hexdigest()})

def slide15(doc):
    tree=doc.find('p:cSld/p:spTree',NS)
    for sid,expected in [('10',''),('11','已知未修复的问题'),('12','预约转账到期执行时，没有重新计算当日累计')]:
        found=tree.xpath('./p:sp[p:nvSpPr/p:cNvPr[@id="'+sid+'"]]',namespaces=NS)
        assert len(found)==1
        if expected:assert expected in text(found[0])
        tree.remove(found[0])
    cells=doc.xpath('.//a:tbl/a:tr[2]/a:tc',namespaces=NS)
    assert '183 项离线测试' in text(cells[0])
    set_text(cells[0],'201 项离线测试，全部通过')
    set_text(cells[1],'金额、限额、认证、幂等、DAG、沙箱及预约到期验证')

def slide19(doc):
    cells=doc.xpath('.//a:tbl/a:tr[4]/a:tc',namespaces=NS)
    assert text(cells[0])=='授权与幂等'
    assert '预约累计问题' in text(cells[2])
    set_text(cells[1],'bank.py · test_scheduled_authorization.py')
    set_text(cells[2],'同应用演示验证码')

edit('ppt/slides/slide15.xml',slide15)
edit('ppt/slides/slide19.xml',slide19)
notes={
 9:'三个级别由银行服务根据业务参数决定，模型不能降低权限。绿色查询直接读取，黄色操作固定详情后由本人确认，红色要求操作绑定验证码。普通转账及预约到期均复核实际执行日累计。先普通转300元再到期执行1000元预约时，后者停在待验证，尚未付款；到审批中心验证后才提交。每月每次预约都有独立操作与验证码，创建时的旧授权不能替代到期验证。',
 15:'本轮201项离线测试全部通过，其中18项为预约到期验证专项。覆盖普通300元加预约1000元、1000元边界、月度独立验证、重复调度、取消、过期、余额不足、未知状态对账、故障重试、用户隔离和旧数据库迁移。真实浏览器验证了资金日程到审批和验证码付款、取消及390像素布局。此前30组页面检查来自2026-10-26，不能当作本轮全部重测。新增六场景仍缺完整真实模型验收，同应用验证码仍为演示认证。',
 16:'模型输出候选计划，服务端校验后执行；授权和记账由银行服务处理；回答引用工具事实和回执。预约到期的实际日累计复核已修复并有离线与浏览器证据。后续继续做新增六场景完整真实模型验收和独立多因子认证。现有截图是离线模拟，不冒称现场或真实银行结果。'
}
for num,value in notes.items():
 def update(doc,value=value):
    body=doc.xpath('.//p:sp[p:nvSpPr/p:nvPr/p:ph[@type="body"]]/p:txBody',namespaces=NS)
    assert len(body)==1
    set_text(body[0],value)
 edit(f'ppt/notesSlides/notesSlide{num}.xml',update)

cli('clean_unpacked.py','--input',TREE)
cli('pack_pptx.py','--indir',TREE,'--output',OUT,'--overwrite')
expected={c['part'] for c in changes}
with zipfile.ZipFile(INPUT) as old,zipfile.ZipFile(OUT) as new:
    old_parts={name for name in old.namelist() if not name.endswith('/')}
    new_parts={name for name in new.namelist() if not name.endswith('/')}
    assert old_parts==new_parts,'Unexpected package part change'
    changed={name for name in old_parts if old.read(name)!=new.read(name)}
    assert changed==expected,changed^expected
    for name in new.namelist():
        if name.endswith('.xml'):
            value=''.join(ET.fromstring(new.read(name)).xpath('//a:t/text()',namespaces=NS))
            assert not any(term in value for term in ['已知未修复的问题','我们没修完的问题','最需要修的问题','预约累计问题','修预约转账那个累计问题'])
report={'date':'2026-10-29','baseline_commit':SOURCE,'input_sha256':hashlib.sha256(INPUT.read_bytes()).hexdigest(),'output_sha256':hashlib.sha256(OUT.read_bytes()).hexdigest(),'changes':changes,'removed_slide_15_shapes':[10,11,12],'unchanged_other_package_parts':True,'output':str(OUT)}
(ROOT/'demo/defense-20261029/schedule-repair-manifest.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'passed':True,'modified_parts':len(changes),'all_other_parts_identical':True,'output':str(OUT)},ensure_ascii=True))
