#!/usr/bin/env python3
"""
Downloads and processes VGC EV spread data from Smogon.
Saves only the Spreads + Raw count (strips moves, items, etc.).
Keeps last MONTHS_TO_KEEP months. Updates data/manifest.json.

Usage:
    python scripts/download_data.py
"""

import json, re, shutil, urllib.request, sys
from datetime import datetime, timedelta
from pathlib import Path

MONTHS_TO_KEEP = 3
DATA_DIR = Path("data")
FORMATS = ["bo1", "bo3"]
ELO_LEVELS = ["0", "1500", "1630", "1760"]
SMOGON_BASE = "https://www.smogon.com/stats"
CHAMPIONS_REGS = {"regma", "regmb", "regmc"}

HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; VGC-EV-Analyzer/1.0)"}


def build_url(year_month: str, regulation: str, fmt: str, elo: str, year: str = None) -> str:
    if year is None:
        year = year_month.split("-")[0]
    suffix = "bo3" if fmt == "bo3" else ""
    if regulation in CHAMPIONS_REGS:
        prefix = f"gen9championsvgc{year}{regulation}"
    else:
        prefix = f"gen9vgc{year}{regulation}"
    return f"{SMOGON_BASE}/{year_month}/chaos/{prefix}{suffix}-{elo}.json"


def fetch_json(url: str):
    try:
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read())
    except Exception:
        return None


def scrape_regulations(year_month: str):
    """Scrape the Smogon stats index to find available regulations and ELOs."""
    url = f"{SMOGON_BASE}/{year_month}/"
    try:
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=10) as r:
            html = r.read().decode("utf-8")
    except Exception:
        return set(), set()

    regs, elos = set(), set()
    for m in re.finditer(r"gen9vgc\d{4}(reg[a-z])(bo[13])?-(\d+)\.txt", html):
        regs.add(m.group(1))
        elos.add(m.group(3))
    for m in re.finditer(r"gen9championsvgc\d{4}(reg[a-z]+)(bo[13])?-(\d+)\.txt", html):
        regs.add(m.group(1))
        elos.add(m.group(3))
    return regs, elos


def extract_spreads_only(full_data: dict) -> dict:
    """Strip everything except Spreads and Raw count to keep files small."""
    pokemon = full_data.get("data", full_data)
    result = {"info": full_data.get("info", {}), "data": {}}
    for name, info in pokemon.items():
        spreads = info.get("Spreads")
        if spreads:
            result["data"][name] = {
                "Raw count": info.get("Raw count", 0),
                "Spreads": spreads,
            }
    return result


def candidate_months():
    today = datetime.utcnow()
    y, m = today.year, today.month
    for _ in range(6):
        yield f"{y}-{m:02d}"
        m -= 1
        if m < 1:
            m, y = 12, y - 1


def main():
    DATA_DIR.mkdir(exist_ok=True)
    all_files = []
    kept_months = []

    for year_month in candidate_months():
        if len(kept_months) >= MONTHS_TO_KEEP:
            break
        print(f"\n=== {year_month} ===")
        regs, elos = scrape_regulations(year_month)
        if not regs:
            print("  No data found, skipping")
            continue

        month_dir = DATA_DIR / year_month
        month_dir.mkdir(exist_ok=True)
        found_any = False

        for reg in sorted(regs):
            for fmt in FORMATS:
                for elo in sorted(elos, key=int):
                    url = build_url(year_month, reg, fmt, elo)
                    data = fetch_json(url)
                    if data is None:
                        prev_year = str(int(year_month.split("-")[0]) - 1)
                        url2 = build_url(year_month, reg, fmt, elo, year=prev_year)
                        data = fetch_json(url2)
                    if data is None:
                        print(f"  {reg:8s} {fmt} ELO{elo:>4s}: not found")
                        continue

                    processed = extract_spreads_only(data)
                    out_path = month_dir / f"{reg}_{fmt}_{elo}.json"
                    with open(out_path, "w", encoding="utf-8") as f:
                        json.dump(processed, f, ensure_ascii=False, separators=(",", ":"))

                    kb = out_path.stat().st_size // 1024
                    n_pokemon = len(processed["data"])
                    print(f"  {reg:8s} {fmt} ELO{elo:>4s}: {n_pokemon} Pokémon, {kb} KB")
                    all_files.append(
                        {"month": year_month, "regulation": reg, "format": fmt, "elo": elo}
                    )
                    found_any = True

        if found_any:
            kept_months.append(year_month)
        elif month_dir.exists() and not any(month_dir.iterdir()):
            month_dir.rmdir()

    # Remove directories older than kept_months
    for d in DATA_DIR.iterdir():
        if d.is_dir() and d.name not in kept_months:
            print(f"\nRemoving old data: {d.name}")
            shutil.rmtree(d)

    # Write manifest
    manifest = {
        "last_updated": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        "available_months": kept_months,
        "files": all_files,
    }
    with open(DATA_DIR / "manifest.json", "w") as f:
        json.dump(manifest, f, indent=2)

    print(f"\nDone: {len(all_files)} files across {len(kept_months)} months")
    print(f"Manifest written to {DATA_DIR / 'manifest.json'}")


if __name__ == "__main__":
    main()
