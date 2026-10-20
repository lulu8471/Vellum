// Synthetic fixtures only: invoke the actual R8 converter and workbook writer.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {appendInvoiceEvidence,createInlineReviewElement,withoutDescriptionNotices,applySourceDescriptionPolicy} from '../assets/invoice-inline-v9.js';
import {mergeShipmentModel,appendMergeSources} from '../assets/shipment-merge-v4.js';
import {classifyInvoiceItem,reviewInvoiceDescriptions,reviewInvoiceProducts,inferProduct} from '../assets/invoice-classification-v9.js';
import {buildInvoiceDownloads} from '../assets/invoice-downloads-v9.js';
function bundle(){
 let code=fs.readFileSync(new URL('../assets/index-VELLUM-PDF9-20261020.js',import.meta.url),'utf8');
 code=code.replace(/^(?:import[^\n]+\n)+/,'').replace(/^document.documentElement.dataset.vellumBuild=[^;]+;/,'');
 code=code.replace(/\(function\(\)\{let e=document\.createElement\(`link`\)[\s\S]*?\}\)\(\);var p=/,'var p=');
 code=code.slice(0,code.lastIndexOf('(0,T.createRoot)'))+';globalThis.api={parse:be,write:Ee,xlsx:E.default};';
 const context={applySourceDescriptionPolicy,withoutDescriptionNotices,appendInvoiceEvidence,mergeShipmentModel,appendMergeSources,classifyInvoiceItem,reviewInvoiceDescriptions,reviewInvoiceProducts,console,Uint8Array,ArrayBuffer,TextEncoder,TextDecoder,File,Blob,URL,setTimeout,clearTimeout,window:{prompt(){throw Error('Unexpected prompt')},confirm(){throw Error('Unexpected confirmation')}},fetch:async()=>new Response(fs.readFileSync(new URL('../templates/invoice-standard.xlsx',import.meta.url)))};
 vm.createContext(context);vm.runInContext(code,context);return context.api;
}
const api=bundle();
function source(){return {sourceSheetName:'SYNTHETIC',invoiceNumber:'100001',shipmentNumber:'200001',shipto:'99',pages:2,extractionMode:'pdf-ocr',invoices:[{invoiceNumber:'100001'},{invoiceNumber:'100002'}],declaredTotals:{quantity:3,value:50,weightGrams:8},lines:[{lineNumber:1,sku:'TEST-A',description:'UNRECOGNIZED SOURCE',rawDescription:'UNRECOGNIZED SOURCE',origin:'US',hts:'71131900009',invoiceNumber:'100001',shipto:'99',quantity:1,unitCost:10,extendedCost:10,unitWeightGrams:2},{lineNumber:2,sku:'TEST-B',description:'TEST ER',origin:'US',hts:'71131900009',invoiceNumber:'100002',shipto:'99',quantity:2,unitCost:20,extendedCost:40,unitWeightGrams:3}]};}
test('unknown names/categories automatically export with truthful warnings, never required review',async()=>{
 const m=await api.parse(new File([],'synthetic.pdf'),undefined,source());
 assert.equal(m.issues.filter(x=>x.severity==='error').length,0);
 assert.equal(m.rows[0].itemDescription,'UNRECOGNIZED SOURCE');
 assert.equal(m.rows[0].productDescription,'Unknown (unverified)');
 assert.equal(m.rows[0].code,'');assert.equal(m.rows[0].unit,'');
 assert.ok(!m.issues.some(x=>['Item Description','Product Description','Classification'].includes(x.field)));
 assert.equal(createInlineReviewElement({},m),null);
 const downloads=await buildInvoiceDownloads(m,api.write);assert.equal(downloads.length,1);
 const bytes=await(await fetch(downloads[0].href)).arrayBuffer();URL.revokeObjectURL(downloads[0].href);
 const w=api.xlsx.read(bytes,{type:'array',cellFormula:true}),s=w.Sheets[w.SheetNames[0]];
 assert.equal(s.B2.v,100001);assert.equal(s.B3.v,100002);assert.equal(s.N4.v,50);
 assert.equal(s.N4.f,'SUBTOTAL(109,N2:N3)');assert.equal(s.K3.f,'I3*J3');assert.equal(s.P3.f,'I3*O3/1000');
 assert.equal(s.T2?.v??'','');assert.equal(s.T3.f,'IF(LEFT(G3,3)="Ear","NPR","PCE")');
 assert.equal(api.xlsx.utils.sheet_to_json(w.Sheets['PDF extraction'],{header:1}).length,3);
});
test('numeric mismatch blocks entire combined source rather than dropping one invoice',async()=>{
 const p=source();p.declaredTotals.value=49;const m=await api.parse(new File([],'synthetic.pdf'),undefined,p);
 assert.ok(m.issues.some(x=>x.severity==='error'&&x.field==='Total Line Value'));
 assert.deepEqual(await buildInvoiceDownloads(m,()=>{throw Error('must not write')}),[]);
 await assert.rejects(api.write(m),/Resolve/);
});
test('bounded abbreviations and conflicting catalog do not invent classifications or source names',()=>{
 assert.equal(inferProduct('TEST RG 7'),'Ring');assert.equal(inferProduct('TEST ER'),'Earrings');assert.equal(inferProduct('MARGARITA'),'Jewelry');
 const c=classifyInvoiceItem('TEST','SOURCE ER','US',{product:'Ring',description:'OTHER NAME'});
 assert.equal(c.description,'SOURCE ER');assert.equal(c.product,'Unknown (unverified)');
 const d=reviewInvoiceDescriptions([{sku:'TEST',description:'CORRECTED?',rawDescription:'SOURCE OCR'}],'pdf-ocr',{TEST:{description:'REFERENCE'}});
 assert.equal(d[0].description,'SOURCE OCR');
});
test('same SKU in distinct invoices remains two rows in one workbook',async()=>{
 const p=source();p.lines[0].sku=p.lines[1].sku='TEST-SAME';p.lines[0].description=p.lines[1].description='TEST RG';delete p.lines[0].rawDescription;
 const m=await api.parse(new File([],'synthetic.pdf'),undefined,p);
 assert.equal(m.rows.length,2);assert.equal(m.rows[0].itemName,m.rows[1].itemName);assert.notEqual(m.rows[0].commercialInvoice,m.rows[1].commercialInvoice);
 assert.equal(m.issues.filter(i=>i.severity==='error').length,0);
 const links=await buildInvoiceDownloads(m,api.write);assert.equal(links.length,1);links.forEach(l=>URL.revokeObjectURL(l.href));
});
test('R9 entry and dynamic PDF/OCR helpers share isolated R9 app graph',()=>{
 const read=n=>fs.readFileSync(new URL('../'+n,import.meta.url),'utf8');
 assert.ok(read('index.html').includes('index-VELLUM-PDF9-20261020.js'));
 const app=read('assets/index-VELLUM-PDF9-20261020.js');
 assert.ok(!app.includes('./src-DGBeAv_F.js'));
 assert.ok(app.includes('./ocr-PDF9-20261020.js'));
 for(const name of ['invoice-classification-v9.js','invoice-inline-v9.js','invoice-downloads-v9.js','invoice-pdf-v9.js'])assert.ok(app.includes(name));
 for(const name of ['pdf-PDF9-20261020.js','ocr-PDF9-20261020.js']){
   assert.ok(read('assets/invoice-pdf-v9.js').includes(name));
   assert.ok(read('assets/'+name).includes('index-VELLUM-PDF9-20261020.js'));
   assert.ok(!read('assets/'+name).includes('index-VELLUM-PDF7-20261020.js'));
 }
});
test('missing descriptive wording is advisory, not a required name confirmation',async()=>{
 const p=source();p.lines[0].description='';p.lines[0].rawDescription='';
 const m=await api.parse(new File([],'synthetic.pdf'),undefined,p);
 assert.equal(m.issues.filter(i=>i.severity==='error').length,0);
 assert.equal(m.rows[0].itemDescription,'');assert.ok(!m.issues.some(i=>i.field==='Item Description'));
 const links=await buildInvoiceDownloads(m,api.write);assert.equal(links.length,1);links.forEach(l=>URL.revokeObjectURL(l.href));
});
test('text and scanned PDFs use bounded RG7 directly without reliability or confidence notices',async()=>{
 for(const mode of ['pdf-text','pdf-ocr']){
  const p=source();p.extractionMode=mode;
  p.lines[0]={...p.lines[0],description:'18R TEST LEAF BYPASS RG7',rawDescription:'18R TEST LEAF BYPASS RG7',descriptionConfidence:84,descriptionReadings:[{text:'18R TEST LEAF BYPASS RG7',confidence:84},{text:'18R TEST LEAF BYPASS RG7',confidence:84}]};
  const m=await api.parse(new File([],'synthetic.pdf'),undefined,p);
  assert.equal(m.rows[0].itemDescription,'18R TEST LEAF BYPASS RG7');assert.equal(m.rows[0].productDescription,'Ring');
  assert.ok(!m.issues.some(i=>/description|classification|confidence|reliable/i.test(i.field+' '+i.message)));
  assert.equal(createInlineReviewElement({},m),null);
  const book=api.xlsx.read(await(await api.write(m)).arrayBuffer(),{type:'array'});
  const evidence=api.xlsx.utils.sheet_to_json(book.Sheets['PDF extraction'],{header:1});
  assert.equal(evidence[1][5],'18R TEST LEAF BYPASS RG7');assert.ok(evidence[1].includes(84));
 }
});
test('page-wide OCR confidence is not a reliability prompt or gate before numeric validation',async()=>{
 const code=fs.readFileSync(new URL('../assets/invoice-pdf-v9.js',import.meta.url),'utf8');
 const scan=code.slice(code.indexOf('async function scanPage('),code.indexOf('export async function readInvoicePdf'));
 const context={Math,document:{createElement:()=>({width:0,height:0,getContext:()=>({})})},timeout:p=>p,refineWeights:async(c,w,text)=>text,refineDescriptions:async()=>[]};
 vm.createContext(context);vm.runInContext(scan+';globalThis.scan=scanPage;',context);
 const page={getViewport:({scale})=>({width:100*scale,height:100*scale}),render:()=>({promise:Promise.resolve()})};
 const worker={setParameters:async()=>{},recognize:async()=>({data:{text:'SOURCE TEXT',confidence:40,tsv:''}})};
 assert.equal((await context.scan(page,worker,2,6)).text,'SOURCE TEXT');
 // No relaxation of row arithmetic: tested separately against the actual bundle writer.
 assert.ok(code.includes('A line amount does not match quantity × unit cost.'));
 assert.ok(code.includes('The extracted ${field} total does not match the invoice.'));
});
test('unknown category reports unavailable classification and optional carton stays blank',async()=>{const m=await api.parse(new File([],'synthetic.pdf'),undefined,source());const check=m.checks.find(c=>c.label==='Classification');assert.equal(check.status,'warning');assert.equal(check.result,'Source classification unavailable');assert.ok(m.rows.every(r=>r.cartonId===''))});
