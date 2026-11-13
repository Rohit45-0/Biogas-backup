import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const evidenceAuthentication={
  type:"SERVER_AUTHENTICATED",algorithm:"HMAC-SHA-256",digest:"SHA-256",
  independentlyVerifiable:false,
  explanation:"The server verifies this record using a private shared secret. This is not a public-key digital signature or independent verification of the measurements.",
} as const;

export function canonical(value: unknown): string {
  if (value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  return JSON.stringify(value);
}
export function fingerprint(value:unknown) {return `sha256:${createHash("sha256").update(canonical(value)).digest("hex")}`;}
export function signEvidence(value:unknown) {
  const key=process.env.AQUA_AUDIT_SIGNING_KEY||process.env.AQUA_SESSION_SECRET;
  if(!key) throw new Error("Evidence signing key unavailable");
  return createHmac("sha256",key).update(canonical(value)).digest("hex");
}
export function verifySignature(value:unknown, signature:string) {
  // Retain old audit keys for verification only. Rotating login/session credentials
  // must not destroy the ability to authenticate historical evidence.
  const keys=[process.env.AQUA_AUDIT_SIGNING_KEY,process.env.AQUA_SESSION_SECRET,...(process.env.AQUA_AUDIT_PREVIOUS_KEYS||"").split(",")].filter((key):key is string=>Boolean(key));
  const supplied=Buffer.from(signature);
  return keys.some(key=>{const actual=Buffer.from(createHmac("sha256",key).update(canonical(value)).digest("hex"));return actual.length===supplied.length&&timingSafeEqual(actual,supplied);});
}
export function authenticationFor(integrity:boolean) {
  return integrity?{...evidenceAuthentication,verificationStatus:"PASS"}:{...evidenceAuthentication,type:"UNVERIFIED_HISTORICAL_RECORD",verificationStatus:"FAIL",explanation:"INTEGRITY CHECK FAILED. This preserved record is supplied for investigation only. It is not a server-authenticated or verified result. Do not use it as accepted execution evidence."};
}
export function csvCell(value:unknown) {
  let text=String(value??"");
  if (/^[=+@\t\r]/.test(text)) text=`'${text}`;
  return `"${text.replaceAll('"','""')}"`;
}
