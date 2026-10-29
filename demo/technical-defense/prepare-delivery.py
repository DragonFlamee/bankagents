"""Package existing output and previews; never author or patch PPTX content."""
from pathlib import Path
from html import escape
from PIL import Image, ImageDraw, ImageFont
import json, shutil, hashlib, zipfile, xml.etree.ElementTree as ET

base=Path(__file__).resolve().parent
outline=json.loads((base/'outline.json').read_text(encoding='utf-8'))
source=base/'build/tracebank-technical-defense-20261027.pptx'
target=base.parent/source.name
shutil.copyfile(source,target)
slides=outline['slides']
nav=''.join(f'<a href="#slide-{i:02}">{i:02}</a>' for i in range(1,len(slides)+1))
pages=''.join(f'<section id="slide-{i:02}"><h2>{i:02} · {escape(s["title"])}</h2><img src="build/supplemental-renders/slide-{i:02}.png" alt="第{i}页：{escape(s["title"],quote=True)}" loading="lazy"></section>' for i,s in enumerate(slides,1))
html='''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TraceBank 技术答辩逐页预览</title><style>
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:#edf1f5;color:#142237;font:16px/1.6 "Microsoft YaHei",sans-serif}header,main{max-width:1440px;margin:auto;padding:24px}h1{font-size:26px;margin:0}h2{font-size:18px;font-weight:500}p{color:#46556a}a{color:#245d9b}nav{display:flex;gap:8px;flex-wrap:wrap}nav a{background:white;border:1px solid #cbd4df;padding:4px 10px;text-decoration:none}section{scroll-margin:12px;margin:12px 0 40px}img{display:block;width:100%;height:auto;border:1px solid #cbd4df}@media print{nav{display:none}section{break-after:page}h2{font-size:12pt}header{display:none}}@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
</style><header><h1>TraceBank · 系统架构、核心算法与安全设计</h1><p>14页主讲＋3页附录。以下为实际PPTX的补充渲染；未进行原生PowerPoint验收。代码18aa38d，材料2026-10-27。</p><p><a href="../tracebank-technical-defense-20261027.pptx">打开PPT</a> · <a href="defense-script.md">讲稿</a> · <a href="coverage-map.md">技术文档对应</a></p><nav>'''+nav+'</nav></header><main>'+pages+'</main></html>'
(base/'preview.html').write_text(html,encoding='utf-8')
width,height=480,300
sheet=Image.new('RGB',(width*3,height*6),'#e8edf3')
draw=ImageDraw.Draw(sheet)
font=ImageFont.truetype('C:/Windows/Fonts/msyh.ttc',16)
for i,s in enumerate(slides,1):
 im=Image.open(base/f'build/supplemental-renders/slide-{i:02}.png').convert('RGB')
 im.thumbnail((456,257))
 x=((i-1)%3)*width+12;y=((i-1)//3)*height+10
 sheet.paste(im,(x,y))
 title=f'{i:02} '+s['title']
 while draw.textlength(title,font=font)>456:title=title[:-2]+'…'
 draw.text((x,y+264),title,fill='#24344a',font=font)
sheet.save(base/'preview-contact-sheet.jpg',quality=92)
ns={'p':'http://schemas.openxmlformats.org/presentationml/2006/main','a':'http://schemas.openxmlformats.org/drawingml/2006/main'}
with zipfile.ZipFile(source) as z:
 slidefiles=[n for n in z.namelist() if __import__('re').fullmatch(r'ppt/slides/slide\d+\.xml',n)]
 notes=[n for n in z.namelist() if __import__('re').fullmatch(r'ppt/notesSlides/notesSlide\d+\.xml',n)]
 roots=[ET.fromstring(z.read(n)) for n in slidefiles]
 stats={'slide_count':len(slidefiles),'notes_count':len(notes),'native_table_count':sum(len(r.findall('.//a:tbl',ns)) for r in roots),'image_placement_count':sum(len(r.findall('.//p:pic',ns)) for r in roots),'native_text_shape_count':sum(len(r.findall('.//p:sp/p:txBody',ns)) for r in roots)}
assert stats['slide_count']==17 and stats['notes_count']==17 and stats['native_table_count']==6
stats.update({'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'delivery_sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'delivery':str(target),'bytes':target.stat().st_size})
assert stats['source_sha256']==stats['delivery_sha256']
(base/'build/package-stats.json').write_text(json.dumps(stats,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(stats,ensure_ascii=True))
