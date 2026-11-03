import fs from 'node:fs/promises';
import {Workbook,SpreadsheetFile,FileBlob} from '@oai/artifact-tool';
const base='/Users/haolongkakashi/Workspace/do-an-2/SmartLibrary-FPT/docs/report5';
const d=JSON.parse(await fs.readFile(base+'/work/report-data.json','utf8'));
const out=base+'/deliverables'; await fs.mkdir(out,{recursive:true});
const pending='Đợi HuyLong điền';
const col=n=>{let s='';while(n){n--;s=String.fromCharCode(65+n%26)+s;n=Math.floor(n/26);}return s;};
const value=(s,cell,v)=>s.getRange(cell).values=[[v]];
const formula=(s,cell,v)=>s.getRange(cell).formulas=[[v]];
function fmt(s,range,header=false){s.getRange(range).format={font:{name:'Arial',size:10,bold:header,color:header?'#FFFFFF':'#202020'},fill:header?'#789637':'#FFFFFF',wrapText:true,verticalAlignment:'top',rowHeight:header?32:60};}
function grid(w,name,headers,rows,widths){const s=w.worksheets.add(name);s.showGridLines=false;value(s,'A2',name);s.getRange('A2').format.font={name:'Arial',size:15,bold:true};
 s.getRange(`A4:${col(headers.length)}4`).values=[headers];fmt(s,`A4:${col(headers.length)}4`,true);
 if(rows.length){s.getRange(`A5:${col(headers.length)}${rows.length+4}`).values=rows;fmt(s,`A5:${col(headers.length)}${rows.length+4}`);}
 headers.forEach((_,i)=>s.getRange(`${col(i+1)}4:${col(i+1)}${rows.length+4}`).format.columnWidth=widths?.[i]??24);s.freezePanes.freezeRows(4);return s;}
function statuses(s,range){for(const [text,color] of [['Passed','#E2F0D9'],['Failed','#FCE4D6'],['Not Tested','#FFF2CC']])s.getRange(range).conditionalFormats.add('containsText',{text,format:{fill:color}});}
function metadata(s){value(s,'B4',pending+' — official project name');value(s,'B5',pending+' — official project code');value(s,'B6',pending+' — document code');value(s,'F4',pending+' — author');value(s,'F5',pending+' — issue date');value(s,'F6',pending+' — version');
 s.getRange('A11:F17').clear({applyTo:'contents'});s.getRange('A11:F11').values=[['2026-10-27','Working copy','Evidence and test inventory','A','Filled from preserved automated evidence; pending tests remain explicit.','dev e5beb8e; Report 3; TRX']];
 s.getRange('B4:D6').format.wrapText=true;s.getRange('F4:F6').format.wrapText=true;s.getRange('A4:F6').format.rowHeight=38;s.getRange('A11:F11').format.wrapText=true;s.getRange('A11:F11').format.rowHeight=65;}
