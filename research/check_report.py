"""Deterministic local checks for the rapid-review deliverable; no network audit."""
import hashlib
import json
import re
from pathlib import Path
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parents[1]
report = ROOT / "report.md"
text = report.read_text(encoding="utf-8")
sources = json.loads((ROOT / "research/sources.json").read_text(encoding="utf-8"))["sources"]
keys = {s["citation_key"] for s in sources}
refs = list(re.finditer(r"<!--ref:([a-zA-Z0-9_-]+)-->", text))
issues = []
for ref in refs:
    anchor = re.match(r"\s*<!--anchor:(quote|page|section|paragraph):([^>]+)-->", text[ref.end():])
    if not anchor or not unquote(anchor[2]).strip():
        issues.append({"key": ref[1], "issue": "missing_or_empty_non_none_anchor"})
    if ref[1] not in keys:
        issues.append({"key": ref[1], "issue": "unknown_source_key"})
    if anchor and anchor[1] == "quote" and len(unquote(anchor[2]).split()) > 25:
        issues.append({"key": ref[1], "issue": "quote_over_25_words"})
if "<!--anchor:none:" in text:
    issues.append({"issue": "explicit_none_anchor"})
for target in re.findall(r"\]\(([^)]+)\)", text):
    if not target.startswith(("http://", "https://", "#")) and not (ROOT / target).exists():
        issues.append({"issue": "missing_local_link", "target": target})
emitted_keys = {r[1] for r in refs}
if keys != emitted_keys:
    issues.append({"issue": "source_ref_set_mismatch", "uncited": sorted(keys - emitted_keys), "unknown": sorted(emitted_keys - keys)})
result = {
    "checker": "local-report-shape-check/1.0",
    "input_sha256": hashlib.sha256(report.read_bytes()).hexdigest(),
    "source_count": len(sources),
    "citation_count": len(refs),
    "unique_cited_sources": len(emitted_keys),
    "cjk_character_count": len(re.findall(r"[\u3400-\u9fff]", text)),
    "whitespace_token_count": len(text.split()),
    "issues": issues,
    "status": "passed" if not issues else "failed",
    "scope": "Anchor presence/kind, source-key correspondence and local-link existence only. No independent semantic or source-content audit.",
}
(ROOT / "research/report-check.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps(result, ensure_ascii=False, indent=2))
raise SystemExit(bool(issues))
