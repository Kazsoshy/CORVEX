from pathlib import Path
import re

out = Path(r"C:\Users\ASUS\CORVEX\docs\audit_extracts")
main = (out / "main_docx_pdf.txt").read_text(encoding="utf-8")
nof = (out / "nofigs_pdf.txt").read_text(encoding="utf-8")
docx = (out / "nofigs_docx.txt").read_text(encoding="utf-8")


def split_pages(text: str) -> dict[int, str]:
    pages = re.split(r"\n===== PAGE (\d+) / \d+ =====\n", text)
    page_map: dict[int, str] = {}
    i = 1
    while i < len(pages):
        num = int(pages[i])
        content = pages[i + 1] if i + 1 < len(pages) else ""
        page_map[num] = content
        i += 2
    return page_map


page_map = split_pages(main)
pages_dir = out / "main_pages"
pages_dir.mkdir(exist_ok=True)
for n, c in page_map.items():
    (pages_dir / f"page_{n:02d}.txt").write_text(c, encoding="utf-8")
print("main pages written", len(page_map))

page_map2 = split_pages(nof)
pages_dir2 = out / "nof_pages"
pages_dir2.mkdir(exist_ok=True)
for n, c in page_map2.items():
    (pages_dir2 / f"page_{n:02d}.txt").write_text(c, encoding="utf-8")
print("nof pages written", len(page_map2))

keywords = [
    "objective",
    "scope",
    "limitation",
    "SAW",
    "Outstanding Balance",
    "Days Overdue",
    "Distance",
    "Leaflet",
    "OpenStreetMap",
    "Nominatim",
    "OpenRouteService",
    "PostGIS",
    "offline",
    "Inventory Centralization",
    "payment",
    "dashboard",
    "notification",
    "Collector",
    "Sales Agent",
    "Branch Head",
    "Operating Manager",
    "Warehouse",
    "Customer",
    "role",
    "permission",
    "functional",
    "non-functional",
    "software",
    "hardware",
    "IPO",
    "conceptual",
    "architecture",
    "module",
    "workflow",
    "evaluate",
    "test",
    "ISO",
    "SUS",
    "UAT",
    "React",
    "Node",
    "PostgreSQL",
    "Firebase",
    "PWA",
    "QR",
    "geofenc",
    "route",
    "FR-",
    "NFR-",
    "REQ-",
    "Table ",
    "Figure ",
]
report = []
for kw in keywords:
    hits = [str(n) for n, c in page_map.items() if kw.lower() in c.lower()]
    report.append(f"{kw}: pages {','.join(hits) if hits else 'NONE'}")
(out / "keyword_index_main.txt").write_text("\n".join(report), encoding="utf-8")
print("keyword index done")

heading_lines = []
for line in docx.splitlines():
    if line.startswith("[Heading") or line.startswith("[Title") or re.match(
        r"\[Normal\]\s*\d+\.", line
    ):
        heading_lines.append(line[:250])
(out / "docx_headings.txt").write_text("\n".join(heading_lines), encoding="utf-8")
print("docx headings", len(heading_lines))

# Extract TOC-like numbered section starts from main
section_pat = re.compile(
    r"(?m)^(\d+(?:\.\d+){0,4})\.?\s+([A-Z][^\n]{2,100})$"
)
secs = []
for n, c in page_map.items():
    for m in section_pat.finditer(c):
        secs.append(f"p{n}: {m.group(1)} {m.group(2).strip()}")
(out / "section_candidates_main.txt").write_text("\n".join(secs), encoding="utf-8")
print("section candidates", len(secs))
