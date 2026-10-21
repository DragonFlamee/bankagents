"""Compile the five editable TikZ figures twice and render review PNGs."""
from pathlib import Path
import json
import shutil
import subprocess

HERE = Path(__file__).resolve().parent
ENGINE = shutil.which("xelatex")
RENDERER = shutil.which("pdftoppm")
FIGURES = ["architecture", "authorization-flow", "transfer-sequence", "task-dag", "demo-storyboard"]


def main():
    if not ENGINE or not RENDERER:
        raise SystemExit("Existing xelatex and pdftoppm are required. No installation was attempted.")
    records = []
    for name in FIGURES:
        for pass_number in [1, 2]:
            result = subprocess.run([ENGINE, "--disable-installer", "-interaction=nonstopmode", "-halt-on-error", name + ".tex"], cwd=HERE, capture_output=True, timeout=90)
            (HERE / f"{name}.pass{pass_number}.txt").write_bytes(result.stdout + result.stderr)
            if result.returncode:
                print(result.stdout.decode("utf-8", "replace")[-6000:])
                raise SystemExit(f"{name}: compile pass {pass_number} failed ({result.returncode})")
        result = subprocess.run([RENDERER, "-png", "-r", "180", "-singlefile", name + ".pdf", name + ".preview"], cwd=HERE, capture_output=True, timeout=45)
        if result.returncode:
            raise SystemExit(result.stderr.decode("utf-8", "replace"))
        log = (HERE / (name + ".log")).read_text(encoding="utf-8", errors="replace")
        warnings = [line for line in log.splitlines() if any(word in line for word in ["Overfull", "Missing character", "LaTeX Warning"])]
        records.append({"figure": name, "compile_passes": 2, "pdf_bytes": (HERE / (name + ".pdf")).stat().st_size, "png_bytes": (HERE / (name + ".preview.png")).stat().st_size, "warnings": warnings})
        print(name, "compiled twice and rendered;", "warnings:", warnings, flush=True)
    (HERE / "build-results.json").write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
