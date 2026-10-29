import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseDocument,parseInvoice,validateInvoice,parseCorrectedPages,zeroWeightReviewRows,observeWeights,qualifyWeightLedgers,verifyWeightReadings} from '../assets/invoice-pdf-v13.js';
const first=`Commercial Invoice: 123456
Commercial Invoice - Merchandise Return
Page 1 of 2
Commercial Invoice Information
Commercial Invoice # 123456 Ship Date 01-Jan-2026
Sterling Shipment # 123456789 Carrier Courier
Sold To Ship To
11 - Synthetic customer 99 - Synthetic depot
# HTS SKU Description Origin Unit Quantity Unit Cost Extended Cost
Weight
1 7113.19.0000 11111111 PT TEST ITEM US 0.00 gm 1 $10.00 $10.00
2 7113.19.0000 22222222 PT DI TEST LONG USA 2.50 gm 2 $20.00 $40.00
KEY`;
const second=`Commercial Invoice: 123456
Commercial Invoice - Merchandise Return
Page 2 of 2
# HTS SKU Description Origin Unit Quantity Unit Cost Extended Cost
Weight
3 7113.19.0000 33333333 PT TEST US 3.00 gm 1 $30.00 $30.00
30NL
Total # of Pieces 4 Product Total Value USD $80.00
Total Weight 8.00 gm
Grand Total Value USD $80.00`;
const pages=()=>[first,second];
test('multi-page merchandise-return layout retains wrapped names with no photo input',()=>{
 const parsed=parseDocument(pages(),'synthetic.pdf');
 assert.equal(parsed.invoices.length,1);const invoice=parsed.invoices[0];
 assert.equal(invoice.lines.length,3);assert.equal(invoice.shipto,'99');
 assert.equal(invoice.lines[1].description,'PT DI TEST LONG KEY');
 assert.equal(invoice.lines[2].description,'PT TEST 30NL');
 assert.deepEqual(invoice.declaredTotals,{quantity:4,value:80,merchandiseValue:80,freightValue:undefined,weightGrams:8});
 assert.equal(parsed.errors.length,1);assert.match(parsed.errors[0],/Line 1 \(SKU 11111111\).*0\.00 g/);
});
test('automatic parsing never treats a source-printed zero as verified',()=>{
 assert.throws(()=>parseCorrectedPages(pages(),'synthetic.pdf'),/explicitly confirm/);
 assert.match(validateInvoice(parseInvoice(pages().join('\n'))).join(' '),/0\.00 g/);
});
test('explicit row-specific review retains exact zero and audit without inventing weight',()=>{
 const confirmations=zeroWeightReviewRows(pages(),'synthetic.pdf');
 assert.equal(confirmations.length,1);
 const result=parseCorrectedPages(pages(),'synthetic.pdf',pages(),confirmations);
 assert.equal(result.lines[0].unitWeightGrams,0);assert.equal(result.lines[0].zeroWeightConfirmed,true);
 assert.match(result.lines[0].zeroWeightConfirmation,/retained, not estimated/);
 assert.equal(result.lines[1].zeroWeightConfirmed,undefined);assert.equal(result.declaredTotals.weightGrams,8);
 assert.deepEqual(result.originalExtractionPages,pages());assert.deepEqual(result.editedExtraction,pages());
});
test('confirmation is invalid after any page edit, filename change, or row identity substitution',()=>{
 const confirmation=zeroWeightReviewRows(pages(),'synthetic.pdf');
 for(const changed of [[first+'\n',second],[first.replace('11111111','44444444'),second],[first,second.replace('PT TEST US','PT OTHER US')]])assert.throws(()=>parseCorrectedPages(changed,'synthetic.pdf',pages(),confirmation),/explicitly confirm/);
 assert.throws(()=>parseCorrectedPages(pages(),'different.pdf',pages(),confirmation),/explicitly confirm/);
 assert.throws(()=>parseCorrectedPages(pages(),'synthetic.pdf',pages(),[{...confirmation[0],key:'wrong'}]),/explicitly confirm/);
 assert.throws(()=>parseCorrectedPages(pages(),'synthetic.pdf',pages(),true),/explicitly confirm/);
});
test('zero review never bypasses quantity, amount, document weight, identity or missing-row checks',()=>{
 for(const changed of [
 [first.replace('gm 1 $10.00','gm 0 $10.00'),second],
 [first.replace('$10.00 $10.00','$10.00 $11.00'),second],
 [first,second.replace('Weight 8.00','Weight 9.00')],
 [first.replace('Sterling Shipment # 123456789','Sterling Shipment #'),second],
 [first,second.replace('3 7113','4 7113')],
 [first,second.replace('Pieces 4','Pieces 5')]
 ])assert.throws(()=>parseCorrectedPages(changed,'synthetic.pdf',changed,zeroWeightReviewRows(changed,'synthetic.pdf')));
});
test('zero confirmation does not remove structural orphan-page validation',()=>{
 const changed=[first,second,'Total # of Pieces 4\nGrand Total Value USD $80.00'];
 assert.throws(()=>parseCorrectedPages(changed,'synthetic.pdf',changed,zeroWeightReviewRows(changed,'synthetic.pdf')));
});
test('direct full-page zero readings still require two complete independent raw ledgers',()=>{
 const readings=scale=>qualifyWeightLedgers(pages(),pages().flatMap((text,pageIndex)=>observeWeights(text,scale,6).map(row=>({...row,pageIndex}))));
 const a=readings(2.5),b=readings(3.2);
 assert.ok(a.every(row=>row.ledgerValid));assert.ok(a.some(row=>row.value===0));
 assert.match(verifyWeightReadings(first,a.filter(row=>row.pageIndex===0)).join(' '),/two independent/);
 assert.deepEqual(verifyWeightReadings(first,[...a,...b].filter(row=>row.pageIndex===0)),[]);
 const missing=first.replace('2.50 gm 2','unreadable gm 2');
 const incomplete=qualifyWeightLedgers([missing,second],[missing,second].flatMap((text,pageIndex)=>observeWeights(text,3.2,6).map(row=>({...row,pageIndex}))));
 assert.ok(incomplete.every(row=>!row.ledgerValid));
});
test('unreadable rows name the row for correction without guessing numeric glyphs',()=>{
 const parsed=parseDocument([first.replace('2.50 gm 2','2.50 gm B'),second]);
 assert.match(parsed.errors.join(' '),/Invoice line 2 could not be read completely/);
 assert.equal(parsed.invoices[0].lines.length,2);
});
test('delimiter artifacts do not change printed numeric fields',()=>{
 const changed=[first.replace('1 7113.19.0000 11111111','1.) = -7113.19.0000 = 11111111)').replace('2 7113.19.0000 22222222','2 = =7113.19.0000 22222222.'),second];
 const result=parseCorrectedPages(changed,'synthetic.pdf',changed,zeroWeightReviewRows(changed,'synthetic.pdf'));
 assert.equal(result.lines.length,3);assert.deepEqual(result.lines.map(r=>[r.sku,r.quantity,r.unitWeightGrams,r.unitCost,r.extendedCost]),[['11111111',1,0,10,10],['22222222',2,2.5,20,40],['33333333',1,3,30,30]]);
});
test('malformed SKU ends preceding description; its wrapped suffix never moves to another item',()=>{
 const changed=[first.replace('2 7113.19.0000 22222222','2 = =7113.19.0000 922222222)'),second];
 const result=parseDocument(changed,'synthetic.pdf');
 assert.equal(result.invoices[0].lines[0].description,'PT TEST ITEM');
 assert.match(result.errors.join(' '),/line 2 could not be read completely/);
 const readings=qualifyWeightLedgers(changed,changed.flatMap((text,pageIndex)=>observeWeights(text,3.2,6).map(row=>({...row,pageIndex}))));
 assert.ok(readings.every(row=>!row.ledgerValid));
});
test('invalid or incomplete input exposes no nonexistent zero-review rows',()=>{
 for(const input of [null,undefined,'text',[null],[''],['Commercial Invoice: 123456\nNo table rows']])assert.deepEqual(zeroWeightReviewRows(input),[]);
});
import fs from 'node:fs';
import vm from 'node:vm';
test('failed scans retain one best raw attempt for review with zero identities, filename and cleanup',async()=>{
 let code=fs.readFileSync(new URL('../assets/invoice-pdf-v13.js',import.meta.url),'utf8').replaceAll('export ','');
 const start=code.indexOf('async function scanPage('),end=code.indexOf('async function readInvoicePdf(',start);
 code=code.slice(0,start)+'async function scanPage(page,worker,scale){return suppliedScan(page,scale)}\n'+code.slice(end);
 code=code.replace("await import('./pdf-KEY13-20261029.js')",'mockPdf').replace("await import('./ocr-KEY13-20261029.js')",'mockTess').replaceAll('import.meta.url',JSON.stringify('https://example.test/assets/invoice-pdf-v13.js'));
 let destroyed=0,terminated=0;const counts=new Map();
 const pdf={numPages:2,getPage:async index=>({index,getTextContent:async()=>({items:[]}),getOperatorList:async()=>({fnArray:[1],argsArray:[[null,1000,1000]]}),cleanup(){}})};
 const ctx={URL,Uint8Array,setTimeout,clearTimeout,mockPdf:{GlobalWorkerOptions:{},OPS:{paintImageXObject:1},getDocument:()=>({promise:Promise.resolve(pdf),destroy:async()=>destroyed++})},mockTess:{default:{OEM:{LSTM_ONLY:1},PSM:{SINGLE_BLOCK:6},createWorker:async()=>({terminate:async()=>terminated++})}},suppliedScan:(page,scale)=>{
  const count=counts.get(page.index)||0;counts.set(page.index,count+1);
  const text=pages()[page.index-1];const degraded=count?text.replace('22222222','922222222').replace('33333333','933333333'):text;
  return {text:degraded,rawText:degraded,descriptions:[],weightReadings:observeWeights(degraded,scale,6)};
 }};
 vm.createContext(ctx);vm.runInContext(code+';globalThis.read=readInvoicePdf;',ctx);
 let error;try{await ctx.read({name:'synthetic.pdf',arrayBuffer:async()=>new ArrayBuffer(1)})}catch(caught){error=caught}
 assert.ok(error);assert.match(error.message,/0\.00 g/);assert.equal(error.sourceFilename,'synthetic.pdf');
 assert.equal(JSON.stringify(error.sourcePages),JSON.stringify(pages()));assert.equal(error.zeroWeightRows.length,1);
 assert.equal(error.zeroWeightRows[0].sku,'11111111');assert.equal(terminated,1);assert.equal(destroyed,1);
});
test('same invoice/SKU/line in distinct shipment groups requires separate source confirmations',()=>{
 const single=first.split('2 7113.19.0000')[0]+'\nTotal # of Pieces 1\nProduct Total Value USD $10.00\nTotal Weight 0.00 gm\nGrand Total Value USD $10.00';
 const changed=[single,single.replace('Shipment # 123456789','Shipment # 987654321')];
 const confirmations=zeroWeightReviewRows(changed,'synthetic.pdf');assert.equal(confirmations.length,2);
 assert.notEqual(confirmations[0].key,confirmations[1].key);
 assert.throws(()=>parseCorrectedPages(changed,'synthetic.pdf',changed,[confirmations[0]]),/explicitly confirm/);
 const result=parseCorrectedPages(changed,'synthetic.pdf',changed,confirmations);assert.equal(result.lines.length,2);assert.ok(result.lines.every(row=>row.zeroWeightConfirmed));
});
