// Synthetic streams only; no customer PDF, SKU or invoice data.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
function method(version) {
 const code=read(`assets/pdf-${version}-20261029.js`),start=code.indexOf('async getTextContent('),end=code.indexOf('getStructTree(){',start);
 assert.ok(start>0 && end>start,'PDF.js text method seam changed');
 return vm.runInNewContext('({'+code.slice(start,end)+'})',{_e:{textContent:x=>x.text}}).getTextContent;
}
const old=method('KEY13'),fixed=method('SAFARI14');
const chunk=(str,styles={},lang=null)=>({items:[{str}],styles,lang});
function stream(chunks,withoutIterator=true){const s=new ReadableStream({start(c){chunks.forEach(x=>c.enqueue(x));c.close();}});if(withoutIterator)Object.defineProperty(s,Symbol.asyncIterator,{value:undefined});return s;}
const page=s=>({_transport:{_htmlForXfa:false},streamTextContent:()=>s});
test('previous exact PDF.js method reproduces missing stream async-iterator failure',async()=>{
 const s=stream([chunk('TEST')]);assert.equal(s[Symbol.asyncIterator],undefined);await assert.rejects(old.call(page(s)),/async iterable/);assert.equal(s.locked,false);
});
test('patched exact method reads native stream without async iterator and releases its lock',async()=>{
 const s=stream([chunk('FIRST',{f1:{name:'A'}},'en'),chunk('SECOND',{f2:{name:'B'}},'fr')]);
 const result=await fixed.call(page(s));assert.equal(JSON.stringify(result.items.map(x=>x.str)),JSON.stringify(['FIRST','SECOND']));assert.equal(result.lang,'en');assert.equal(result.styles.f1.name,'A');assert.equal(result.styles.f2.name,'B');assert.equal(s.locked,false);assert.equal(s[Symbol.asyncIterator],undefined);
});
test('normal modern-stream result matches the original PDF.js method exactly',async()=>{
 const chunks=[chunk('FIRST',{font:{a:1}}),chunk('SECOND',{font:{a:2}},'zh')];
 const a=await old.call(page(stream(chunks,false))),b=await fixed.call(page(stream(chunks,false)));
 assert.equal(JSON.stringify(a),JSON.stringify(b));
});
test('empty text stream remains empty, permitting unchanged scan detection',async()=>{
 const s=stream([]),r=await fixed.call(page(s));assert.equal(r.items.length,0);assert.equal(r.lang,null);assert.equal(Object.keys(r.styles).length,0);assert.equal(s.locked,false);
});
test('text options are forwarded unchanged to PDF.js streaming API',async()=>{
 const opts={disableNormalization:true,includeMarkedContent:true};let seen;
 await fixed.call({_transport:{},streamTextContent:x=>{seen=x;return stream([])}},opts);assert.equal(seen,opts);
});
test('XFA branch is retained without forcing an incompatible stream path',async()=>{
 const text={items:[{str:'XFA TEST'}]};let reads=0;
 const r=await fixed.call({_transport:{_htmlForXfa:true},getXfa:async()=>({text}),streamTextContent:()=>{reads++;throw Error('Do not stream XFA')}});
 assert.equal(r,text);assert.equal(reads,0);
});
test('read failures retain original error, cancel reader and release lock once',async()=>{
 const cause=new Error('synthetic stream failure');let released=0,cancelled=0;
 const reader={read:async()=>{throw cause},cancel:async error=>{assert.equal(error,cause);cancelled++;throw Error('secondary cancel failure')},releaseLock(){released++}};
 await assert.rejects(fixed.call(page({getReader:()=>reader})),error=>error===cause);assert.equal(released,1);assert.equal(cancelled,1);
});
test('malformed text chunks do not silently omit data and release reader',async()=>{
 let released=0,cancelled=0;const reader={read:async()=>({value:{items:null,styles:{},lang:null},done:false}),cancel:async()=>{cancelled++},releaseLock(){released++}};
 await assert.rejects(fixed.call(page({getReader:()=>reader})));assert.equal(released,1);assert.equal(cancelled,1);
});
test('R14 vendor change is exactly the bounded reader patch, not a library upgrade',()=>{
 const before='for await(let e of t)n.lang??=e.lang,Object.assign(n.styles,e.styles),n.items.push(...e.items);return n';
 const after='const r=t.getReader();try{for(;;){const{value:e,done:i}=await r.read();if(i)break;n.lang??=e.lang,Object.assign(n.styles,e.styles),n.items.push(...e.items)}}catch(e){try{await r.cancel(e)}catch{}throw e}finally{r.releaseLock()}return n';
 const normalized=read('assets/pdf-SAFARI14-20261029.js').replaceAll('SAFARI14-20261029','KEY13-20261029').replace(after,before);
 assert.equal(normalized,read('assets/pdf-KEY13-20261029.js'));
});
test('Key, zero-weight, OCR and numeric algorithms stay identical to R13',()=>{
 for(const name of ['invoice-classification','invoice-inline','invoice-pdf','invoice-downloads','invoice-zip','commercial-excel','commercial-photo']){
  const normalized=read(`assets/${name}-v14.js`).replaceAll('-v14.js','-v13.js').replaceAll('SAFARI14-20261029','KEY13-20261029');
  assert.equal(normalized,read(`assets/${name}-v13.js`),name);
 }
 assert.equal(read('assets/ocr-SAFARI14-20261029.js').replaceAll('SAFARI14-20261029','KEY13-20261029'),read('assets/ocr-KEY13-20261029.js'));
});
