# Report 5 checkpoint

## Latest checkpoint — planned API execution (2026-10-27)

This section supersedes older counts and authorization wording below. Current deliverables and JSON contain **87 cases: 42 Passed / 3 Failed / 42 Not Tested; 45 Executed (51.72%)**. Unit evidence remains 203 Passed / 93 function groups; no full-suite rerun.

`evidence/planned-api/planned-api.trx` records 24 targeted API tests: 22 Passed / 2 Failed. Only 23 fully covered report scenarios were promoted; ST-10-2 remains Not Tested because its coverage is partial. External services are mocked, not live-provider or browser E2E evidence.

R5-DEF-001 remains Open / Fail. New R5-DEF-002 is Open / Fail: a Reader can create a persisted book via POST `/api/v1/books/form` (201 instead of 403). See DEFECTS.md for reproduction. Both defects appear in all three deliverables. No business code was changed.

Section 3 contains 40 milestone rows with the proposed common schedule 27–31 October 2026. Workbook statistics are grouped by 16 feature groups plus local Performance. Rebuild commands below remain valid; use REPORT5_RENDER=0. Cached Word TOC still needs refresh.

Next authorized work: select only feasible remaining API/PostgreSQL scenarios, run only new tests in one filtered command, then rebuild and audit all three files. Target approximately 61 Executed, but do not promote partial coverage or fabricate results. Do not start/stop PostgreSQL, push, render, or modify business code. PostgreSQL was last confirmed running on port 55437; this checkpoint does not claim a fresh status check.

Updated: 2026-10-27 (Asia/Ho_Chi_Minh). Branch: `report5-wip`; this rebuild started from `5b5e7d9`. Application baseline: `e5beb8ecff1fb41234857bc4975e8303e80f2694`.

## Scope of this checkpoint

HuyLong authorized rebuilding the three artifacts and text/numeric validation, with at most two correction rounds. No application tests, database startup, business-code changes, push, or image rendering are authorized for this checkpoint. Earlier pause/confirmation wording is superseded by that instruction. Stop after the local commit and status report.

Existing dependency link remains available:
`/private/tmp/smartlibrary-report5-work/node_modules` → bundled runtime dependencies.
No dependency installation or reconstruction was performed.

## Deliverables and verified counts

Files under `deliverables/`:

- `Report5_Test Documentation.docx`: generated from the original template. Explicit non-unit totals added from report-data.json. Original package parts other than document.xml/settings.xml are preserved by builder assertions.
- `Report5_Test Report.xlsx`: 87 non-unit entries: **21 Passed / 1 Failed / 65 Not Tested**, matching JSON, case rows, statistics and DOCX. The earlier 82 (21/1/60) count is obsolete: the current inventory includes five planned state-lifecycle scenarios.
- `Report5_Unit Test.xlsx`: **203 recorded Passed / 0 Failed**, **93 function groups**. This is the intentional XLS-to-XLSX delivery. Five assertion excerpts starting `=>` remain literal text, not formulas. A related-defect note records R5-DEF-001 as Open / Fail without falsely changing unit outcomes.

Inventory composition: 21 integration cases (17 pass, 1 fail, 3 skipped), four measured local NFR scenarios (proposed criterion), 48 planned system cases, nine planned browser workflows and five planned state lifecycles. 65 Not Tested = 62 planned + three skipped. The four passing local measurements do not mean SRS NFR acceptance.

The RTM includes 40 UCs, 16 candidate feature groups and nine workflows. UC18 is Fail; other UC-level acceptance remains Not Tested. A component/case pass is not full feature acceptance. Signed mandatory-feature commitment is still not supplied.

## Saved test evidence; not rerun

- `evidence/unit.trx`: 203/203 pass, preserved execution 2026-10-27.
- `evidence/integration.trx`: 21 total / 18 executed / 17 pass / 1 fail / 3 skipped. Individual NotExecuted records establish the skips; the TRX summary notExecuted field is misleading.
- `evidence/unit-coverage.cobertura.xml`: unit-run coverage only, not system coverage.
- `evidence/nfr-local.json`: 4800 samples and four summaries; no new load run at this checkpoint.
- `nfr-run/` (8 KB) and `nfr-verified/` (4 KB) contain local-only TRX and remain excluded from Git. Generated XLSX inspect.ndjson diagnostics remain excluded too.

The original unit/integration results precede the network-mode fixture extension. Current test/CI changes have not been executed on remote CI. The known failing regression must not be suppressed.

## NFR results and limitations

Concurrency 1 / 10 / 50 / 100: P95 **3.7329 / 13.2181 / 50.0817 / 152.293 ms**, respectively. Every numeric metric in the spreadsheet NFR table is compared against saved evidence. DOCX uses two-decimal P95 values.

Environment: macOS 15.3 Arm64, 10 logical processors, .NET runtime 10.0.13 / SDK 10.0.402, PostgreSQL 17.11. CPU model and RAM are unavailable because hardware-query permission was denied; do not invent or retry them without permission.

Synthetic dataset: 1000 titles / 4000 copies / 3 accounts / 0 loans. Three equally mixed read endpoints, 60 warmups, 1200 requests per level, closed loop without think time, same-process generator, HTTP loopback Kestrel, body-read timing and nearest-rank percentiles. Bursts last only 0.88–3.75 seconds.

