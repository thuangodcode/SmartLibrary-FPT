# Report 5 defect checkpoint

## R5-DEF-002 — Reader can create catalog inventory using multipart endpoint

- Status: **Open / Fail**, proposed High (authorization bypass; needs HuyLong severity confirmation).
- Targeted test: `Report5PlannedTests.ST_02_3_ReaderCannotMutateInventory`.
- Evidence: `evidence/planned-api/planned-api.trx`, executed 2026-10-27.
- Reproduce on isolated test data: authenticate with Reader role; POST multipart `/api/v1/books/form` with unique alphanumeric Code, nonempty Title and TotalCopies=1.
- Expected: 403 and no inserted book. Actual: **201 and persisted=True**, both response and database existence checked in the failing assertion.
- Control checks: Reader receives 403 from JSON create, update and copies/intake endpoints before the form attempt.
- Source: `BooksController.CreateFromForm` has `[Authorize]` without `LibrarianOnly`, unlike JSON create. Test identity is a header double; authorization middleware, controller, service and PostgreSQL are real. No live Supabase/browser claim.
- No application fix applied. The synthetic database is disposed by the fixture; shared catalog data was not changed.

The targeted `SM_04_RegistrationLifecycle` test also reproduces R5-DEF-001 after the approve/reject/resubmit branches. Thus three failed report cases refer to two distinct defects, not three distinct bugs.

## R5-DEF-001 — Approved registration can request more information

- Status: **Open / Fail**. Provisional local defect ID; severity proposed High because an active reader can be downgraded by a stale review action. Severity needs HuyLong confirmation.
- Baseline: `e5beb8ecff1fb41234857bc4975e8303e80f2694` plus the local test harness.
- Environment: real API controllers/services and disposable PostgreSQL 17; test authentication, mocked email/storage. Not a browser or live Supabase reproduction.
- Regression: `WorkflowTests.Registration_ApprovedRequest_CannotBeReopenedForDocuments`.
- Evidence: `evidence/integration.trx`, failed result with message “An approved request must not be downgraded by a stale review action.”

### Reproduction

1. Seed a new reader with PendingApproval and a Submitted RegistrationRequest in the disposable test DB.
2. As Librarian, POST `/api/v1/registrations/{id}/approve`; verify successful response.
3. With the same request ID, POST `/api/v1/registrations/{id}/request-more-info` with reason `Stale review tab`.
4. Expected: reject the invalid transition; keep the approved request and active account unchanged.
5. Actual: the second call returns success, causing the regression assertion to fail.

Source corroboration: `apps/api/src/SmartLibrary.Application/Features/Auth/Services/RegistrationService.cs`, `RequestMoreInfoAsync`, lines 193–208 at this baseline. It checks existence but not current request status, then assigns NeedMoreInfo and PendingDocuments and saves. These state assignments are source-confirmed; the failed run stops before a post-action DB assertion.

No business fix has been applied. Carry this defect, reproduction, evidence and Fail status into the final Report 5 document/workbook after approval to continue. Do not mark it resolved or hide the failing test.
