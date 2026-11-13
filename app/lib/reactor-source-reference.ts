import archive from "../../ai-workflow/research/reactor-study-2026-11-09/merged-workbook-data.json";

// Read named columns from the preserved Excel extraction. In particular, neither
// HRT column is in days and AFTER HRT must never become the source BEFORE value.
const column = (name: string) => {
  const index = archive.headers.indexOf(name);
  if (index < 0) throw new Error(`Missing reactor source column: ${name}`);
  return index;
};
const text = (row: (string | number)[], name: string) => String(row[column(name)]);
const numeric = (row: (string | number)[], name: string) => {
  const value = row[column(name)];
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`Invalid reactor source value: ${name}`);
  return value;
};
const records = archive.records.map(row => ({
  id: text(row, "Record ID"), pathway: text(row, "Pathway"),
  hrtHours: numeric(row, "AFTER HRT (h)"),
  before: {
    hrtHours: numeric(row, "BEFORE HRT (h)"),
    biogasM3Day: numeric(row, "BEFORE Biogas (m3/d)"),
    methaneM3Day: numeric(row, "BEFORE Methane (m3/d)"),
    electricityKwhDay: numeric(row, "BEFORE Electricity (kWh/d)"),
  },
  after: {
    biogasM3Day: numeric(row, "AFTER Biogas (m3/d)"),
    methanePct: numeric(row, "CH4 (%)"),
    methaneM3Day: numeric(row, "AFTER Methane (m3/d)"),
    electricityKwhDay: numeric(row, "AFTER Electricity (kWh/d)"),
    annualElectricityKwh: numeric(row, "AFTER Annual elec (kWh/yr)"),
  },
  provenance: {
    file: text(row, "Source file"), sheet: text(row, "Source sheet"),
    row: numeric(row, "Source row"), sha256: text(row, "Source SHA-256"),
    beforeHrtColumn: "BEFORE HRT (h)", afterHrtColumn: "AFTER HRT (h)",
    hrtUnit: "hours" as const,
  },
}));
const byId = new Map(records.map(row => [row.id, row]));
export function reactorSourceRecord(id: string) {
  const row = byId.get(id);
  if (!row) throw new Error(`Reactor source record not found: ${id}`);
  return row;
}
export function reactorSourceReference(technology: string) {
  const rows = records.filter(row => row.pathway === technology), first = rows[0];
  if (!first) throw new Error("Reactor source reference is unavailable");
  // These two supplied files share their BEFORE reference. Refuse to silently
  // substitute a common reference if later files contain different baselines.
  if (rows.some(row => JSON.stringify(row.before) !== JSON.stringify(first.before))) {
    throw new Error("Source BEFORE values differ within this technology; a paired baseline is required");
  }
  return first;
}
export type ReactorSourceProvenance = typeof records[number]["provenance"];