API P95 <2000 ms and zero errors is explicitly **Đề xuất**, not a signed requirement. These short bursts do not prove sustained 100-user capacity, browser page-load targets, AI latency, 99.9% availability, MTBF, MTTR, large-catalog capacity or CPU/RAM limits.

Identity uses test authentication headers; actual role policies are exercised. PayOS gateway/signature validation, email and storage use mocks. No real Supabase login/OTP, live payment/signature validation, email, Cloudinary or AI-provider verification is claimed. The fixture uses EnsureCreated/text domains, not production migrations/pgvector; background workers are disabled.

## PostgreSQL actual state

Read-only `pg_ctl status` with sufficient process visibility on 2026-10-27 confirmed **server running, PID 37873**, existing cluster `/private/tmp/smartlibrary-report5-pg.x2syoj`, bound to `127.0.0.1:55437`, socket directory `/private/tmp`.

The sandbox-only status call said “no server running”; the unrestricted read-only status resolved that visibility discrepancy. No start, stop, initdb or database query was performed this turn. Do not copy the cluster, PID file or server log into Git. Check status again before any future database operation rather than assuming this checkpoint is live state.

## Confirmed defect

**R5-DEF-001: Open / Fail**, proposed High severity pending human confirmation. Seed a Submitted registration, approve it, then POST request-more-info on the same ID. Expected: reject invalid transition and retain Approved/Active. Actual: unexpected successful HTTP response.

Evidence: `WorkflowTests.Registration_ApprovedRequest_CannotBeReopenedForDocuments` in integration.trx. Source `RegistrationService.RequestMoreInfoAsync` (baseline lines 193–208) unconditionally writes NeedMoreInfo/PendingDocuments. The failed HTTP assertion occurs before the later DB assertion: do not claim the run separately asserted post-action DB values. No business fix was applied. All three artifacts explicitly mention Fail; unit statistics stay 203 Passed because this failure belongs to integration.

## Rebuild and text-only audit commands

From repository root; these commands only build documentation from saved evidence. Use the existing bundled runtime, not a repo dependency installation.

```sh
/Users/haolongkakashi/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python docs/report5/work/build_data.py
/Users/haolongkakashi/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python docs/report5/work/build_document.py
cp docs/report5/work/build-workbooks.mjs /private/tmp/smartlibrary-report5-work/build-workbooks.mjs
REPORT5_RENDER=0 /Users/haolongkakashi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node /private/tmp/smartlibrary-report5-work/build-workbooks.mjs
/Users/haolongkakashi/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python docs/report5/work/check_artifacts.py
```

Workbook rendering now requires explicit `REPORT5_RENDER=1`; default is off. Do not run `inspect-artifacts.mjs` in a text-only turn: that retained helper renders original template previews. JavaScript builders retain machine-specific paths. If the existing temporary dependency link is missing, report it and stop rather than recreating it.

`check_artifacts.py` reads the saved files only. It checks exact totals/verdicts, unique IDs, unit-group counts, assertion literals, formula caches/errors, NFR metrics, defect status and metadata placeholders. Claim excerpts are printed for human/agent review; this is not an automatic semantic proof and is not native Excel/Word or visual QA.

## Corrections in this rebuild

- Rendering disabled by default to obey the user's no-image instruction.
- One correction round: derive DOCX 21/1/65 breakdown from JSON; add the integration-defect note to the Unit workbook; clarify that NFR TRX is local-only, not committed evidence.
- No change to observed test verdicts, source requirements, application code or saved NFR evidence.
- Final read-only audit exited 0 with no issues: counts and case IDs reconcile; all 203 unit assertion excerpts are preserved as text; five leading `=>` excerpts are not formulas; no error cells, missing formula caches, #REF!, #VALUE! or #NAME? were found. NFR metrics match evidence and R5-DEF-001 is explicitly Fail in all three files. Claim excerpts were reviewed: no feature acceptance, sustained 100-user capacity or availability acceptance is inferred from the local/component results. No second correction round was needed.

## Remaining work

Visual QA and TOC/page-number refresh remain outstanding. Word updateFields is enabled, but cached TOC pagination has not been validated this turn. No current claim of final layout approval.

Browser E2E, real-provider verification, sustained performance tests, requirement/code conflict reconciliation, signed mandatory scope, defect fix/retest and release acceptance remain incomplete. Unexecuted items must retain Not Tested. The known failure remains Fail.

### “Đợi HuyLong điền” fields

- Official project name and project code.
- Report/document code; author, issue date and version.
- Reviewer and team members with actual responsibilities (not inferred from Git authors).
- Planned start/end for remaining provider/browser tests and defect retest.
- Review 2, Defense 1.1 and submission milestones/deadline.
- Official requirement/test ID convention; current MF/ST/IT/UT/WF/NFR IDs are provisional.
- Official evidence archive location/link.
- Per-function matrix author (93 repeated fields); execution is already identified as xUnit automation.

Also confirm signed mandatory scope and proposed defect severity. These confirmations are not invented metadata.

## Preservation and safety

Original templates remain unchanged under `work/templates/`; report text snapshots under `work/reports/`; original backup hashes in `work/SHA256SUMS.txt`. Keep `artifact.md` and builders as reproducibility support.

Provider-key-shaped assertion excerpts were traced to synthetic unit-fixture literals, not live credentials. Do not stage real passwords, .env, database dumps/logs, bin/obj, node_modules, diagnostic inspect.ndjson, local NFR TRX folders or unrelated `project_understanding.md`. Stage only explicit Report 5 paths. No push authorized.
