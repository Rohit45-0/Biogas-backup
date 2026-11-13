"""Read original workbook values without modifying the source files."""
import ast
import hashlib
import json
from pathlib import Path
import posixpath
import sys
import xml.etree.ElementTree as ET
import zipfile

root = Path(__file__).resolve().parents[1]
source = root / 'ai-workflow/src/research_model_study.py'
tree = ast.parse(source.read_text(encoding='utf-8'))
reader = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == 'read_workbooks')
exec(compile(ast.Module(body=[reader], type_ignores=[]), str(source), 'exec'))
books = read_workbooks(Path(sys.argv[1]))
out = root / 'test-results/calculation-audit'
out.mkdir(parents=True, exist_ok=True)
(out / 'original-workbooks.json').write_text(json.dumps(books, ensure_ascii=False, indent=2), encoding='utf-8')
for book in books:
    print(book['file'], book['sha256'])
    for sheet in book['sheets']:
        print('  ', sheet['name'], 'rows:', sheet['row_count'])
        if 'Hours-Scale AI Synthetic 500' == sheet['name'] or 'Assumptions' in sheet['name'] or 'Field_Explanation' == sheet['name']:
            print(json.dumps(sheet['rows'][:10], ensure_ascii=False))
