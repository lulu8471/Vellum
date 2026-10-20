import {observeWeights,verifyWeightReadings} from '../assets/invoice-pdf-v10.js';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const page=(id,amount='12.00')=>`Commercial Invoice: ${id}\nSterling Shipment # 123456789\nShip To\n99 - Synthetic Depot\n# HTS SKU Description\n1 7113.19.0000 12345678 TEST RING US 2.50 gm 1 $${amount} $${amount}\nFreight/Insurance - $1.00 $1.00\nSUB TOTAL $${(Number(amount)+1).toFixed(2)} $${(Number(amount)+1).toFixed(2)}\nTotal # of Pieces 1\nProduct Total Value USD $${amount}\nFreight/Insurance Total Value USD $1.00\nTotal Weight 2.50 gm\nGrand Total Value USD $${(Number(amount)+1).toFixed(2)}`;
async function run(readings, nativeTexts=[]){
 let code=fs.readFileSync(new URL('../assets/invoice-pdf-v10.js',import.meta.url),'utf8').replaceAll('export ','');
 const start=code.indexOf('async function scanPage('),end=code.indexOf('async function readInvoicePdf(',start);
 code=code.slice(0,start)+'async function scanPage(page,worker,scale){return suppliedScan(page,scale)}\n'+code.slice(end);
 code=code.replace("await import('./pdf-PDF10-20261020.js')",'mockPdf').replace("await import('./ocr-PDF10-20261020.js')",'mockTess').replaceAll('import.meta.url',JSON.stringify('https://example.test/assets/invoice-pdf-v10.js'));
 const calls=[],counts=new Map();let destroyed=0,terminated=0;
 const pdf={numPages:readings.length,getPage:async i=>({index:i,getTextContent:async()=>({items:nativeTexts[i-1]?[{str:nativeTexts[i-1],transform:[1,0,0,1,0,0]}]:[]}),getOperatorList:async()=>({fnArray:i===1?[1]:[],argsArray:i===1?[[null,1000,1000]]:[]}),cleanup(){}})};
 const ctx={URL,Uint8Array,setTimeout,clearTimeout,mockPdf:{GlobalWorkerOptions:{},OPS:{paintImageXObject:1},getDocument:()=>({promise:Promise.resolve(pdf),destroy:async()=>{destroyed++}})},mockTess:{default:{OEM:{LSTM_ONLY:1},PSM:{SINGLE_BLOCK:6},createWorker:async()=>({terminate:async()=>{terminated++}})}},suppliedScan:(p,scale)=>{let n=counts.get(p.index)||0;counts.set(p.index,n+1);calls.push([p.index,scale]);const text=readings[p.index-1][Math.min(n,readings[p.index-1].length-1)];return {text,descriptions:[],weightReadings:observeWeights(text,scale,6)}}};
 vm.createContext(ctx);vm.runInContext(code+';globalThis.read=readInvoicePdf;',ctx);
 try{return {result:await ctx.read({name:'synthetic.pdf',arrayBuffer:async()=>new ArrayBuffer(1)}),calls,destroyed,terminated}}catch(error){return {error,calls,destroyed,terminated}}
}
test('validated whole pages remain intact while alternate scales recover letter-like row digits',async()=>{
 const good=page('123456'),other=page('654321','20.00'),badIndex=other.replace('\n1 7113','\nI 7113');
 const r=await run([[good,page('123456','99.00')],[badIndex,badIndex,badIndex,other]]);
 assert.equal(r.error,undefined);assert.deepEqual(r.calls,[[1,2.5],[2,2.5],[1,3.2],[2,3.2],[2,4],[2,3]]);assert.equal(r.result.lines.length,2);assert.equal(r.result.declaredTotals.value,34);assert.equal(r.result.lines[0].unitCost,12);assert.equal(r.destroyed,1);assert.equal(r.terminated,1);
});
test('complementary failures are not combined into invented passing rows or totals',async()=>{
 const source=page('654321');const badFreight=source.replace('Freight/Insurance - $1.00','Freight/Insurance - $100');const badTotal=source.replace('Grand Total Value USD $13.00','Grand Total Value USD $99.00');
 const r=await run([[page('123456')],[badFreight,badTotal,badFreight,badTotal]]);
 assert.ok(r.error);assert.match(r.error.message,/could not be verified/);assert.equal(r.calls.filter(c=>c[0]===1).length,2);assert.equal(r.calls.filter(c=>c[0]===2).length,4);assert.equal(r.destroyed,1);assert.equal(r.terminated,1);
});
test('letter-like row digit is never silently normalized or fabricated when no pass reads it',async()=>{
 const bad=page('123456').replace('\n1 7113','\nI 7113');const r=await run([[bad]]);assert.ok(r.error);assert.equal(r.calls.length,4);assert.match(r.error.message,/No complete invoice rows/);
});
test('blank or unrecognized OCR page cannot disappear behind a valid invoice',async()=>{for(const blank of ['', 'UNREADABLE SCAN']){const r=await run([[page('123456')],[blank]]);assert.ok(r.error);assert.match(r.error.message,/no recognizable invoice/);assert.equal(r.calls.filter(c=>c[0]===2).length,4)}});
test('bounded OCR Cartons label preserves printed carton digits without shipment fallback',async()=>{const r=await run([[page('123456')+'\nCartons 1234567890']]);assert.equal(r.result.lines[0].cartonNumber,'1234567890')});
test('legitimate same-invoice continuation pages are retried together rather than pinned as complete',async()=>{
 const first=page('123456').split('Total # of Pieces')[0];
 const second=page('123456').replace('\n1 7113','\n2 7113').replace('Pieces 1','Pieces 2').replace('Value USD $12.00','Value USD $24.00').replace('Insurance Total Value USD $1.00','Insurance Total Value USD $2.00').replace('Weight 2.50','Weight 5.00').replace('Grand Total Value USD $13.00','Grand Total Value USD $26.00');
 const r=await run([[first.replace('\n1 7113','\nI 7113'),first],[second]]);assert.equal(r.error,undefined);assert.deepEqual(r.calls,[[1,2.5],[2,2.5],[1,3.2],[2,3.2]]);assert.equal(r.result.invoices.length,1);assert.equal(r.result.lines.length,2);assert.equal(r.result.declaredTotals.value,26);
});
test('orphan totals cannot be hidden by an already complete preceding invoice',async()=>{for(const amount of ['13.00','99.00']){const orphan=`Total # of Pieces 1\nGrand Total Value USD $${amount}`;const r=await run([[page('123456')],[orphan]]);assert.ok(r.error);assert.match(r.error.message,/unidentified page/);assert.equal(r.calls.filter(c=>c[0]===2).length,4)}});
test('arithmetically consistent correlated weight misread is rejected when another scale disagrees',async()=>{const good=page('123456'),wrong=good.replaceAll('2.50','2.30');const r=await run([[wrong,good,good,good]]);assert.ok(r.error);assert.match(r.error.message,/Independent full-page weight readings disagree/)});
test('single-scale consistent weight is insufficient even when crop arithmetic passes',async()=>{const good=page('123456'),unreadable=good.replaceAll('2.50','250');const r=await run([[good,unreadable,unreadable,unreadable]]);assert.ok(r.error);assert.match(r.error.message,/two independent image scales/)});
test('two requests clamped to the same effective scale do not establish independent weight evidence',()=>{const text=page('123456'),readings=[...observeWeights(text,2.1,6),...observeWeights(text,2.1,6)];assert.match(verifyWeightReadings(text,readings).join(' '),/two independent/)});
test('same grand weight cannot hide a mismatching per-SKU direct reading',()=>{const text=page('123456'),readings=[...observeWeights(text,2.5,6),...observeWeights(text,3.2,6)];readings.find(r=>r.field==='item'&&r.scale===3.2).value=2.3;assert.match(verifyWeightReadings(text,readings).join(' '),/disagree/)});
test('legitimate printed integer weights remain supported through direct two-scale agreement',async()=>{const integer=page('123456').replaceAll('2.50','2');const r=await run([[integer]]);assert.equal(r.error,undefined);assert.equal(r.result.declaredTotals.weightGrams,2);assert.equal(r.calls.length,2)});
test('first fresh scan replaces self-consistent hidden OCR even when only money differs',async()=>{const actual=page('123456','12.00'),hidden=page('123456','99.00');const r=await run([[actual]],[hidden]);assert.equal(r.error,undefined);assert.equal(r.result.lines[0].unitCost,12);assert.equal(r.result.declaredTotals.value,13)});
test('native page OCRed later in a mixed document also needs independent weight corroboration',async()=>{const first=page('123456'),second=page('654321');const r=await run([[first],[second]],[first,second.replace('\n1 7113','\nI 7113')]);assert.equal(r.error,undefined);assert.equal(r.calls.filter(c=>c[0]===2).length,2);assert.equal(r.result.lines.length,2)});