const w=await SpreadsheetFile.importXlsx(await FileBlob.load(base+'/work/templates/Report5_Test Report.xlsx'));
metadata(w.worksheets.getItem('Cover'));
const index=w.worksheets.getItem('Test Cases');index.getRange('B9:F30').clear({applyTo:'contents'});formula(index,'D3',"=Cover!B4");formula(index,'D4',"=Cover!B5");value(index,'D5','Local PostgreSQL 17.11 / .NET 10; actual API services; mocked identity and external providers. See NFR Results and HANDOFF.');index.getRange('D5:F5').format.wrapText=true;index.getRange('D5:F5').format.rowHeight=65;
const groups=[d.cases.filter(x=>!x.mode.startsWith('Planned')),d.cases.filter(x=>x.mode.startsWith('Planned'))];
for(let i=0;i<2;i++){
 const s=w.worksheets.getItem('Feature '+(i+1)),rows=groups[i],end=11+rows.length;
 s.getRange('A11:T110').clear({applyTo:'contents'});s.getRange('A11:O11').unmerge();s.showGridLines=false;
 value(s,'B2',i===0?'Executed API integration and local NFR / skipped placeholders':'Planned system and browser workflow tests');value(s,'B3','Temporary case IDs; requirement references use Report 3 UC numbering. Pass at case level is not feature acceptance.');
 s.getRange('B3:E3').format.wrapText=true;s.getRange('A3:E3').format.rowHeight=42;
 formula(s,'B4',`=COUNTA(A12:A${end})`);
 s.getRange('B5:E5').values=[['Passed','Failed','Not Tested','N/A']];
 for(let r=6;r<=8;r++)for(let c=2;c<=5;c++)formula(s,`${col(c)}${r}`,`=COUNTIF($${['F','I','L'][r-6]}$12:$${['F','I','L'][r-6]}$${end},${col(c)}$5)`);
 const headers=['Test Case ID','Test Case Description','Test Case Procedure','Expected Results','Preconditions','Round 1','Test date','Tester','Round 2','Test date','Tester','Round 3','Test date','Tester','Note / defect','Actual result','Requirement','Evidence','Test data','Level / mode'];
 s.getRange('A10:T10').values=[headers];fmt(s,'A10:T10',true);
 const matrix=rows.map(c=>[c.id,c.feature+' — '+c.description,c.procedure,c.expected,c.precondition,c.status,c.date,c.tester,'Not Tested','','','Not Tested','','',c.note,c.actual,c.requirement,c.evidence,c.data,c.mode]);
 s.getRange(`A12:T${end}`).values=matrix;fmt(s,`A12:T${end}`);s.getRange(`A12:T${end}`).format.rowHeight=100;
 value(s,'U10','Feature group');fmt(s,'U10',true);s.getRange(`U12:U${end}`).values=rows.map(c=>[c.feature]);fmt(s,`U12:U${end}`);s.getRange(`U10:U${end}`).format.columnWidth=30;
 [16,44,48,48,42,14,13,20,14,13,20,14,13,20,36,48,22,48,40,26].forEach((x,j)=>s.getRange(`${col(j+1)}10:${col(j+1)}${end}`).format.columnWidth=x);
 for(const c of ['F','I','L']){statuses(s,`${c}12:${c}${end}`);s.getRange(`${c}12:${c}${end}`).dataValidation={rule:{type:'list',values:['Passed','Failed','Not Tested','N/A']}};}
 s.freezePanes.freezeRows(10);s.freezePanes.freezeColumns(2);
 index.getRange(`B${9+i}:F${9+i}`).values=[[i+1,i?'Planned system/E2E':'API integration/local NFR',s.name,i?'Not executed; procedure ready':'Observed results; mocks explicitly identified','See per-case preconditions']];
}
const st=w.worksheets.getItem('Test Statistics');formula(st,'C3','=Cover!B4');formula(st,'C4','=Cover!B5');value(st,'C5',pending+' — document code');value(st,'H3',pending+' — author');value(st,'H4',pending+' — reviewer');value(st,'H5',pending+' — issue date');value(st,'C6','Only Round 1 results. Functional/API + local NFR are listed separately by mode; planned tests are not passes.');st.getRange('C6:H6').format.wrapText=true;st.getRange('C6:H6').format.rowHeight=50;
st.getRange('B10:H45').clear({applyTo:'all'});
st.getRange('B10:H10').values=[['No','Module code','Passed','Failed','Not Tested','N/A','Number of test cases']];
fmt(st,'B10:H10',true);
const statFeatures=[...d.features.map(f=>f.name),'Performance'];
for(let i=0;i<statFeatures.length;i++){
 const row=11+i,feature=statFeatures[i];value(st,`B${row}`,i+1);value(st,`C${row}`,feature);
 for(let j=0;j<4;j++){
  const status=['Passed','Failed','Not Tested','N/A'][j];
  formula(st,`${col(4+j)}${row}`,`=COUNTIFS('Feature 1'!$U$12:$U$110,C${row},'Feature 1'!$F$12:$F$110,"${status}")+COUNTIFS('Feature 2'!$U$12:$U$110,C${row},'Feature 2'!$F$12:$F$110,"${status}")`);
 }
 formula(st,`H${row}`,`=SUM(D${row}:G${row})`);
}
const statTotal=12+statFeatures.length;
value(st,`C${statTotal}`,'Sub total');for(let c=4;c<=8;c++)formula(st,`${col(c)}${statTotal}`,`=SUM(${col(c)}11:${col(c)}${statTotal-2})`);
value(st,`C${statTotal+2}`,'Executed / applicable cases');value(st,`C${statTotal+3}`,'Passed / applicable cases');
formula(st,`E${statTotal+2}`,`=IFERROR((D${statTotal}+E${statTotal})/(H${statTotal}-G${statTotal}),0)`);
formula(st,`E${statTotal+3}`,`=IFERROR(D${statTotal}/(H${statTotal}-G${statTotal}),0)`);
st.getRange(`E${statTotal+2}:E${statTotal+3}`).setNumberFormat('0.0%');
fmt(st,`B11:H${statTotal}`);st.getRange(`B11:H${statTotal}`).format.rowHeight=26;
st.getRange(`B10:H${statTotal}`).format.borders={preset:'all',style:'thin',color:'#808080'};
st.getRange(`B10:H${statTotal}`).format.verticalAlignment='center';
st.getRange(`D11:H${statTotal}`).format.horizontalAlignment='center';
st.getRange(`B11:B${statTotal}`).format.horizontalAlignment='center';
fmt(st,`B${statTotal}:H${statTotal}`,true);st.getRange(`B${statTotal}:H${statTotal}`).format.rowHeight=28;
st.getRange(`D${statTotal}:H${statTotal}`).format.horizontalAlignment='center';
st.getRange(`E${statTotal+2}:E${statTotal+3}`).setNumberFormat('0.00%');
st.getRange(`C10:C${statTotal+3}`).format.columnWidth=38;
st.getRange(`C11:C${statTotal}`).format.wrapText=true;
st.getRange(`D11:H${statTotal}`).setNumberFormat('0');
const rt=grid(w,'Requirement Traceability',['Requirement','Feature','Requirement / acceptance intent','Actors','Implementation reference','Case IDs','Evidence','Verdict','Limitation'],d.rtm.map(x=>[x.id,x.feature,x.title+' — '+x.description,x.actors,x.code,x.tests,x.evidence,x.status,x.note]),[14,14,65,24,42,55,30,15,55]);rt.getRange('A5:I44').format.rowHeight=120;
const unitMap=x=>x.cls.includes('Circulation')?'UC08, UC09, UC10, UC23, UC24, UC25, UC26, UC30':x.cls.includes('Register')?'UC01':x.cls.includes('Notification')||x.cls.includes('Alert')?'UC17, UC31':x.cls.includes('Policy')?'UC35':x.cls.includes('Report')?'UC37':x.cls.includes('AiSettings')?'UC36':x.cls.includes('AiInsights')?'UC32, UC38, UC39':x.cls==='BookServiceTests'?'UC04, UC05, UC28':'UC06, UC40';
grid(w,'Unit Traceability',['Test ID','Related UCs','Test method','Source','Evidence','Case result','Mapping limit'],d.unit.map(x=>[x.id,unitMap(x),x.name,x.source,'evidence/unit.trx',x.status,'Module-level supporting evidence; not full UC acceptance.']),[16,35,85,85,30,16,55]);
grid(w,'Mandatory Features',['Group ID','Feature','Report 3 UCs','Actors','Code reference','Commitment status'],d.features.map(f=>[f.id,f.name,f.ucs.map(x=>'UC'+String(x).padStart(2,'0')).join(', '),f.actor,f.code,f.commitment]),[14,30,35,25,50,65]);
grid(w,'Main Workflows',['ID','Workflow','Actors','Feature','Steps','Browser verdict'],d.workflows.map(x=>[...x,'Not Tested']),[14,32,35,30,85,18]);
grid(w,'Defects',['ID','Status','Severity','Steps','Expected','Actual','Evidence / source'],[['R5-DEF-001','Open / Fail','High — proposed','Seed Submitted; approve; POST request-more-info on same ID.','Reject terminal-state transition; keep Approved / Active.','Second API call succeeds. Source writes NeedMoreInfo / PendingDocuments; post-action DB assertion not reached.','integration.trx :: Registration_ApprovedRequest_CannotBeReopenedForDocuments; RegistrationService.cs:193–208']],[18,18,22,65,55,75,75]);
const defects=w.worksheets.getItem('Defects');defects.getRange('A6:G6').values=[['R5-DEF-002','Open / Fail','High — proposed','Reader POST /api/v1/books/form with unique Code, Title, TotalCopies=1.','HTTP 403; no new book.','HTTP 201; persisted=True in isolated PostgreSQL. JSON routes deny Reader, form route does not.','evidence/planned-api/planned-api.trx :: ST_02_3_ReaderCannotMutateInventory; BooksController.CreateFromForm']];fmt(defects,'A6:G6');defects.getRange('A6:G6').format.rowHeight=110;
const nr=grid(w,'NFR Results',['Concurrency','Requests','Errors','Duration s','Requests/s','Mean ms','P50 ms','P95 ms','P99 ms','Max ms'],d.nfr.summaries.map(x=>[x.concurrency,x.requests,x.errors,x.seconds,x.requestsPerSecond,x.meanMs,x.p50Ms,x.p95Ms,x.p99Ms,x.maxMs]),Array(10).fill(15));nr.getRange('D5:J8').setNumberFormat('0.00');
value(nr,'A11','Scope');nr.getRange('B11:J13').merge();value(nr,'B11','1000 titles / 4000 copies; HTTP loopback Kestrel + PostgreSQL; macOS 15.3 Arm64; 10 logical processors. CPU model and RAM unavailable. 60 warmups; same-process generator; single short closed-loop run. Evidence: nfr-local.json.');nr.getRange('B11:J13').format.wrapText=true;
nr.getRange('A15:J18').merge();value(nr,'A15','Đề xuất: API p95 <2000 ms and zero errors. All four local bursts meet this proposed check. SRS standard page load <2s / 100 active users remain Not Tested end-to-end. AI <3.5s, 99.9% availability, 180-day MTBF, 2h MTTR, 50k titles/200k copies and CPU/RAM <70% were not measured. TLS/browser/real-provider delays are excluded.');nr.getRange('A15:J18').format.wrapText=true;
grid(w,'ReadMe',['Topic','Meaning'],[
 ['Baseline',d.baseline+'; local test harness additions; no application changes.'],['Execution','203 unit passes are in the separate unit workbook. Here: 17 API integration passes / 1 failure / 3 skipped; four local NFR summaries.'],
 ['Verdicts','Case Passed ≠ requirement fully verified. Not Tested includes skipped placeholders and planned tests. No browser E2E claimed.'],['External services','PayOS gateway/signature, email, storage and identity authentication use test doubles. Not live-provider evidence.'],
 ['IDs','UC IDs come from Report 3. MF/ST/IT/UT/WF/NFR IDs are provisional. Đợi HuyLong điền — confirm official ID convention.'],['Metadata',pending+' — official project name/code, author/date/version, team and roles, Review 2/Defense/submission dates, official evidence location.'],
 ['Evidence','Relative evidence paths resolve from docs/report5, one directory above deliverables. Preserve TRX files and method names when moving files.'],['Scope conflicts','UC29 import-ticket lifecycle is not established by copy intake. Reviews prerequisite, payment providers, realtime paths and security/NFR claims require SRS/code reconciliation.'],['Follow-up API run','24 targeted tests: 22 Passed / 2 Failed. Partial ST-10-2 remains Not Tested. API/auth doubles are not browser E2E; reused workflow helpers are not independent feature coverage.'],['Sign-off','No release acceptance: two open proposed-High defects; unexecuted browser/provider/NFR coverage. Signed BM04 commitment not supplied.']],[28,115]);
