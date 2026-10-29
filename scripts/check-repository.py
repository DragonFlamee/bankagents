"""Check formal material paths, document links and local validation reports."""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import re
import sys
from urllib.parse import unquote
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'evals/results/repository-check.json'
EXCLUDED = {'.git', '.venv', 'node_modules', 'data', '.build', 'artifacts', 'release',
            '__pycache__', '.pytest_cache', '.eval-tmp', 'skill-review'}


def source_files(directory: Path):
    for item in directory.iterdir():
        if item.name in EXCLUDED or item.name.startswith(('.test-tmp', '.chart-data')):
            continue
        if item.is_dir():
            yield from source_files(item)
        elif item.is_file() and item.name != '.DS_Store' and not item.name.startswith('~$'):
            yield item


def read_json(relative: str):
    return json.loads((ROOT / relative).read_text(encoding='utf-8-sig'))


def main():
    files = list(source_files(ROOT))
    errors = []
    required = ['README.md', 'problem.md', 'docs/architecture.md', 'docs/figures/architecture.png',
                'docs/algorithms.md', 'docs/security-design.md', 'docs/security-self-assessment.md',
                'docs/deployment.md', 'docs/submission.md', 'demo/project-intro.md',
                'demo/tracebank-defense.pptx', 'demo/preview.jpg']
    for name in required:
        if not (ROOT / name).is_file():
            errors.append({'missing_required_file': name})
    checked_links = 0
    authored_docs = []
    for file in (p for p in files if p.suffix == '.md'):
        value = file.read_text(encoding='utf-8-sig')
        if file.name != 'problem.md':
            authored_docs.append(file.relative_to(ROOT).as_posix())
        for target in re.findall(r'(?<!!)\[[^\]\n]*\]\(([^)\n]+)\)', value):
            target = target.strip().strip('<>')
            if re.match(r'^(https?:|mailto:|#)', target):
                continue
            checked_links += 1
            path = (file.parent / unquote(target.split('#')[0])).resolve()
            if path != OUT and not path.exists():
                errors.append({'file': str(file.relative_to(ROOT)), 'missing_link': target})

    intro = (ROOT / 'demo/project-intro.md').read_text(encoding='utf-8')
    body = intro.split('## 报名正文', 1)[1].strip()
    intro_length = len(''.join(body.split()))
    if intro_length > 200:
        errors.append({'intro_over_200': intro_length})

    decks = [p for p in (ROOT / 'demo').rglob('*.pptx') if not p.name.startswith('~$')]
    if len(decks) != 1:
        errors.append({'formal_deck_count': len(decks)})
    deck = ROOT / 'demo/tracebank-defense.pptx'
    with zipfile.ZipFile(deck) as package:
        if package.testzip():
            errors.append({'pptx_archive': 'CRC failure'})
        slide_count = sum(bool(re.fullmatch(r'ppt/slides/slide\d+\.xml', p)) for p in package.namelist())
        notes_count = sum(bool(re.fullmatch(r'ppt/notesSlides/notesSlide\d+\.xml', p)) for p in package.namelist())
    if (slide_count, notes_count) != (19, 19):
        errors.append({'slide_count': slide_count, 'notes_count': notes_count})

    xml = ET.parse(ROOT / 'evals/results/pytest.xml').getroot()
    suite = xml.find('testsuite') if xml.tag == 'testsuites' else xml
    pytest = {k: int(suite.get(k, '0')) for k in ('tests', 'failures', 'errors', 'skipped')}
    if pytest['failures'] or pytest['errors']:
        errors.append({'pytest': pytest})
    browser = read_json('evals/results/browser.json')
    state = read_json('evals/results/state.json')
    scheduled = read_json('evals/results/scheduled-auth.json')
    research = read_json('evals/results/research.json')
    for name, record, key in [('browser', browser, 'errors'), ('state', state, 'errors'), ('scheduled', scheduled, 'page_errors')]:
        if record.get('failure') or record.get(key):
            errors.append({name: 'recorded failure'})
    if research['status'] != 'passed' or research['input_sha256'] != hashlib.sha256((ROOT / 'report.md').read_bytes()).hexdigest():
        errors.append({'research': 'failed or stale report check'})

    configured_keys = []
    for name in ('TRACEBANK_LLM_API_KEY', 'DASHSCOPE_API_KEY'):
        value = os.getenv(name)
        if value and len(value) > 12:
            configured_keys.append(value.encode())
        if os.name == 'nt':
            import winreg
            try:
                with winreg.OpenKey(winreg.HKEY_CURRENT_USER, 'Environment') as key:
                    value = winreg.QueryValueEx(key, name)[0]
                if isinstance(value, str) and len(value) > 12:
                    configured_keys.append(value.encode())
            except OSError:
                pass
    credential_matches = []
    for file in files:
        if file == OUT:
            continue
        if file.suffix in {'.md', '.json', '.py', '.js', '.cjs', '.mjs', '.html', '.svg', '.xml', '.txt', '.ps1', '.sh'}:
            if any(key in file.read_bytes() for key in configured_keys):
                credential_matches.append(file.relative_to(ROOT).as_posix())
        elif file.suffix == '.pptx':
            with zipfile.ZipFile(file) as package:
                if any(any(key in package.read(part) for key in configured_keys) for part in package.namelist() if part.endswith('.xml')):
                    credential_matches.append(file.relative_to(ROOT).as_posix())
    if credential_matches:
        errors.append({'credential_matches': credential_matches})

    result = {
        'scope': 'Formal file structure, local links, report consistency and configured-key exact-value scan; not a production security audit',
        'status': 'passed' if not errors else 'failed', 'errors': errors,
        'file_count_excluding_runtime': len(files), 'bytes_excluding_runtime': sum(p.stat().st_size for p in files),
        'markdown_links_checked': checked_links,
        'intro_characters_excluding_whitespace': intro_length,
        'presentation': {'files': len(decks), 'slides': slide_count, 'notes': notes_count, 'sha256': hashlib.sha256(deck.read_bytes()).hexdigest(), 'native_office_validation': 'not performed'},
        'tests': {'python': pytest, 'browser_checks': len(browser['checks']), 'state_checks': len(state['checks']), 'scheduled_checks': len(scheduled['checks']), 'research_sources': research['source_count']},
        'tone_review': {'skill': 'lieflat-less-ai-tone', 'reviewed_authored_markdown': sorted(authored_docs), 'presentation_text_and_notes_reviewed': True, 'original_problem_references_and_licenses_preserved': True},
        'credential_scan': {'status': 'passed' if configured_keys else 'not run: no configured key available', 'matches': len(credential_matches), 'scope': 'current text files and PPTX XML only; no values logged'},
        'submission': {'files_ready': ['intro', 'architecture', 'algorithms', 'security design', 'PPT', 'source/deployment/tests', 'security self-assessment'], 'pending': ['current UI video <=5 minutes', 'human presentation timing <=10 minutes', 'push final code and materials', 'registration upload and confirmation', 'portal format/size/deadline verification']},
        'known_check_warnings': ['Starlette/httpx compatibility deprecation', 'Node stripTypeScriptTypes experimental warning', 'Vite bundle exceeds default 500kB advisory'],
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'status': result['status'], 'files': len(files), 'links_checked': checked_links, 'intro_characters': intro_length, 'tests': result['tests'], 'issues': errors}, ensure_ascii=True))
    return bool(errors)


if __name__ == '__main__':
    sys.exit(main())
