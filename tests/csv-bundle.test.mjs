// Synthetic CSV integration tests invoke the deployed bundle's spreadsheet parser
// and workbook writer. Browser mounting is removed solely for Node test execution.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
function bundle() {
 let code=fs.readFileSync(new URL('../assets/index-VELLUM-PDF3-20261020.js',import.meta.url),'utf8');
 code=code.replace(/^(?:import[^\n]+\n)+/,'').replace(/^document.documentElement.dataset.vellumBuild=[^;]+;/,'');
 code=code.replace(/\(function\(\)\{let e=document\.createElement\(`link`\)[\s\S]*?\}\)\(\);var p=/,'var p=');
 const mount=code.lastIndexOf('(0,T.createRoot)');assert.ok(mount>0,'Bundle bootstrap seam changed; review test adapter');
 code=code.slice(0,mount)+';globalThis.api={parse:_e,write:Ee,xlsx:E.default};';
 const context={console,Uint8Array,ArrayBuffer,TextEncoder,TextDecoder,File,Blob,URL,setTimeout,clearTimeout,fetch:async()=>new Response(fs.readFileSync(new URL('../templates/invoice-standard.xlsx',import.meta.url)))};
 vm.createContext(context);vm.runInContext(code,context);return context.api;
}
const api=bundle();
const header=['Carton ID','Commercial Invoice','Shipto','Item Name','Item Description','Product Family Group','Product Description','Shipped Qty','Unit Price','Extended Merch Line Value','Unit Freight','Extended Freight Line Value','Total Line Value','Item Weight Grams','Item COO','HTS','HAWB'];
const row=(overrides={})=>({...Object.fromEntries(header.map((h,i)=>[h,['1234567890','123456','99','12345678','TEST RING','FINE JEWELRY','Ring','1.000','100.0000','100.00','1.0000','1.00','101.00','2.50','US','7113.19.00009','1234567'][i]])),...overrides});
const input=rows=>new File(['Report,,,,,,Example\n,,,,,Synthetic detail report\n'+header.join(',')+'\n'+rows.map(r=>header.map(h=>r[h]??'').join(',')).join('\n')],'synthetic.csv');
test('CSV preamble header detection and full numeric parsing use real bundle',async()=>{const m=await api.parse(input([row()]));assert.equal(m.headerRow,3);assert.equal(m.rows.length,1);assert.equal(m.totals.totalValue,101);assert.equal(m.rows[0].extendedWeightKg,.0025);assert.equal(m.issues.length,0)});
test('blank carton and HAWB retain real item with warnings and no invented ID',async()=>{const m=await api.parse(input([row({'Carton ID':'','HAWB':''}),row({'Item Name':'87654321'})]));assert.equal(m.rows.length,2);assert.equal(m.totals.quantity,2);assert.equal(m.rows[0].cartonId,'');assert.equal(m.rows[0].documentNumber,'Unassigned');assert.equal(m.outputName,'Multiple shipments INV.xlsx');assert.ok(m.issues.some(x=>x.field==='Carton ID'&&x.severity==='warning'));assert.ok(m.issues.some(x=>x.field==='HAWB'&&x.severity==='warning'))});
test('missing SKU is retained and explicitly blocked instead of silently discarded',async()=>{const m=await api.parse(input([row({'Item Name':''})]));assert.equal(m.rows.length,1);assert.ok(m.issues.some(x=>x.field==='Item Name'&&x.severity==='error'))});
test('missing invoice is retained and explicitly blocked',async()=>{const m=await api.parse(input([row({'Commercial Invoice':''})]));assert.equal(m.rows.length,1);assert.ok(m.issues.some(x=>x.field==='Commercial Invoice'&&x.severity==='error'))});
test('CSV output preserves blank carton, values and all calculated Excel formulas',async()=>{const m=await api.parse(input([row({'Carton ID':'','HAWB':''}),row({'Item Name':'87654321'})]));const book=api.xlsx.read(await(await api.write(m)).arrayBuffer(),{type:'array',cellFormula:true});const s=book.Sheets[book.SheetNames[0]];assert.equal(s.A2?.v??'','');assert.equal(s.K2.f,'I2*J2');assert.equal(s.M2.f,'I2*L2');assert.equal(s.N2.f,'K2+M2');assert.equal(s.P2.f,'I2*O2/1000');assert.equal(s.U2.f,'E2&CHAR(10)&F2&CHAR(10)&H2');assert.equal(s.N4.f,'SUBTOTAL(109,N2:N3)');assert.equal(s.N4.v,202);assert.equal(s.I4.v,2)});
