import type {ResearchPoint} from "./hrt-research";

export const productionHrtMetrics = {
  biogasM3Day: {name: "Biogas", unit: "m³/day"},
  methaneM3Day: {name: "Methane", unit: "m³ CH₄/day"},
  electricityKwhDay: {name: "Electricity", unit: "kWh/day"},
} as const;
export type ProductionHrtMetric = keyof typeof productionHrtMetrics;
type ChartRun = {comparison: ResearchPoint | null; selected: ResearchPoint; candidates: ResearchPoint[]};
type Point = {id: string; x: number; y: number};

/** Project saved production evaluations onto HRT; do not run or modify either model. */
export function productionHrtChartData(run: ChartRun, metric: ProductionHrtMetric) {
  const pairedTime=run.selected.paired?.baselineHrtHours!==undefined;
  const candidates=pairedTime?run.candidates.filter(p=>p.paired?.input.pathway===run.selected.paired?.input.pathway):run.candidates;
  const points: Point[] = candidates.filter(p => Number.isFinite(p.hrtHours) && Number.isFinite(p[metric]))
    .map((p, i) => ({id: p.paired?.input.id ?? `candidate-${i}`, x: p.hrtHours, y: p[metric]}))
    .sort((a, b) => a.x - b.x || a.id.localeCompare(b.id));
  const baselinePoints = (pairedTime?[]:candidates).filter(p => p.paired && Number.isFinite(p.hrtHours) && Number.isFinite(p.paired.baseline[metric]))
    .map(p => ({x: p.hrtHours, y: p.paired!.baseline[metric]})).sort((a, b) => a.x - b.x);
  const baselineCurve = baselinePoints.filter((p, i) => i === 0 || p.x !== baselinePoints[i - 1].x);
  const baseline = run.comparison && Number.isFinite(run.comparison.hrtHours) && Number.isFinite(run.comparison[metric])
    ? {x: run.comparison.hrtHours, y: run.comparison[metric]} : null;
  const selected = Number.isFinite(run.selected.hrtHours) && Number.isFinite(run.selected[metric])
    ? {x: run.selected.hrtHours, y: run.selected[metric]} : null;
  const first = points[0]?.x ?? selected?.x ?? baseline?.x ?? 0;
  const span = (points.at(-1)?.x ?? first) - first;
  const bands = new Map<number, Point[]>();
  for (const p of points) {
    const index = span > 0 ? Math.min(11, Math.floor((p.x - first) / span * 12)) : 0;
    const band = bands.get(index) ?? [];
    band.push(p);
    bands.set(index, band);
  }
  // These are descriptive means across varying operating inputs, not an HRT-only fit.
  const trend = [...bands.values()].map(band => ({
    x: band.reduce((sum, p) => sum + p.x, 0) / band.length,
    y: band.reduce((sum, p) => sum + p.y, 0) / band.length,
    count: band.length,
  }));
  const all = [...points, ...baselineCurve, ...(baseline ? [baseline] : []), ...(selected ? [selected] : [])];
  const xs = all.map(p => p.x), ys = all.map(p => p.y);
  const xMin = xs.length ? Math.min(...xs) : 0, xMax = xs.length ? Math.max(...xs) : 1;
  const yMin = ys.length ? Math.min(...ys) : 0, yMax = ys.length ? Math.max(...ys) : 1;
  const xPad = Math.max((xMax - xMin) * .035, .1), yPad = Math.max((yMax - yMin) * .12, Math.abs(yMax) * .02, .1);
  const changeHours = baseline && selected ? selected.x - baseline.x : null;
  const outputChange = baseline && selected ? selected.y - baseline.y : null;
  return {
    points, trend, baselineCurve, baseline, selected, changeHours, outputChange,
    outputPct: outputChange === null || !baseline || baseline.y === 0 ? null : outputChange / baseline.y * 100,
    direction: changeHours === null ? "unavailable" : Math.abs(changeHours) < 1e-9 ? "unchanged" : changeHours < 0 ? "decrease" : "increase",
    domain: {xMin: Math.max(0, xMin - xPad), xMax: xMax + xPad, yMin: Math.max(0, yMin - yPad), yMax: yMax + yPad},
  };
}
