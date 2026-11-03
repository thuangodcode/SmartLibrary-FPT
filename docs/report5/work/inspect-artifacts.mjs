import fs from 'node:fs/promises';
import {FileBlob,SpreadsheetFile} from '@oai/artifact-tool';
const path='/Users/haolongkakashi/Workspace/do-an-2/SmartLibrary-FPT/docs/report5/work/templates/Report5_Test Report.xlsx';
const w=await SpreadsheetFile.importXlsx(await FileBlob.load(path));
console.log((await w.inspect({kind:'sheet',include:'id,name',maxChars:2000})).ndjson);
for (const name of ['Cover','Feature 1']) {
 const b=await w.render({sheetName:name,range:name==='Cover'?'A1:F17':'A1:H13',scale:1,format:'png'});
 await fs.writeFile(`/private/tmp/smartlibrary-report5-work/template-${name.replace(' ','')}.png`,new Uint8Array(await b.arrayBuffer()));
}
