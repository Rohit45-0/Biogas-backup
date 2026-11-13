"""Merge the two supplied Task 2 scenario sources, preserving original values."""
from pathlib import Path
from collections import Counter
import hashlib
import json
import shutil
import openpyxl

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "ai-workflow/research/reactor-study-2026-11-09"
FILES = [
    ("A", Path.home()/"Downloads/Aquaivolt High-Rate AD incl. CSTR  200 Scenarios.xlsx"),
    ("B", Path.home()/"Downloads/Aquaivolt High-Rate AD  HRT Hours, 200 Scenarios.xlsx"),
]

def save(name, value):
    (OUT/name).write_text(json.dumps(value, indent=2, ensure_ascii=False, allow_nan=False)+"\n", encoding="utf-8")

def outputs(gas, fraction):
    methane=gas*fraction/100
    electricity=methane*9.97*.36
    return dict(biogasM3Day=gas,methanePct=fraction,methaneM3Day=methane,electricityKwhDay=electricity,annualElectricityKwh=electricity*365)

def main():
    OUT.mkdir(parents=True,exist_ok=True);(OUT/"sources").mkdir(exist_ok=True)
    sources=[];archives=[];scenarios=[];raw_records=[];headers=None
    for prefix,path in FILES:
        digest="sha256:"+hashlib.sha256(path.read_bytes()).hexdigest()
        workbook=openpyxl.load_workbook(path,read_only=True,data_only=False)
        sheets={sheet.title:[list(row) for row in sheet.values] for sheet in workbook}
        workbook.close()
        rows=sheets["200 Scenarios"]
        assert len(rows)==201 and len(rows[0])==31
        assert headers is None or headers==rows[0]
        headers=rows[0]
        assert all(all(value is not None for value in row) for row in rows[1:])
        assert len({row[0] for row in rows[1:]})==200
        shutil.copy2(path,OUT/"sources"/path.name)
        sources.append(dict(id=prefix,file=path.name,sha256=digest,scenarioCount=200,pathways=dict(Counter(row[1] for row in rows[1:]))))
        archives.append(dict(file=path.name,sha256=digest,sheets=sheets))
        for rownum,row in enumerate(rows[1:],2):
            identifier=f"T2-{prefix}-{row[0]:04d}"
            provenance=dict(file=path.name,sha256=digest,sourceId=prefix,sheet="200 Scenarios",row=rownum,sourceUrl=row[30])
            scenarios.append(dict(id=identifier,sourceScenario=row[0],pathway=row[1],technology=row[2],configuration=row[3],
                hrtHours=row[10],srtDays=row[12],temperatureC=row[13],ph=row[14],upflowMHour=row[15],olr=row[16],
                olrBasis="UNRESOLVED_COD_VS" if row[1].startswith("C") else "COD",outputs=outputs(row[18],row[17]),
                workbookBefore=dict(hrtHours=row[4],biogasM3Day=row[5],methanePct=row[6],methaneM3Day=row[7],electricityKwhDay=row[8],annualElectricityKwh=row[9]),
                h2sInPpm=row[27],h2sOutPpm=row[28],stabilityPct=row[29],provenance=provenance))
            raw_records.append([identifier,path.name,"200 Scenarios",rownum,digest,*row])
    assert len(scenarios)==400 and len({row["id"] for row in scenarios})==400
    old=json.loads((ROOT/"ai-workflow/research/hrt-optimization-2026-11-08/source-manifest.json").read_text())
    technologies=[]
    for technology in old["technologies"]:
        rows=[row for row in scenarios if row["pathway"]==technology["id"]]
        technologies.append({**technology,"scenarioCount":len(rows),"observedHrtHours":[min(row["hrtHours"] for row in rows),max(row["hrtHours"] for row in rows)],
            "defaultBaselineId":rows[0]["id"],"baselinePolicy":"First source row in this pathway, chosen in source order without screening outcomes; user can select another row."})
    save("source-manifest.json",dict(version="reactor-study-2026-11-09-v1",sources=sources,sourceCount=400,technologies=technologies,
        energy=old["energy"],workbookReference=old["baseline"],dataRole="WORKBOOK_PLANNING_SIMULATION",
        mergePolicy="All 400 source records retained with file-qualified IDs. No fully identical rows across files. Related simulations are not independent plant observations.",
        baselinePolicy="Same-reactor studies use an explicit source scenario or entered operating conditions. The fixed 360-hour conventional CSTR reference is only for technology upgrades.",
        calculationBasis=old["calculationBasis"]))
    save("scenarios.json",scenarios)
    save("source-archive.json",archives)
    save("merged-workbook-data.json",dict(headers=["Record ID","Source file","Source sheet","Source row","Source SHA-256",*headers],records=raw_records))
    save("reconciliation.json",dict(sourceRows=400,uniqueRecordIds=400,originalIdsReusedAcrossFiles=200,exactDuplicateRows=400-len({tuple(row[5:]) for row in raw_records}),
        unresolvedOlrRows=sum(row["olrBasis"]=="UNRESOLVED_COD_VS" for row in scenarios),pathwayCounts=dict(Counter(row["pathway"] for row in scenarios)),
        allBeforeRowsUseConventionalCstr=all(row["workbookBefore"]==scenarios[0]["workbookBefore"] for row in scenarios)))
    print(json.dumps({"records":400,"technologyCounts":{row["id"]:row["scenarioCount"] for row in technologies},"baselineIds":{row["id"]:row["defaultBaselineId"] for row in technologies}}))

if __name__=="__main__":main()
