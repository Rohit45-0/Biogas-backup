export const reviewVersion = "auditor-review-2026-11-20-v1";
export const historicalExceptionIds = [
  "ddee04c1-340a-48bd-9768-0ff4f365e65b", "94e0a023-6ccc-40c5-9036-87868938b175",
  "22cec84c-1ae8-4b9a-83bf-f0c9b302511b", "539b21f2-dae3-4a77-bb05-90206099cb48",
  "5f17687d-b842-4f05-99c3-89dcdf17febb", "784def69-203e-4b02-a3e1-ac74f2e37f8d",
  "fa0e5e4c-b186-4b5b-9d18-054548af905d", "a6fea7ea-6931-43f4-880b-3b7c58bd4c28",
] as const;
export const reviewInputs = {feedstock:"Dairy WW",feedRate:846,temperature:36.5,ph:7.2,olr:3.2,hrt:22,codIn:7600,vfa:1100,mixing:50};
export const reviewScope = "Software execution and evidence checks. A passing checklist does not close historical HMAC exceptions or establish plant accuracy, predictive-warning acceptance or grant approval.";
export type ReviewCheck = {name:string;status:"PASS"|"FAIL";expected:string;observed:string};
