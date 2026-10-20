import {test} from 'node:test';
import assert from 'node:assert/strict';
import {decimal,parseLine,parseInvoice,validateInvoice,textLines} from '../assets/invoice-pdf-v6.js';
const row='1 7113.19.0000 12345678 TEST RING US 2.50 gm 2 $10.25 $20.50';
const base=(rows=row, totals='Total # of Pieces 2\nProduct Total Value USD $20.50\nTotal Weight 5.00 gm\nGrand Total Value USD $20.50')=>'Commercial Invoice: 123456\nSterling Shipment # 123456789\nShip To\n99 - Test Depot\n# HTS SKU Description\n'+rows+'\n'+totals;
const errors=(text,filename='COMPASS-123456-1-99.pdf')=>validateInvoice(parseInvoice(text,filename));
test('strict money parses ordinary, comma and OCR grouping dots',()=>{for(const [a,b] of [['0.00',0],['1234.56',1234.56],['1,234.56',1234.56],['1.234.56',1234.56]])assert.equal(decimal(a),b);for(const x of ['12,34.56','1,234.5','1.23.45','12x.34','-1.00'])assert.ok(Number.isNaN(decimal(x)),x);});
test('valid line has exact amounts and quantity, no numeric repair',()=>{const r=parseLine(row);assert.equal(r.quantity,2);assert.equal(r.unitCost,10.25);assert.equal(r.extendedCost,20.5);assert.equal(r.description,'TEST RING');assert.equal(r.unitWeightGrams,2.5);assert.equal(parseLine(row.replace('$20.50','$2O.50')),null)});
test('fully reconciled invoice validates',()=>assert.deepEqual(errors(base()),[]));
test('row punctuation normalization is bounded',()=>assert.deepEqual(errors(base(row.replace(/^1 /,'1. '))),[]));
test('quantity and weight totals required',()=>{for(const line of ['Total # of Pieces 2','Product Total Value USD $20.50\n','Grand Total Value USD $20.50','Total Weight 5.00 gm']){let text=base().replace(line,'');if(line.startsWith('Product')||line.startsWith('Grand'))continue;assert.ok(errors(text).length)}});
test('amount mismatch blocks even if declared total matches extended amount',()=>assert.match(errors(base(row.replace('$10.25','$10.26'))).join(' '),/line amount/));
test('missing, duplicate and out-of-order rows block',()=>{assert.match(errors(base(row.replace(/^1 /,'2 '))).join(' '),/incomplete/);assert.match(errors(base(row+'\n'+row)).join(' '),/Duplicate/)});
test('totals mismatch blocks',()=>{for(const [a,b] of [['Pieces 2','Pieces 3'],['Weight 5.00','Weight 5.10'],['$20.50','$21.50']]){const text=base().replace(a,b);assert.ok(errors(text).length)}});
test('product and grand total disagreement blocks unsupported charges',()=>assert.match(errors(base().replace('Grand Total Value USD $20.50','Grand Total Value USD $21.50')).join(' '),/grand totals disagree/));
test('metadata conflicts with filename block',()=>{assert.match(errors(base(),'COMPASS-654321-1-99.pdf').join(' '),/Invoice number disagrees/);assert.match(errors(base(),'COMPASS-123456-1-88.pdf').join(' '),/Ship To disagrees/)});
test('incomplete candidate row cannot silently vanish',()=>assert.match(errors(base(row+'\n2 7113.19.0000 87654321 DAMAGED RING')).join(' '),/row could not/));
test('wrapped description preserved without footer contamination',()=>{const inv=parseInvoice(base(row+'\nSMALL SIZE'));assert.equal(inv.lines[0].description,'TEST RING SMALL SIZE')});
test('nonfinite amounts and zero/negative quantities block',()=>{for(const r of [row.replace('gm 2','gm 0'),row.replace('$10.25 $20.50','$0.00 $0.00'),row.replace('2.50 gm','0.00 gm')])assert.ok(errors(base(r)).length)});
test('text layer positions reconstruct left-to-right then top-to-bottom',()=>assert.equal(textLines([{str:'right',transform:[1,0,0,1,20,80]},{str:'bottom',transform:[1,0,0,1,0,40]},{str:'left',transform:[1,0,0,1,0,81]}]),'left right\nbottom'));