await w.recalculate();console.log((await w.inspect({kind:'region',sheetId:'Test Statistics',range:`C10:H${statTotal+3}`,maxChars:2200})).ndjson);
await (await SpreadsheetFile.exportXlsx(w)).save(out+'/Report5_Test Report.xlsx');
if(process.env.REPORT5_RENDER==='1') for(const [sheet,range] of [['Test Statistics',`B10:H${statTotal+3}`],['Feature 1','A10:F14'],['NFR Results','A2:J8']]){const b=await w.render({sheetName:sheet,range,scale:1,format:'png'});await fs.writeFile(`/private/tmp/smartlibrary-report5-work/qa-${sheet.replaceAll(' ','')}.png`,new Uint8Array(await b.arrayBuffer()));}

// Legacy XLS matrix reconstructed as XLSX: one sheet per related tested function group.
const u=Workbook.create();const cover=grid(u,'Cover',['Item','Value'],[['Project name',pending+' — official name'],['Project code',pending+' — official code'],['Creator / issue date / version',pending+' — author, issue date and version'],['Test execution','2026-10-27; preserved unit.trx; 203 Passed / 0 Failed'],['Baseline',d.baseline],['Document','Unit test function matrices; original XLS converted to XLSX. Sample results removed.'],['Evidence scope','Existing unit fixtures and mocks; not browser or live-provider verification.'],['Team / milestones / evidence location',pending+' — actual roles, Review 2/Defense 1.1/submission dates, official evidence archive']],[30,115]);
const groupsU=Map.groupBy(d.unit,x=>x.group);const functions=[];
let ni=0;
for(const [name,rows] of groupsU){ni++;const sn='F'+String(ni).padStart(3,'0');const s=u.worksheets.add(sn);s.showGridLines=false;const last=col(rows.length+5);s.getRange('A2:E2').merge();value(s,'A2','Function Code');s.getRange(`F2:${last}2`).merge();value(s,'F2',sn+' — '+name);s.getRange(`F2:${last}2`).format.wrapText=true;s.getRange('A2:'+last+'2').format.rowHeight=45;
 s.getRange('A3:E3').merge();value(s,'A3','Source class');s.getRange(`F3:${last}3`).merge();value(s,'F3',rows[0].cls);
 s.getRange('A4:E4').merge();value(s,'A4','Created / executed by');s.getRange(`F4:${last}4`).merge();value(s,'F4',pending+' — author; execution: xUnit automation');
 s.getRange('A6:D6').values=[['Passed','Failed','Not Tested','Total']];s.getRange('A7:D7').formulas=[[`=COUNTIF(F18:${last}18,"Passed")`,`=COUNTIF(F18:${last}18,"Failed")`,`=COUNTIF(F18:${last}18,"Not Tested")`,`=COUNTA(F9:${last}9)`]];
 const labels={9:'Test case ID',10:'Condition / scenario',11:'Precondition',12:'Input / theory values',13:'Confirm — assertion excerpt',14:'Source function reference',15:'Execution instruction',16:'Exception / log',17:'Type N / A / B (provisional)',18:'Passed / Failed',19:'Executed date',20:'Duration',21:'Evidence'};
 for(const [r,label] of Object.entries(labels)){s.getRange(`A${r}:E${r}`).merge();value(s,`A${r}`,label);}
 const matrix=[rows.map(x=>x.id),rows.map(x=>x.scenario),rows.map(x=>'Arrange fixture and test doubles defined in '+x.cls+'. No live service.'),rows.map(x=>x.inputs),rows.map(x=>x.expected),rows.map(x=>x.source),rows.map(x=>'dotnet test UnitTests project --filter FullyQualifiedName~'+x.cls+'.'+x.method),rows.map(x=>x.message||'No test failure logged; expected exceptions are asserted in source.'),rows.map(x=>x.kind),rows.map(x=>x.status),rows.map(x=>x.date),rows.map(x=>x.duration),rows.map(x=>'evidence/unit.trx :: '+x.name)];
 s.getRange(`F9:${last}21`).values=matrix.map(row=>row.map(v=>typeof v==='string'&&v.startsWith('=')?"'"+v:v));fmt(s,`A9:${last}21`);fmt(s,`A9:${last}9`,true);s.getRange(`F9:${last}21`).format.columnWidth=48;s.getRange('A1:E21').format.columnWidth=7;
 for(const [r,h] of [[10,100],[11,65],[12,70],[13,210],[14,80],[15,85],[16,70],[17,25],[18,25],[19,25],[20,25],[21,110]])s.getRange(`A${r}:${last}${r}`).format.rowHeight=h;
 statuses(s,`F18:${last}18`);s.freezePanes.freezeRows(9);s.freezePanes.freezeColumns(5);
 functions.push([sn,rows[0].cls,name.split('.').slice(1).join('.'),rows.length,rows[0].source,'LOC/KLOC target not agreed; no fabricated density metric.']);
}
const fun=grid(u,'Functions',['Sheet / function code','Class','Tested function group','Cases','Source','Notes'],functions,[18,38,45,12,85,50]);
const stats=grid(u,'Statistics',['Function','Passed','Failed','Not Tested','Total'],functions.map(x=>[x[0],null,null,null,null]),[20,18,18,18,18]);
functions.forEach((x,i)=>{for(let j=1;j<=4;j++)formula(stats,`${col(j+1)}${i+5}`,`='${x[0]}'!${col(j)}7`);});
const total=functions.length+6;value(stats,`A${total}`,'Total');for(let c=2;c<=5;c++)formula(stats,`${col(c)}${total}`,`=SUM(${col(c)}5:${col(c)}${total-2})`);value(stats,`A${total+2}`,'Executed / total');formula(stats,`B${total+2}`,`=IFERROR((B${total}+C${total})/E${total},0)`);stats.getRange(`B${total+2}`).setNumberFormat('0.0%');
grid(u,'Guideline',['Topic','Meaning'],[['Matrix convention','One sheet per class/function-prefix group; columns are executed test cases including theory variants. Full test-method name remains in evidence.'],['Expected results','Assertion excerpts are transcribed from source, not invented business requirements. Read referenced method for full setup/multiline assertions.'],['N / A / B','Normal / Abnormal / Boundary. Initial classification by scenario; review before sign-off. It does not change recorded test outcomes.'],['LOC density','No agreed KLOC threshold or measured per-function LOC; intentionally not calculated.'],['Statistics','203 actual TRX results; no template sample results. Unit test pass is not feature acceptance or proof of service integration.'],['Known naming issue','OccupiesCopy_ExcludesPendingRequests name is stale: its assertion expects Pending to occupy a copy. Follow assertion/code, not method label.'],['Live catalog label','RealCatalogTopicTests uses a catalog fixture; names containing LiveCatalog do not imply a live Supabase query.']],[30,120]);
const ug=u.worksheets.getItem('Guideline');ug.getRange('A12:B12').values=[['Related integration defect','R5-DEF-001 — Open / Fail: Approved registration accepts request-more-info. Evidence: integration.trx, Registration_ApprovedRequest_CannotBeReopenedForDocuments. This is an integration failure, not a failed unit case; the 203 unit results remain Passed.']];fmt(ug,'A12:B12');ug.getRange('A12:B12').format.rowHeight=85;
ug.getRange('A13:B13').values=[['Related authorization defect','R5-DEF-002 — Open / Fail: Reader can create a book via POST /api/v1/books/form (HTTP 201; persisted=True). Evidence: planned-api/planned-api.trx, ST_02_3_ReaderCannotMutateInventory. Integration defect; unit verdicts unchanged.']];fmt(ug,'A13:B13');ug.getRange('A13:B13').format.rowHeight=85;
await u.recalculate();console.log((await u.inspect({kind:'region',sheetId:'Statistics',range:`A${total}:E${total+2}`,maxChars:1000})).ndjson);
await (await SpreadsheetFile.exportXlsx(u)).save(out+'/Report5_Unit Test.xlsx');
if(process.env.REPORT5_RENDER==='1') for(const [sheet,range] of [['Cover','A2:B12'],['F001','A9:G13'],['Statistics',`A${total}:E${total+2}`]]){const b=await u.render({sheetName:sheet,range,scale:1,format:'png'});await fs.writeFile(`/private/tmp/smartlibrary-report5-work/qa-unit-${sheet}.png`,new Uint8Array(await b.arrayBuffer()));}
console.log('Exported both workbooks');
