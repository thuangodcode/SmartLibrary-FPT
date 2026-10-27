# Report 5 checkpoint

Updated: 2026-10-27 (Asia/Ho_Chi_Minh). **STOP after preservation and assessment; wait for HuyLong approval before Step 3.**

## Branch and scope

- Work branch: `report5-wip`, created from `dev` at `e5beb8ecff1fb41234857bc4975e8303e80f2694`.
- No application/business code changed. Only tests, test README, CI and Report 5 checkpoint files are included.
- Do not push. Do not commit to `dev`. Preserve unrelated untracked `project_understanding.md` without staging it.
- Current CI changes have not run on GitHub. Existing green remote runs do not prove these new tests pass. The new regression failure will make the integration CI step fail; do not suppress it.

## Preserved files

- `work/templates/`: exact copies of the three original Report 5 templates from Downloads, **not completed deliverables**.
- `work/reports/report1.txt` through `report4.txt`: previously fetched report text snapshots. Report 3/4 were described by HuyLong as about 80% complete. Text exports do not preserve diagram images.
- `evidence/unit.trx`: final available unit run from 2026-10-27 03:00 +07:00.
- `evidence/integration.trx`: verified integration run from 2026-10-27 03:02 +07:00, after test-data isolation fixes.
- `evidence/unit-coverage.cobertura.xml`: coverage collected with the unit run; not whole-system test coverage.
- `work/SHA256SUMS.txt`: copied-file hashes for checkpoint verification.
- No need to retain earlier failed fixture runs, duplicate coverage files, template preview PNGs, the temporary node_modules symlink or PostgreSQL cluster/logs in Git.

## Verified results without rerunning tests

Counters and individual results were reread from the saved TRX files on this checkpoint:

| Suite | Total | Executed | Pass | Fail | Skipped |
| --- | ---: | ---: | ---: | ---: | ---: |
| Unit | 203 | 203 | 203 | 0 | 0 |
| API integration | 21 | 18 | 17 | 1 | 3 |

The integration TRX counters show executed=18; its three individual `NotExecuted` results are the skipped tests (do not rely on the TRX `notExecuted=0` summary field).

Failed: `WorkflowTests.Registration_ApprovedRequest_CannotBeReopenedForDocuments`.

Skipped pre-existing placeholders:

- `CirculationConcurrencyTests.ConcurrentExpireAndReady_SameQueue_AtMostOneReaderReady`
- `CirculationConcurrencyTests.ConcurrentApprove_SameCopy_AtMostOneSuccess`
- `CirculationConcurrencyTests.ConcurrentConfirmIncident_AtMostOneCompensationFine`

Earlier frontend `npm run lint` and `npm run build` exited 0 in tool output. Build warned about a chunk over 500 kB. No standalone frontend log was retained, so do not present it as a saved evidence artifact. No tests were rerun during this preservation step.

## What is implemented in the test harness

`apps/api/tests/SmartLibrary.IntegrationTests/WorkflowFixture.cs` uses actual controllers, application services, EF mappings and PostgreSQL transactions. Synthetic accounts/data only. It refuses non-localhost DB hosts, creates a random `smartlibrary_test_<guid>` database and drops only that database at disposal.

Covered cases include borrow/approve/handover/return, past pickup rejection, staff authorization, last-copy concurrent requests, registration approve/reject/resubmit, copy intake quantities/counts/barcodes, cash settlement, duplicate PayOS webhook application handling, wrong-reader fine access, and overdue/damaged/lost returns.

Limits: identity authentication is a test header handler; authorization policies are real. PayOS gateway verification, email and storage are mocked. No real Supabase login, provider signature verification, live payment, email delivery, Cloudinary upload, browser E2E or pgvector migration was verified. Initial external registration with Supabase auth/OTP is not covered by the seeded review tests. Background workers are disabled. `EnsureCreated` plus text domains is not evidence that production migrations succeed.

## PostgreSQL test setup and commands

PostgreSQL 17 tools are available at `/opt/homebrew/bin/initdb` and `/opt/homebrew/bin/pg_ctl` on the checkpoint machine. Existing disposable cluster: `/private/tmp/smartlibrary-report5-pg.x2syoj`; `pg_ctl status` reported **no server running** during preservation. Port: **55437**. Do not copy the cluster or server log into Git.

To restart this existing cluster if it still exists (do not run initdb on it):

```sh
pg_ctl -D /private/tmp/smartlibrary-report5-pg.x2syoj -l /private/tmp/smartlibrary-report5-pg.x2syoj/server.log -o '-h 127.0.0.1 -p 55437 -k /private/tmp' start
```

If the cluster has disappeared, create a fresh local disposable one:

```sh
REPORT5_PG_DIR=$(mktemp -d /private/tmp/smartlibrary-report5-pg.XXXXXX)
initdb -D "$REPORT5_PG_DIR" -U report5 -A trust --encoding=UTF8
pg_ctl -D "$REPORT5_PG_DIR" -l "$REPORT5_PG_DIR/server.log" -o '-h 127.0.0.1 -p 55437 -k /private/tmp' start
```

Trust authentication is for disposable local testing only; it is not a production security configuration. Check that port 55437 is free before starting. Record the newly created directory for later shutdown. Local socket/network execution may require sandbox approval.

