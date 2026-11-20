# Historical integrity investigation - 20 November 2026

## Scope and status

Eight records identified by the auditor are preserved. The failure is localized to HMAC authentication: stored content/request/input/response SHA-256 digests agree, while configured verification keys do not reproduce the signatures. Root cause remains UNCONFIRMED. This is not evidence that the records were tampered with, nor proof of an earlier key rotation.

The register in Audit Trail > Auditor review retrieves the originals from persistent storage. Its fresh findings are saved in each review report. A software-checklist PASS confirms retrieval and test execution; it does not mark these original records authenticated.

## Investigation evidence

The November 13 investigation compared all eight original record objects before/after deployment, inspected local archived key candidates and attempted the four historical deployment lookups. No matching historical key was found; referenced deployments returned 404. The November 20 follow-up repeats retrieval/comparison and records the additional checks available now. The delivery contains per-record findings and sanitized investigation results. No key material is included.

The canonical signing implementation signs sorted-key record content using HMAC-SHA-256. It excludes the outer signature/recordHash fields. Digest matching confirms canonical content agrees with the recorded digests, but those unkeyed digests do not authenticate who created the content. Loss/mismatch of signing context remains a hypothesis until original deployment/key history can be recovered.

## Corrective actions already implemented

1. Preserve originals. No deletion, editing or re-signing to change historical outcomes.
2. Mark failed UI evidence, JSON, CSV, filenames and headers UNVERIFIED / INTEGRITY CHECK FAILED.
3. Refuse failed records in model replay verification and verified prediction exports.
4. Provide component diagnostics and a central exception register with direct original-record access.
5. New writes must pass read-back digest/HMAC verification. Current account passwords are stored separately; changing a user's password does not change the audit signing key.
6. Dedicated audit-key configuration and verification-only retired keys are supported. Any future signing-key rotation must preserve verification context and use a documented migration. No key is changed by this release.

## Resolution boundary and remaining owner action

Developer: retain the investigation evidence, compare new live writes and provide any recovered signing context for a non-destructive verification attempt. Doris/project owner: provide any unavailable original deployment/key archive or operator change record. Auditor: assess unresolved historical exceptions separately from successful new records.

If the original signing context cannot be recovered, the technically defensible disposition is to retain these records as UNVERIFIED historical exceptions and use separately identified new test runs for current execution evidence. New runs do not retroactively authenticate old records. No date for root-cause confirmation can be promised without the missing evidence; review the evidence-availability decision at the proposed 23 November coordination checkpoint.
