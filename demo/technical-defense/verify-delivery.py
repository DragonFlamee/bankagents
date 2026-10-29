"""Read-only validation of delivery artifacts, then save a scoped QA receipt."""
from pathlib import Path
from urllib.parse import unquote
import hashlib, json, os, re, subprocess, sys, winreg, zipfile

base=Path(__file__).resolve().parent
root=base.parents[1]
load=lambda p:json.loads(p.read_text(encoding='utf-8-sig'))
stats=load(base/'build/package-stats.json')
qa=load(base/'build/qa/qa_report.json')
renders=load(base/'build/supplemental-renders/render-proof.json')
review=load(base/'build/visual-review-receipt.json')
ppt=root/'demo/tracebank-technical-defense-20261027.pptx'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert sha(ppt)==stats['delivery_sha256']==renders['pptx_sha256']==review['deck']['sha256']
assert qa['bound_visual_review_passed'] and qa['source_fidelity_error_count']==0
assert len(renders['images'])==17
for item in renders['images']:
 assert sha(base/'build/supplemental-renders'/item['path'])==item['sha256']

# Never print configured values, substrings or fingerprints of model credentials.
secrets=[]
for name in ('TRACEBANK_LLM_API_KEY','DASHSCOPE_API_KEY'):
 value=os.environ.get(name)
 if value and len(value)>12:secrets.append(value.encode())
 try:
  with winreg.OpenKey(winreg.HKEY_CURRENT_USER,'Environment') as key:
   value=winreg.QueryValueEx(key,name)[0]
   if isinstance(value,str) and len(value)>12:secrets.append(value.encode())
 except OSError:pass
secrets=list(set(secrets))
assert secrets,'No configured credential available for exact-value scan; do not claim it ran.'
suffixes={'.md','.json','.mjs','.cjs','.js','.py','.svg','.html','.txt','.csv'}
texts=[p for p in base.rglob('*') if p.is_file() and p.suffix in suffixes]
texts += [root/'README.md',*list((root/'docs').glob('*.md'))]
hits=[]
for p in texts:
 raw=p.read_bytes()
 if any(secret in raw for secret in secrets):hits.append(str(p.relative_to(root)))
with zipfile.ZipFile(ppt) as z:
 for name in z.namelist():
  if name.endswith('.xml') and any(secret in z.read(name) for secret in secrets):hits.append('PPTX:'+name)
assert not hits,'Credential scan found material needing removal; matched values withheld.'

docs=[root/'README.md',root/'docs/current-release.md',root/'docs/submission.md',root/'demo/agent-defense-script.md',*base.glob('*.md')]
bad=[];checked=0
for p in docs:
 for raw in re.findall(r'(?<!!)\[[^\]\n]*\]\(([^)\n]+)\)',p.read_text(encoding='utf-8-sig')):
  href=raw.strip().strip('<>')
  if re.match(r'^(https?:|mailto:|#)',href):continue
  target=(p.parent/unquote(href.split('#')[0])).resolve()
  if target==root/'evals/results/presentation-20261027.json':continue # created below
  checked+=1
  if not target.exists():bad.append({'file':str(p.relative_to(root)),'link':href})
assert not bad,json.dumps(bad,ensure_ascii=True)
business=subprocess.run(['git','diff','--name-only','--','banking_agent','apps','tests'],cwd=root,capture_output=True,text=True,check=True).stdout.strip()
assert not business,'Business source changed; recheck code-baseline claims.'
receipt={
 'date':'2026-10-27','source_commit':'18aa38d','scope':'PPT and technical materials only; business code unchanged',
 'skill':{'repository':'https://github.com/siril9/presentation-skill','installed_version':'0.14.0','build_route':'Official scripts/build_workspace.py; pptxgenjs renderer; structured workspace', 'full_runtime_doctor':'not_passed: optional data-analysis dependencies unavailable; core pinned PPT dependencies installed'},
 'delivery':{'path':'demo/'+ppt.name,'sha256':sha(ppt),'bytes':ppt.stat().st_size,**{k:stats[k] for k in ('slide_count','notes_count','native_table_count','native_text_shape_count','image_placement_count')},'main_slides':14,'appendix_slides':3,'editable_native_method_flows':2,'editable_svg_originals':7},
 'static_qa':{k:qa[k] for k in ('overflow_count','overlap_count','placeholder_hits','geometry_error_count','geometry_warning_count','whitespace_warning_count','design_error_count','design_warning_count','source_fidelity_checked_count','source_fidelity_error_count','source_fidelity_warning_count','accessibility_error_count','accessibility_warning_count','bound_visual_review_passed')},
 'rendering':{'standard_libreoffice':'not_run: LibreOffice unavailable','native_powerpoint_wps':'not_run','supplemental':renders,'supplemental_process_exit_code':1,'supplemental_status':'17 PNGs plus complete hash manifest produced and verified; nonzero process exit retained','model_visual_review':'All 17 final PNGs opened and reviewed individually, plus contact sheet','hash_bound_receipt':'demo/technical-defense/build/visual-review-receipt.json'},
 'checks':{'configured_credential_exact_scan':'passed','credential_match_count':0,'text_files_scanned':len(texts),'pptx_xml_scanned':True,'local_markdown_links_checked':checked,'missing_link_count':0,'business_code_changed':False,'git_diff_check':'passed'},
 'limitations':['Four static accessibility warnings retained: table context on slides 8/11/14 and generic-alt heuristic on slide 9; no screen-reader validation','No native Office compatibility validation','Timing is a 9m30s budget including 45s demo, not human rehearsal','Scheduled actual-day cumulative verification P1 remains unfixed','No complete real-model regression of the newly expanded six scenarios'],
 'supporting_files':{'script':'demo/technical-defense/defense-script.md','coverage':'demo/technical-defense/coverage-map.md','preview':'demo/technical-defense/preview.html','sources':'demo/technical-defense/outline.json'}
}
target=root/'evals/results/presentation-20261027.json'
target.write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'passed':True,'slides':17,'missing_links':0,'credential_matches':0,'qa_receipt':str(target)},ensure_ascii=True))
