import {assessment, type Severity, type Snapshot} from "./demo-monitoring";

// Keep persisted assessment values and historic audit replay unchanged.
// Translate technical status codes only at the presentation boundary.
export const monitoringLabel = (label:string) => label.replace(/Demo feed is stale \(>60 seconds\)/g, "Reading expired (over 60 seconds without an update)");
export const severityLabel = (severity:Severity) => severity === "unknown" ? "Reading unavailable" : severity === "critical" ? "Critical alarm" : severity === "warning" ? "Warning" : "Normal";
export function monitoringStatus(snapshot:Snapshot|null, now:string, error="") {
  if (error) return {label:"Monitoring unavailable", detail:error};
  if (!snapshot) return {label:"No reading loaded", detail:"Start a monitoring session to evaluate the reference data."};
  const state=assessment(snapshot,now);
  const active=state.checks.filter(check=>check.severity!=="normal");
  return {
    label:state.status==="critical"?"Critical alarm":state.stale?"Reading expired":state.status==="unknown"?"Missing reading":severityLabel(state.status),
    detail:active.length?active.map(check=>monitoringLabel(check.label)).join(" · "):"No warning or critical threshold crossing in this reading.",
  };
}
