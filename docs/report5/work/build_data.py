"""Rebuild report data from preserved evidence; does not execute tests or read .env."""
from pathlib import Path
import json, re, xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[3]
BASE = ROOT / 'docs/report5'
NS = {'t':'http://microsoft.com/schemas/VisualStudio/TeamTest/2010'}

def trx(name):
    tree = ET.parse(BASE / 'evidence' / name)
    rows=[]
    for r in tree.findall('.//t:UnitTestResult',NS):
        a=r.attrib
        rows.append(dict(name=a['testName'],status={'Passed':'Passed','Failed':'Failed','NotExecuted':'Not Tested'}[a['outcome']],
            date=a.get('startTime','')[:10],duration=a.get('duration',''),
            message=r.findtext('t:Output/t:ErrorInfo/t:Message','',NS)))
    return sorted(rows,key=lambda x:x['name'])

# Each feature groups Report 3 UC IDs, not a substitute for signed BM04 commitments.
FEATURES = [
('Identity',[1,2,3,18],'AuthController; RegistrationsController; MeController','Reader / Librarian',
 'Register with valid profile and documents; verify email; librarian approves; sign in.', 'Account becomes Active only after the applicable verification and approval steps.',
 'Submit mismatched confirmation or expired OTP.', 'Reject invalid input; do not activate an account.',
 'Reader attempts registration approval API.', 'Deny staff-only action; request remains unchanged.'),
('Catalog',[4,5,28,29],'BooksController; BookCopiesController; CategoriesController','Reader / Librarian',
 'Librarian creates a unique book and two copies with locations; reader searches and opens detail.', 'Book is discoverable and counts, barcodes and locations agree with stored copies.',
 'Intake 0 and 501 copies; submit duplicate book code.', 'Reject quantity outside 1–500 and conflicting code; do not change inventory.',
 'Reader attempts to create or update inventory.', 'Deny unauthorized inventory mutations. UC29 import-ticket CRUD requires separate scope verification.'),
('Borrow',[8,22,23],'CirculationMeController; CirculationController','Reader / Librarian',
 'Choose available book and valid pickup slot; submit; librarian approves then checks out.', 'Pending holds a copy; Approved is not Borrowed; handoff sets Borrowed and due dates.',
 'Submit a past pickup slot or two simultaneous requests for the last copy.', 'Reject invalid slot; at most one last-copy request succeeds.',
 'Anonymous user or Reader opens staff loans endpoint.', 'Return 401 for anonymous and 403 for Reader.'),
('Return and incidents',[24,26],'CirculationController','Librarian / Reader',
 'Return overdue copy; inspect Good, Damaged and Lost conditions in separate runs.', 'Good creates overdue fine and releases copy; Lost/Damaged opens PendingReview incident and keeps copy unavailable.',
 'Return an already returned barcode.', 'Reject duplicate return without duplicate fine or inventory increment.',
 'Reader calls staff return endpoint.', 'Deny return processing by Reader.'),
('Renewal',[9,24],'CirculationMeController; CirculationController','Reader / Librarian',
 'Reader requests renewal; librarian processes it within configured policy.', 'Renewal follows configured limit/duration and records the final due date.',
 'Request renewal after limit, with overdue or a waiting reservation.', 'Reject a request prohibited by the active policy without extending due date.',
 'Reader attempts renewal of another reader loan.', 'Deny access to another reader loan.'),
('Reservation',[10,25],'CirculationMeController; CirculationController','Reader / Librarian',
 'Reserve unavailable title; return a copy; process ready reservation and pickup.', 'Queue allocates the available copy once and records the correct terminal state.',
 'Submit duplicate reservation; expire ready hold.', 'Reject duplicate; expiry releases or reallocates copy once.',
 'Reader cancels another reader reservation.', 'Deny cross-reader cancellation.'),
('Fine payment',[16,30],'CirculationMeController; CirculationController; PayOSWebhookController','Reader / Librarian / PayOS',
 'Create PayOS checkout; receive valid signed success webhook; repeat webhook.', 'Fine/payment become Paid once; duplicate does not double-settle. Real signature/provider remains to be tested.',
 'Send tampered signature, wrong amount, expired/cancelled or out-of-order webhook.', 'Invalid callback cannot settle an unrelated or invalid payment; reconcile according to implemented state guards.',
 'Reader attempts checkout for another reader fine.', 'Deny access and create no checkout.'),
('Profiles and readers',[7,19,20],'ProfileController; ReadersController; LibrarianUsersController','Reader / Librarian',
 'Edit permitted profile fields; librarian views reader history.', 'Changes persist; staff can view permitted reader history.',
 'Submit invalid contact fields or missing target ID.', 'Return validation/not-found outcome; preserve existing profile.',
 'Reader attempts another reader private profile endpoint.', 'Deny exposure or modification of private fields.'),
('Reviews',[11,12],'BookReviewsController','Reader / Librarian',
 'Create rating and review, edit it, then delete it.', 'Ownership and aggregate rating remain consistent; borrowed-book prerequisite in SRS needs reconciliation.',
 'Submit rating 0 or 6 and duplicate active review.', 'Reject out-of-range rating/duplicate; average rating remains consistent.',
 'Reader edits another reader review.', 'Deny cross-reader modification.'),
('Support',[13,14,15,27],'SupportController','Reader / Librarian',
 'Reader submits feedback/support; librarian replies; reader views history.', 'Correct conversation and status are visible to the participants.',
 'Submit empty content or invalid conversation ID.', 'Reject invalid content/target without creating an orphan message.',
 'Another reader requests a private conversation.', 'Deny access to conversation content.'),
('News and notifications',[17,21,31],'NewsController; NotificationsController','Reader / Librarian',
 'Publish announcement; reader filters/searches news and opens personal notification.', 'News reflects publication; personal notification goes to intended reader.',
 'Submit empty news title or request a missing notification.', 'Validate content or return not found without unintended changes.',
 'Reader publishes news or reads another reader notification.', 'Deny staff-only publication and cross-reader inbox access.'),
('Users and permissions',[33,34],'AdminUsersController','Admin',
 'Admin creates librarian account and views assigned roles.', 'Account and role are created consistently without exposing credentials.',
 'Create duplicate email or invalid role.', 'Reject invalid/duplicate user without partial account creation.',
 'Librarian or Reader calls admin user management.', 'Deny admin-only operation.'),
('Policies',[35],'PolicyRulesController; RegulationsController','Admin / Reader',
 'Admin changes a borrowing policy; reader views published regulations.', 'Valid policy becomes effective in subsequent circulation decisions.',
 'Submit negative fee, invalid duration or conflicting policy values.', 'Reject invalid policy parameters and keep last valid settings.',
 'Reader or Librarian changes admin policy.', 'Deny unauthorized policy mutation.'),
('AI configuration',[36],'AiSettingsController','Admin',
 'Admin configures provider and selects supported model.', 'Settings persist; credentials remain masked and protected.',
 'Use invalid endpoint/model or unavailable credential.', 'Report configuration error without leaking secrets.',
 'Reader requests provider credential/configuration endpoints.', 'Deny access to administrative configuration.'),
('AI search and recommendations',[6,32,38,39,40],'RagController; AiSettingsController; DashboardController','Reader / Librarian / AI',
 'Search a natural-language query with known relevant catalog entries; request recommendations.', 'Return relevant source-linked books/reasons; relevance tests with mocks do not prove provider quality.',
 'Search unsupported topic or simulate provider timeout.', 'No invented catalog books; safe fallback/error is returned.',
 'Reader attempts staff-only AI demand report.', 'Deny privileged analytics; public reader search remains available as designed.'),
('Reports and statistics',[37],'AdminReportsController; LibrarianReportsController; DashboardController','Admin / Librarian',
 'Assign report, generate/export it, review and approve.', 'Correct period/data and review status; exported totals match source.',
 'Use invalid date range or malformed report import.', 'Reject invalid request without publishing corrupt report.',
 'Reader accesses staff report/export.', 'Deny unauthorized report data access.')]