test("missing both amount totals blocks",()=>assert.ok(errors(base().replace(/(?:Product|Grand) Total Value USD \$20\.50/g,'')).length));

import {classifyInvoiceItem,reviewInvoiceDescriptions,inferProduct} from '../assets/invoice-classification-v6.js';
test('classification preserves document description and origin despite catalog',()=>{const r=classifyInvoiceItem('12345678','NEW RING','Italy',{description:'OLD RING',product:'Ring',family:'FINE JEWELRY',coo:'US'});assert.equal(r.description,'NEW RING');assert.equal(r.coo,'IT')});
test('conflicting category requires explicit decision',()=>{const saved={product:'Ring',family:'FINE JEWELRY'};assert.throws(()=>classifyInvoiceItem('12345678','TEST ER','US',saved,()=>false),/confirmation/);const r=classifyInvoiceItem('12345678','TEST ER','US',saved,()=>true);assert.equal(r.product,'Earrings');assert.equal(r.classificationConfirmed,true)});
test('OCR description glyph discrepancy cancellation stops import',()=>{assert.throws(()=>reviewInvoiceDescriptions([{sku:'12345678',description:'DI 228'}],'pdf-ocr',{'12345678':{description:'DI 2.28'}},()=>null),/needs review/)});
test('OCR explicit edit retains raw text for traceability',()=>{let shown='';const [r]=reviewInvoiceDescriptions([{sku:'12345678',description:'DI 228'}],'pdf-ocr',{'12345678':{description:'DI 2.28'}},q=>{shown=q;return 'DI 2.28'});assert.match(shown,/DI 228/);assert.match(shown,/DI 2.28/);assert.equal(r.description,'DI 2.28');assert.equal(r.rawDescription,'DI 228');assert.equal(r.descriptionReviewed,'confirmed')});
test('OCR spacing-only normalization needs no substantive text substitution',()=>{const [r]=reviewInvoiceDescriptions([{sku:'12345678',description:'TEST RING'}],'pdf-ocr',{'12345678':{description:'TEST   RING'}},()=>{throw Error('Should not prompt')});assert.equal(r.description,'TEST   RING');assert.equal(r.rawDescription,'TEST RING');assert.equal(r.descriptionReviewed,'spacing')});
test('native text description stays untouched',()=>{const lines=[{sku:'12345678',description:'NEW RING'}];assert.equal(reviewInvoiceDescriptions(lines,'pdf-text',{'12345678':{description:'OLD RING'}}),lines)});
test('unknown OCR description requires review even without saved catalog',()=>assert.throws(()=>reviewInvoiceDescriptions([{sku:'12345678',description:'TEST'}],'pdf-ocr',{},()=>''),/needs review/));
test('generic category patterns handle compact suffixes without private SKUs',()=>{assert.equal(inferProduct('TEST BGLMD'),'Bangle');assert.equal(inferProduct('TEST PDTI1618'),'Pendant w/Chain');assert.equal(inferProduct('TEST ER'),'Earrings');assert.equal(inferProduct('UNCLASSIFIED'),'Jewelry')});
test('malformed declared money is not truncated',()=>assert.ok(errors(base().replaceAll('Value USD $20.50','Value USD $20.500')).length));

test('compact ring suffix accepts explicit numeric sizes without guessing OCR glyphs',()=>{for(const text of ['PT TEST WINGSRG 5.5','PT TEST RG8.5','PT TEST RG 4'])assert.equal(inferProduct(text),'Ring');for(const text of ['TEST RGSS','TEST RGS.5','TEST MERGE 8.5','TEST RG 5 OTHER','TEST WINGSRGS.S'])assert.equal(inferProduct(text),'Jewelry')});
