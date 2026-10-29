import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createImportRun,onceAsync} from '../assets/invoice-runtime-v15.js';
import {parseCorrectedPages} from '../assets/invoice-pdf-v15.js';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),never=()=>new Promise(()=>{});
const invoice=`Commercial Invoice: 123456
Sterling Shipment # 123456789
Sold To Ship To
11 - Source 99 - Depot
# HTS SKU Description Origin Unit Quantity Unit Cost Extended Cost
1 7113.19.0000 11111111 TEST KEY US 2.50 gm 1 $10.00 $10.00
Total # of Pieces 1 Product Total Value USD $10.00
Total Weight 2.50 gm
Grand Total Value USD $10.00`;
test('pre-aborted run invokes no work',async()=>{let starts=0;const c=new AbortController();c.abort();const run=createImportRun({signal:c.signal});await assert.rejects(run.step(()=>{starts++}),{code:'IMPORT_CANCELLED'});assert.equal(starts,0);run.finish()});
test('operation timeout aborts resources and never queues a subsequent operation',async()=>{let stopped=0,later=0;const run=createImportRun({budgetMs:1000});run.onStop(()=>{stopped++});await assert.rejects(run.step(never,10),{code:'IMPORT_TIMEOUT'});await assert.rejects(run.step(()=>{later++}));assert.equal(stopped,1);assert.equal(later,0);run.finish()});
test('overall deadline remains shared across several operations',async()=>{const run=createImportRun({budgetMs:20});await run.step(()=>sleep(12));await assert.rejects(run.step(()=>sleep(50)),{code:'IMPORT_DEADLINE'});run.finish()});
test('late stop registration cleans resource; stalled cleanup is bounded and preserves primary error',async()=>{const run=createImportRun({budgetMs:1000,cleanupMs:8});let terminated=0;run.stop();run.onStop(()=>{terminated++});await run.cleanup(never);assert.equal(terminated,1);assert.equal(run.stopped.code,'IMPORT_CANCELLED');run.finish()});
test('whole-progress is monotonic and ignores late worker progress',()=>{const events=[],run=createImportRun({progress:e=>events.push(e)});run.report({label:'Page 2/3 · verification pass 2/4',percent:44});run.report({label:'Next local crop 3%',percent:12});assert.deepEqual(events.map(e=>e.percent),[44,44]);assert.match(events[0].label,/elapsed/);run.stop();run.report({label:'late',percent:99});assert.equal(events.length,2);run.finish()});
test('resource disposer executes once even when cancel and finally both request it',async()=>{let n=0;const dispose=onceAsync(async()=>{n++});await Promise.all([dispose(),dispose()]);assert.equal(n,1)});
test('incomplete hidden OCR or blank middle page cannot authorize partial manual export',()=>{
 const pages=[invoice.split('Total #')[0],'','Total #'+invoice.split('Total #')[1]];
 const state={expectedPageCount:3,unreadPages:[1],interrupted:true};
 assert.throws(()=>parseCorrectedPages(pages,'test.pdf',pages,[],state),/Page 2 was not fully read/);
 const hidden=[invoice,'UNVERIFIED HIDDEN OCR'];
 assert.throws(()=>parseCorrectedPages(hidden,'test.pdf',hidden,[],{expectedPageCount:2,unreadPages:[1]}),/Page 2 was not fully read/);
 assert.throws(()=>parseCorrectedPages([invoice],'test.pdf',[invoice],[],state),/Every original PDF page/);
});
test('explicit complete page transcription is text-bound and still runs strict numeric checks',()=>{
 const pages=[invoice],state={expectedPageCount:1,unreadPages:[0],confirmedPages:[{index:0,text:invoice}]};
 assert.equal(parseCorrectedPages(pages,'test.pdf',pages,[],state).lines.length,1);
 assert.throws(()=>parseCorrectedPages([invoice+' '],'test.pdf',pages,[],state),/not fully read/);
 const bad=invoice.replace('Weight 2.50','Weight 9.99');
 assert.throws(()=>parseCorrectedPages([bad],'test.pdf',pages,[],{...state,confirmedPages:[{index:0,text:bad}]}),/does not match/);
});