features=[]; cases=[]
for idx,f in enumerate(FEATURES,1):
    name,ucs,code,actor,*flows=f
    fid=f'MF-{idx:02d}'
    features.append(dict(id=fid,name=name,ucs=ucs,code=code,actor=actor,commitment='Candidate mandatory grouping from Report 1 scope and Report 3; BM04 confirmation pending'))
    for j,kind in enumerate(['Main flow','Validation / exception','Permission']):
        cases.append(dict(id=f'ST-{idx:02d}-{j+1}',feature=name,requirement=', '.join(f'UC{x:02d}' for x in ucs),
            description=kind,procedure=flows[j*2],expected=flows[j*2+1],precondition=f'Isolated staging data; {actor} accounts; active policy; record fixture IDs.',
            data='Use dedicated synthetic records; include IDs and actual input values in execution evidence.',status='Not Tested',date='',tester='',
            actual='Not executed in this checkpoint.',mode='Planned system test',evidence='',note=code))

int_desc={
'Borrow_Approve_Handover_Return_PersistsLifecycle':('Borrow','UC08, UC22, UC23, UC24','Create book/slot; request → approve → checkout → return → duplicate return.', 'Pending holds copy; Approved has no BorrowDate; checkout sets dates; return frees copy; duplicate returns 400.'),
'ReaderOrAnonymous_CannotAccessStaffLoans':('Borrow','UC22','GET staff loans with supplied role.','Anonymous 401; Reader 403.'),
'Borrow_PastPickupSlot_IsRejectedWithoutHoldingCopy':('Borrow','UC08','POST borrow request with yesterday pickup.','400; copy remains available; no loan created.'),
'ConcurrentBorrow_LastCopy_OnlyOneRequestSucceeds':('Borrow','UC08','Two distinct synthetic readers submit simultaneously for one copy.','Exactly one success and one 400; one loan; available copies = 0.'),
'Registration_Approve_ActivatesExternalReader_AndRejectAfterApprovalFails':('Identity','UC18','Seed Submitted; approve; attempt reject.','Approved + Active + External + membership expiry; later reject unsuccessful.'),
'Registration_Reject_PersistsReasonAndAccountState':('Identity','UC18','Seed Submitted; reject with unreadable-document reason.','Request/account Rejected; reason persisted.'),
'Registration_MoreInfo_ResubmissionCreatesNewRequest':('Identity','UC01, UC18','Request more info; reader submits synthetic multipart Front document.','Old request NeedMoreInfo; a new Submitted request; account PendingApproval.'),
'Registration_ApprovedRequest_CannotBeReopenedForDocuments':('Identity','UC18','Approve Submitted request; call request-more-info on same ID.','Reject invalid transition; retain Approved/Active. Actual call incorrectly succeeds.'),
'CopyIntake_InvalidQuantity_IsRejected':('Catalog','UC28','POST copies/intake with quantity shown in parameters.','400 for 0 and 501.'),
'CopyIntake_UpdatesCountAndDistinctBarcodes':('Catalog','UC28','Seed one copy; intake 2 Good copies at TEST-A1.','3 total/available copies; 3 distinct barcodes; two at TEST-A1.'),
'PayOS_Checkout_DuplicateWebhook_SettlesExactlyOnce':('Fine payment','UC16, UC30','Create mocked checkout for 10000 VND; deliver success webhook twice.','Fine/payment Paid; one payment only. Signature gate is mocked.'),
'Fine_CashSettlement_CancelsPendingCheckout':('Fine payment','UC16, UC30','Create mocked online checkout then staff cash settlement.','Fine Paid; PayOS attempt Cancelled; cash payment Paid.'),
'Fine_Checkout_DifferentReader_IsDenied':('Fine payment','UC16','Other reader requests fine checkout.','400; no payment created.'),
'Return_OverdueCopy_CreatesFineOrIncident':('Return and incidents','UC24, UC26','Seed 3-day overdue loan; return with parameterized condition.','Good: calendar overdue days × 5000 fine and available copy. Lost/Damaged: PendingReview incident, unavailable copy, no immediate fine.')}

