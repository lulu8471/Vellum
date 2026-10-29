import {test} from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {bundle} from './commercial-harness.mjs';
import {adaptCommercialWorkbook,digest,rowDigest} from '../assets/commercial-excel-v12.js';
const api=bundle();
const header=['#','HTS','SKU','Description','Origin','Unit Weight (gm)','Quantity','Unit Cost (USD)','Extended Cost (USD)'];
const item=[1,'7113.19.0000','12345678','Brooch-TEST full material description','USA',39.1,1,100,100];
function source({unit='gm',items=[item],qty=1,total=100,photoFirst=false}={}) {
 const h=[...header];h[5]=`Unit Weight (${unit})`;
 const rows=[['HAWB :','6543210'],['Commercial Invoice:','123456'],h,...items,['','','','','Total :','',qty,'',total]];
 const w=api.xlsx.utils.book_new();const data=()=>api.xlsx.utils.book_append_sheet(w,api.xlsx.utils.aoa_to_sheet(rows),'Data');
 const photo=()=>api.xlsx.utils.book_append_sheet(w,api.xlsx.utils.aoa_to_sheet([['Commercial Invoice:','123456'],['#','SKU','Photo'],[1,'12345678'],[2],[3]]),'Photos');
 photoFirst?(photo(),data()):(data(),photo());
 return {w,rows,bytes:api.xlsx.write(w,{type:'array',bookType:'xlsx'})};
}
const parse=s=>api.parse(new File([s.bytes],'synthetic.xlsx'));
test('commercial table preserves full description and unified formulas with blank absent identifiers',async()=>{
 const m=await parse(source());assert.equal(m.rows.length,1);const r=m.rows[0];assert.equal(r.itemDescription,item[3]);assert.equal(r.productDescription,'Brooch');assert.equal(r.cartonId,'');assert.equal(r.shipto,'');assert.equal(r.commercialInvoice,'123456');assert.equal(r.documentNumber,'6543210');assert.equal(r.itemCoo,'US');assert.equal(r.extendedWeightKg,.0391);assert.equal(m.issues.filter(i=>i.severity==='error').length,0);
 const w=api.xlsx.read(await(await api.write(m)).arrayBuffer(),{type:'array',cellFormula:true}),s=w.Sheets[w.SheetNames[0]];assert.equal(s.F2.v,item[3]);assert.equal(s.U2.v,item[2]+'\n'+item[3]);assert.equal(s.U2.f,'E2&CHAR(10)&F2');assert.equal(s.P2.f,'I2*O2/1000');assert.equal(s.P2.v,.0391);assert.equal(w.SheetNames.length,1);
});
test('table detection ignores numbered photo sheet even first',async()=>assert.equal((await parse(source({photoFirst:true}))).rows.length,1));
test('explicit kg becomes grams for unchanged standardized writer',async()=>assert.equal((await parse(source({unit:'kg',items:[[...item.slice(0,5),.0391,...item.slice(6)]]}))).rows[0].itemWeightGrams,39.1));
test('tiny gm values follow header, never magnitude heuristic',async()=>assert.equal((await parse(source({items:[[...item.slice(0,5),.00639,...item.slice(6)]]}))).rows[0].extendedWeightKg,.00000639));
test('confirmed kg override requires both full-file and row fingerprint',async()=>{
 const s=source(),hash=await digest(s.bytes),row=await rowDigest('Data',4,s.rows[3]);
 for(const [corrections,expected] of [[new Map([[hash,[row]]]),39100],[new Map([['wrong',[row]]]),39.1],[new Map([[hash,['wrong']]]),null]]) {
  if(expected===null){await assert.rejects(adaptCommercialWorkbook(s.w,s.bytes,api.xlsx,corrections),/confirmed weight rows/);continue;}
  const a=await adaptCommercialWorkbook(s.w,s.bytes,api.xlsx,corrections),w=api.xlsx.read(a.bytes,{type:'array'});assert.equal(w.Sheets[w.SheetNames[0]].N2.v,expected);
 }
});
test('printed line mismatch blocks rather than silently recalculating',async()=>await assert.rejects(parse(source({items:[[...item.slice(0,8),99]]})),/item cost/));
test('printed total and quantity mismatch block',async()=>{await assert.rejects(parse(source({total:99})),/document totals/);await assert.rejects(parse(source({qty:2})),/document totals/)});
test('malformed weight rejects and missing totals rejects',async()=>{await assert.rejects(parse(source({items:[[...item.slice(0,5),'1,0',...item.slice(6)]]})),/invalid unit weight/);const s=source();delete s.w.Sheets.Data.A5;s.w.Sheets.Data['!ref']='A1:I4';await assert.rejects(adaptCommercialWorkbook(s.w,s.bytes,api.xlsx),/printed totals/)});
test('unknown unit fails closed',async()=>await assert.rejects(parse(source({unit:'oz'})),/weight unit/));
test('unknown category does not alter the complete goods-name column or prompt',async()=>{const row=[...item];row[3]='TEST full description with no category';const m=await parse(source({items:[row]}));assert.equal(m.rows[0].combinedDescription,row[2]+'\n'+row[3]);const w=api.xlsx.read(await(await api.write(m)).arrayBuffer(),{type:'array',cellFormula:true});assert.equal(w.Sheets[w.SheetNames[0]].U2.v,row[2]+'\n'+row[3]);});
test('R12 PDF modules only relocate dependency paths with no algorithm changes',async()=>{const fs=await import('node:fs');for(const name of ['classification','downloads','inline','pdf','zip']){const old=fs.readFileSync(new URL(`../assets/invoice-${name}-v11.js`,import.meta.url),'utf8').replaceAll('index-VELLUM-PDF11-20261020.js','index-VELLUM-EXCEL12-20261021.js').replaceAll('-v11.js','-v12.js').replaceAll('PDF11-20261020','EXCEL12-20261021');assert.equal(fs.readFileSync(new URL(`../assets/invoice-${name}-v12.js`,import.meta.url),'utf8'),old)}});