// Execute the actual orchestration source with only imported engines replaced.
// No private invoice, external network, or platform-specific engine is required.
async function fixture({hang,lateWorker=false,hidden=false}={}){
 const counts={starts:0,recognizes:0,terminated:0,rawTerminated:0,cancelled:0,destroyed:0}, canvases=[];
 let resolveCreate;
 const worker={setParameters:async()=>hang==='parameters'?never():undefined,recognize:async()=>{counts.recognizes++;if(hang==='recognize')return never();return {data:{text:invoice,tsv:'',confidence:90}}},terminate:()=>{counts.terminated++;return hang==='cleanup'?never():Promise.resolve()}};
 const page={getViewport:({scale})=>({width:600*scale,height:800*scale}),getTextContent:()=>hang==='text'?never():Promise.resolve({items:hidden?[{str:invoice,transform:[1,0,0,1,0,10]}]:[]}),getOperatorList:async()=>({fnArray:[1],argsArray:[['img',600,800]]}),render:()=>({promise:hang==='render'?never():Promise.resolve(),cancel:()=>{counts.cancelled++}}),cleanup(){}};
 const engines={pdf:{GlobalWorkerOptions:{},OPS:{paintImageXObject:1,paintInlineImageXObject:2},getDocument(){return {promise:Promise.resolve({numPages:1,getPage:async()=>page}),destroy(){counts.destroyed++;return hang==='cleanup'?never():Promise.resolve()}}}},ocr:{default:{OEM:{LSTM_ONLY:1},PSM:{SINGLE_BLOCK:'6'},createWorker(_l,_o,opts){counts.starts++;opts.onWorker?.({terminate(){counts.rawTerminated++}});if(lateWorker)return new Promise(resolve=>{resolveCreate=()=>resolve(worker)});return Promise.resolve(worker)}}}};
 const key='syntheticEngines'+Math.random().toString(36).slice(2);globalThis[key]=engines;
 globalThis.document={createElement(){const c={width:1,height:1,getContext:()=>({drawImage(){}})};canvases.push(c);return c;}};
 let source=fs.readFileSync(new URL('../assets/invoice-pdf-v15.js',import.meta.url),'utf8');
 source=source.replace("'./invoice-runtime-v15.js'",JSON.stringify(new URL('../assets/invoice-runtime-v15.js',import.meta.url).href)).replace("import('./pdf-BOUNDED15-20261029.js')",`Promise.resolve(globalThis.${key}.pdf)`).replace("import('./ocr-BOUNDED15-20261029.js')",`Promise.resolve(globalThis.${key}.ocr)`).replaceAll('import.meta.url',JSON.stringify(new URL('../assets/invoice-pdf-v15.js',import.meta.url).href));
 const module=await import('data:text/javascript,'+encodeURIComponent(source));
 const file={name:'synthetic.pdf',arrayBuffer:()=>hang==='file'?never():Promise.resolve(new ArrayBuffer(0))};
 return {counts,canvases,module,file,resolveCreate:()=>resolveCreate?.(),dispose(){delete globalThis[key];delete globalThis.document;}};
}
for(const hang of ['file','text','render','parameters','recognize'])test(`real PDF orchestration ${hang} hang exits bounded, cleans resources, stops further OCR`,async()=>{
 const f=await fixture({hang});const run=createImportRun({budgetMs:25,cleanupMs:5});const start=Date.now();
 try{await assert.rejects(f.module.readInvoicePdf(f.file,undefined,{run}),e=>e.code==='IMPORT_DEADLINE');assert.ok(Date.now()-start<500);if(hang!=='file')assert.equal(f.counts.destroyed,1);if(['parameters','recognize'].includes(hang))assert.equal(f.counts.terminated,1);if(hang==='render')assert.equal(f.counts.cancelled,1);assert.ok(f.counts.recognizes<=2);assert.ok(f.canvases.every(c=>c.width===1&&c.height===1));}finally{run.finish();f.dispose()}
});
test('cancel during worker creation terminates the raw worker immediately and late resolved wrapper',async()=>{
 const f=await fixture({lateWorker:true}),run=createImportRun({budgetMs:1000,cleanupMs:5});
 const result=f.module.readInvoicePdf(f.file,undefined,{run});await sleep(5);run.stop();await assert.rejects(result,{code:'IMPORT_CANCELLED'});assert.equal(f.counts.rawTerminated,1);f.resolveCreate();await sleep(1);assert.equal(f.counts.terminated,1);assert.equal(f.counts.recognizes,0);run.finish();f.dispose();
});
test('exact OCR vendor spawning seam exposes raw Worker without changing recognition algorithms',()=>{
 const code=fs.readFileSync(new URL('../assets/ocr-BOUNDED15-20261029.js',import.meta.url),'utf8');const start=code.indexOf('t.exports=({workerPath:e,workerBlobURL:t,onWorker:r})=>');const end=code.indexOf('}})),R=',start);assert.ok(start>0&&end>start);
 const functionText=code.slice(start+'t.exports='.length,end+1);let seen,terminated=0;
 const spawn=vm.runInNewContext('('+functionText+')',{Blob:undefined,URL:undefined,Worker:class{terminate(){terminated++}}});
 const worker=spawn({workerPath:'/local-worker.js',workerBlobURL:false,onWorker:raw=>{seen=raw}});assert.equal(worker,seen);seen.terminate();assert.equal(terminated,1);
 const normalized=code.replaceAll('BOUNDED15-20261029','SAFARI14-20261029').replace('workerBlobURL:t,onWorker:r','workerBlobURL:t').replace('return r?.(n),n','return n');assert.equal(normalized,fs.readFileSync(new URL('../assets/ocr-SAFARI14-20261029.js',import.meta.url),'utf8'));
});

test('hanging cleanup after a successful extraction cannot hold the UI indefinitely',async()=>{const f=await fixture({hang:'cleanup'}),run=createImportRun({budgetMs:1000,cleanupMs:5});const start=Date.now();try{const result=await f.module.readInvoicePdf(f.file,undefined,{run});assert.equal(result.lines.length,1);assert.ok(Date.now()-start<500);assert.equal(f.counts.terminated,1);assert.equal(f.counts.destroyed,1)}finally{run.finish();f.dispose()}});
test('failed engine operation is terminal, not retried on an already broken worker',async()=>{let next=0,cleaned=0;const run=createImportRun();run.onStop(()=>{cleaned++});await assert.rejects(run.step(()=>Promise.reject(Error('engine failed'))),{code:'IMPORT_ENGINE_FAILURE'});await assert.rejects(run.step(()=>{next++}));assert.equal(cleaned,1);assert.equal(next,0);run.finish()});
test('deadline during final cleanup still returns cancellation, not a successful partial result',async()=>{const f=await fixture({hang:'cleanup'}),run=createImportRun({budgetMs:10,cleanupMs:20});try{await assert.rejects(f.module.readInvoicePdf(f.file,undefined,{run}),e=>e.code==='IMPORT_DEADLINE'&&e.sourcePages.length===1)}finally{run.finish();f.dispose()}});