integration=trx('integration.trx')
for i,r in enumerate(integration,1):
    method=r['name'].split('WorkflowTests.')[-1].split('(')[0]
    info=int_desc.get(method,('Reservation' if 'Queue' in method else 'Return and incidents' if 'Incident' in method else 'Borrow','UC08, UC25, UC26','Implement skipped concurrency placeholder before execution.','Concurrency invariant holds without duplicate allocation/fine.'))
    cases.append(dict(id=f'IT-{i:03d}',feature=info[0],requirement=info[1],description=r['name'].split('.')[-1],procedure=info[2],expected=info[3],
        precondition='WorkflowFixture: localhost PostgreSQL; actual services/EF; synthetic roles; mocked providers.',data=r['name'].split('(',1)[1].rstrip(')') if '(' in r['name'] else 'Seed isolated records in WorkflowTests; see source method.',
        status=r['status'],date=r['date'] if r['status']!='Not Tested' else '',tester='xUnit automation' if r['status']!='Not Tested' else '',
        actual=r['message'] or 'All assertions completed successfully.',mode='API integration (provider/auth doubles)',evidence='evidence/integration.trx :: '+r['name'],
        note='R5-DEF-001' if r['status']=='Failed' else 'Skipped placeholder; not counted as executed.' if r['status']=='Not Tested' else 'No live-provider or browser claim.'))