From repository root (only rerun when necessary):

```sh
dotnet test apps/api/tests/SmartLibrary.UnitTests/SmartLibrary.UnitTests.csproj --logger trx --collect:"XPlat Code Coverage" --results-directory /private/tmp/smartlibrary-report5-work/unit-results

SMARTLIBRARY_TEST_POSTGRES='Host=127.0.0.1;Port=55437;Username=report5;Database=postgres' dotnet test apps/api/tests/SmartLibrary.IntegrationTests/SmartLibrary.IntegrationTests.csproj --logger trx --results-directory /private/tmp/smartlibrary-report5-work/integration-verified
```

Targeted defect reproduction: append `--filter FullyQualifiedName~Registration_ApprovedRequest_CannotBeReopenedForDocuments` to the integration command. Full integration command currently returns nonzero because of the confirmed failure.

To stop the preserved cluster after use:

```sh
pg_ctl -D /private/tmp/smartlibrary-report5-pg.x2syoj stop -m fast
```

## Confirmed defect

See `DEFECTS.md`, R5-DEF-001 (local provisional ID). Approved registration accepts a subsequent request-more-info action. The test confirms an unexpected successful HTTP response; source inspection confirms unconditional writes to NeedMoreInfo/PendingDocuments. The failing assertion occurs before the test's later database assertion, so do not claim that this run separately asserted the final database values. Business code remains unchanged.

## Deliverable progress at this checkpoint

Percentages below measure **project-specific content filled in the actual files**, not preparation/test execution effort.

| File under work/templates | Completed content | Verified state | Missing / priority |
| --- | ---: | --- | --- |
| Report5_Test Documentation.docx | 0% | Original 56 paragraphs, 6 tables; instructional placeholders remain | P1: scope, strategy, levels/tools, resources/environment/milestones, cases, results, defect and limitations; metadata placeholders |
| Report5_Test Report.xlsx | 0% | Original 5 sheets; sample Feature 1/2 cases; two existing #REF! cells | P1: real cases, test data, expected/actual, statuses, evidence, RTM, defects, corrected formulas; P2: additional execution rounds |
| Report5_Unit Test.xls | 0% | Original 8 sheets with sample function matrices/statistics | P1: map 203 actual results to tested functions and inputs/assertions, populate matrices/statistics/evidence; remove sample results; P2: verify export/render |

Test implementation/evidence is substantial reusable preparation, but has **not yet been inserted into the three templates**. No finished Report 5 artifacts were found in the workspace or temporary checkpoint folder. Do not report 203/203 as 100% mandatory-feature coverage or as release acceptance.

## Next work ONLY after confirmation

1. Measure API response time and concurrent users against an isolated DB. Record machine/config/data size, warmup, duration, endpoint mix, concurrency, latency distribution and errors. TestServer timings are not deployed network latency. Do not measure against shared production data.
2. Finalize Mandatory Features/main workflows: code governs implemented behavior; reports govern committed requirements. Record conflicts instead of silently rewriting commitments. Report 3 has UC01–UC40. NFR text includes standard loads under 2s, AI under 3.5s, 100 users and 99.9% availability, but scope/acceptance must be reconciled with the review commitment. Unsupported thresholds must say "Đề xuất". A short run cannot establish uptime/MTBF.
3. RTM: Requirement ↔ Test ↔ Evidence ↔ Pass/Fail/Not Tested. Distinguish planned, automated, skipped and real-provider tests. Do not equate mocked API workflows with browser E2E.
4. Complete three Report 5 artifacts in English following the templates; preserve original backups. Use documents/spreadsheets skills and render/verify final outputs. Decide whether legacy XLS should be delivered as XLSX and disclose conversion. Record R5-DEF-001 as Fail in the final workbook/document.
5. Browser E2E if quota permits. Do not change business code, push, use real payments or send external emails as an accidental side effect.

User-required metadata placeholders: "Đợi HuyLong điền" with instructions for official project name/code; author/date/version; team/actual roles; Review 2/Defense 1.1/submission deadlines; requirement-ID convention; official evidence location. Temporary R5 IDs are not official requirement IDs.

Update this HANDOFF after each substantial part. Current action is to stop and ask for confirmation, not continue the above steps.

## Safety review

Copied reports/templates and selected evidence were inspected, including OOXML ZIP contents and all XLS sheet values. Credential-pattern scan found no JWTs, private keys, provider API keys, embedded URL credentials or literal secret assignments. TRX contains synthetic validator input strings, not live account credentials. Source test uses example.test URLs and a fake signature. Reports may include team names/academic information already supplied by the user; they are scoped report sources, not public release artifacts.

`git diff --cached --check` flags trailing whitespace in the original report text exports. These snapshots are intentionally preserved byte-for-byte, verified against their source hashes. Check code and newly authored Markdown separately; do not rewrite reference snapshots merely to remove whitespace.

Do not stage `.env`, real account credentials, DB data/logs, node_modules, build output, unrelated `project_understanding.md`, or the entire temporary folder. Commit only the explicit Report 5/test/CI paths and verify staged contents before committing. No push authorized.
