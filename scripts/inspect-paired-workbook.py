"""Extract the supplied before/after workbook without changing any source cells."""
import argparse
import hashlib
import json
from pathlib import Path

import openpyxl


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    args = parser.parse_args()
    workbook = openpyxl.load_workbook(args.source, read_only=True, data_only=True)
    worksheet = workbook["200 Scenarios"]
    table = list(worksheet.values)
    headers = table[0]
    rows = [dict(zip(headers, row)) for row in table[1:] if row[0] is not None]
    assert len(rows) == 200 and len({r["Scenario"] for r in rows}) == 200
    assert all(value is not None for row in rows for value in row.values())
    payload = {
        "source": {"file": args.source.name, "path": str(args.source.resolve()),
                   "sha256": hashlib.sha256(args.source.read_bytes()).hexdigest(),
                   "sheet": worksheet.title, "range": "A1:AC201"},
        "assumptions": [row[0] for row in workbook["Assumptions"].values if row[0]],
        "headers": list(headers), "rows": rows,
    }
    args.destination.parent.mkdir(parents=True, exist_ok=True)
    args.destination.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    workbook.close()
    print(json.dumps({"source": payload["source"], "rows": len(rows)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