workflows=[
('WF-01','Registration and approval','Reader → System → Librarian','Identity','Submit profile, verify applicable email/documents, review, approve/reject/more-info, resubmit as a new request.'),
('WF-02','Borrow and handover','Reader → Librarian','Borrow','Select book/slot, submit Pending, approve, verify reader and hand over, record Borrowed.'),
('WF-03','Return and incident handling','Reader → Librarian','Return and incidents','Return, inspect, calculate overdue or open lost/damaged incident, assess/settle compensation, update copy.'),
('WF-04','Fine payment','Reader → PayOS → System / Librarian','Fine payment','View fine, choose online or cash, reconcile webhook, verify final fine/payment state.'),
('WF-05','Catalog and copy management','Librarian → Reader','Catalog','Create/update book, cover/location, intake copies, verify discovery and availability.'),
('WF-06','Reservation and renewal','Reader → Librarian','Reservation','Queue unavailable title, allocate/expire hold; request and process renewal subject to policy.'),
('WF-07','Support and announcements','Reader ↔ Librarian','Support','Submit support, reply, verify participant history; publish announcement and verify reader view.'),
('WF-08','Administration and reporting','Admin → Librarian','Reports and statistics','Configure policy/users, assign/generate/review/export report and validate totals.'),
('WF-09','AI discovery','Reader → AI → Catalog','AI search and recommendations','Submit natural-language query, retrieve catalog sources, return relevance and graceful fallback.')]
for wid,name,actors,feature,steps in workflows:
    cases.append(dict(id='E2E-'+wid[-2:],feature=feature,requirement=wid,description=name,procedure=steps,
        expected='All actor handoffs, UI confirmations and persisted end states agree; capture browser and API evidence.',precondition='Dedicated browser accounts; isolated API/DB; sandbox or explicitly labelled mocks.',data='Record actual fixture IDs before execution.',status='Not Tested',date='',tester='',actual='Browser E2E not executed.',mode='Planned browser E2E',evidence='',note=actors))

nfr=json.loads((BASE/'evidence/nfr-local.json').read_text())
for i,(feature,req,steps,expected) in enumerate([
 ('Borrow','UC08, UC22, UC23, UC24','Exercise Pending → Approved → Borrowed → Returned; reject/cancel/expire allowed requests; attempt handover after Returned.','Only permitted transitions change state; copy counts and dates remain consistent.'),
 ('Reservation','UC10, UC25','Create pending; allocate ready hold; fulfill/cancel/expire; attempt fulfillment after cancellation.','Allocate one copy; reject invalid terminal-state transition and avoid duplicate allocation.'),
 ('Fine payment','UC16, UC30','Exercise pending checkout, payment, cash cancellation, expiry and already-settled callback branches; repeat terminal webhook.','Idempotent settlement; preserve separate fine and payment-attempt states; reconcile per code guards.'),
 ('Identity','UC01, UC18','Approve/reject/NeedMoreInfo from Submitted; resubmit documents; try request-more-info after approval.','New Submitted request after resubmission; reject invalid terminal-state actions. Known bug R5-DEF-001 remains open.'),
 ('Return and incidents','UC26, UC30','Report incident; confirm compensation or reject; settle/waive linked fines; attempt invalid repeated review.','Incident resolves only under implemented settlement guards; no duplicate compensation fine.')],1):
    cases.append(dict(id=f'SM-{i:02d}',feature=feature,requirement=req,description='Full entity lifecycle and invalid transitions',procedure=steps,expected=expected,
        precondition='Fresh isolated fixtures for each branch; active policy; staff and reader roles.',data='Record entity IDs and state before/after every transition.',status='Not Tested',date='',tester='',actual='Full lifecycle matrix not yet executed; see linked IT cases for partial coverage.',mode='Planned state-transition test',evidence='',note='Do not infer full lifecycle coverage from one successful path.'))
