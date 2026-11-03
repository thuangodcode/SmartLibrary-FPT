# Repeatable Report 5 tests

Baseline inspected: dev `e5beb8ecff1fb41234857bc4975e8303e80f2694`.

Run unit tests with .NET 10:

```sh
dotnet test apps/api/tests/SmartLibrary.UnitTests/SmartLibrary.UnitTests.csproj --logger trx --collect:"XPlat Code Coverage" --results-directory TestResults/unit
```

Provision a **disposable localhost PostgreSQL 17 instance** (role with CREATEDB).
Set `SMARTLIBRARY_TEST_POSTGRES` through your shell/CI environment; example for a
local trust-authenticated instance: `Host=127.0.0.1;Port=55437;Username=report5;Database=postgres`.
Never use shared application/staging/production credentials for this fixture.

```sh
dotnet test apps/api/tests/SmartLibrary.IntegrationTests/SmartLibrary.IntegrationTests.csproj --logger trx --results-directory TestResults/integration
```

The fixture refuses non-localhost servers, creates a random `smartlibrary_test_...`
database and drops that database on disposal. It does not load `.env`, execute
production startup scripts, migrate Supabase auth, or run background workers.
It uses actual controllers, services, EF mappings and PostgreSQL transactions.
Authentication is a test-only header handler; authorization policies remain real.
Email, storage and PayOS gateway are mocks, so these results **do not verify**
Supabase sign-in, webhook cryptographic verification, live checkout, email delivery,
Cloudinary upload, pgvector migrations or browser E2E behavior.

Three pre-existing skipped concurrency placeholders remain explicitly skipped.
The new last-copy concurrency test actually runs against PostgreSQL.
`Registration_ApprovedRequest_CannotBeReopenedForDocuments` is a regression test:
it must fail until the service prevents a terminal Approved request from being
downgraded through request-more-info. Do not hide this failure to make CI green.
The added CI configuration is local until committed/pushed; old remote green runs
are not evidence for these new tests.