for x in nfr['summaries']:
    cases.append(dict(id=f'NFR-LOCAL-{x["concurrency"]:03d}',feature='Performance',requirement='NFR-P01 / NFR-P02 (partial)',description=f'Local HTTP burst at concurrency {x["concurrency"]}',
        procedure='60 warmup requests; 1200 measured requests per level; 1:1:1 catalog page1/page10/copy summary; closed loop, no think time.',
        expected='Đề xuất: API p95 <2000 ms and zero HTTP errors. This does not certify SRS page-load/100-user targets.',precondition='.NET 10.0.13 Kestrel + PostgreSQL 17.11; macOS 15.3 Arm64; 10 logical processors; same-host generator.',
        data='1000 titles, 4000 copies, 3 accounts, 0 loans; CPU model/RAM not available (hardware query permission denied).',status='Passed' if x['p95Ms']<2000 and x['errors']==0 else 'Failed',date='2026-10-27',tester='Opt-in NfrProbeTests',
        actual=f'p95={x["p95Ms"]:.2f} ms; p99={x["p99Ms"]:.2f} ms; errors={x["errors"]}; {x["requestsPerSecond"]:.1f} req/s; {x["seconds"]:.3f}s burst.',mode='Local NFR experiment',evidence='evidence/nfr-local.json',note='One short run, warm cache, no TLS/providers/browser/AI; not sustained production load.'))

unit=trx('unit.trx')
sources={p.stem:p for p in (ROOT/'apps/api/tests/SmartLibrary.UnitTests').rglob('*.cs')}
for i,r in enumerate(unit,1):
    base=r['name'].split('(',1)[0];cls,method=base.rsplit('.',2)[-2:]
    p=sources.get(cls);s=p.read_text() if p else '';m=re.search(r'public\s+(?:async\s+)?(?:void|Task(?:<[^>]+>)?)\s+'+re.escape(method)+r'\s*\(',s)
    body=s[m.start():] if m else '';end=re.search(r'\n\s*\[(?:Fact|Theory)',body[1:]);body=body[:end.start()+1] if end else body
    lines=body.splitlines();checks=[x.strip() for x in lines if '.Should()' in x or 'Assert.' in x]
    r.update(id=f'UT-{i:03d}',cls=cls,method=method,group=cls+'.'+method.split('_')[0],
        source=str(p.relative_to(ROOT))+':'+str(s[:m.start()].count('\n')+1) if p and m else 'Check preserved unit test source',
        expected='\n'.join(checks[:8]) or 'Assert behavior in the source method (multi-line assertions); see source reference.',
        inputs=r['name'].split('(',1)[1].rstrip(')') if '(' in r['name'] else 'Fixed Arrange fixture in source; no theory arguments.',
        scenario=re.sub(r'(?<=[a-z])(?=[A-Z])',' ',method.replace('_',' — ')),
        kind='B' if re.search('Boundary|Midnight|Limit|Zero|Empty|Maximum|Minimum|Expired',method) else 'A' if re.search('Reject|Invalid|Fail|Missing|NotFound|Denied|Forbidden|DoesNotExist|Unavailable|NoBooks',method) else 'N')

text=(BASE/'work/reports/report3.txt').read_text()
part=text.split('2.2.2 Descriptions',1)[1].split('3. Functional Requirements',1)[0]
ucmatches=re.findall(r'\n\s*(\d{2})\n\s*([^\n]+)\n\s*([^\n]+)\n\s*([^\n]+)',part)
rtm=[]
for uid,title,actors,description in ucmatches:
    f=next(x for x in features if int(uid) in x['ucs'])
    linked=[c for c in cases if f'UC{uid}' in c['requirement'].split(', ')]
    rtm.append(dict(id='UC'+uid,title=title.strip(),description=description.strip(),actors=actors.strip(),feature=f['id'],code=f['code'],
        tests=', '.join(c['id'] for c in linked),evidence='; '.join(sorted(set(c['evidence'].split(' :: ')[0] for c in linked if c['evidence']))),
        status='Fail' if uid=='18' else 'Not Tested',
        note='R5-DEF-001; partial approval workflow failed.' if uid=='18' else 'Requirement-level sign-off incomplete; linked case results can Pass without proving the entire UC.'))
assert len(rtm)==40
output=dict(features=features,cases=cases,unit=unit,rtm=rtm,workflows=workflows,nfr=nfr,
    counts=dict(unit=203,integrationPassed=17,integrationFailed=1,integrationSkipped=3),
    baseline='e5beb8ecff1fb41234857bc4975e8303e80f2694')
(BASE/'work/report-data.json').write_text(json.dumps(output,ensure_ascii=False,indent=2))
print(f'{len(features)} features; {len(cases)} non-unit cases; {len(unit)} unit cases; {len(set(r["group"] for r in unit))} function groups; {len(rtm)} UC trace rows')
