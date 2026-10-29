// R14: isolate the R13 graph and repair only PDF.js text-stream consumption.
// Safari may lack ReadableStream[Symbol.asyncIterator] despite supporting readers.
// Keep the XFA branch, text chunk order, styles/language and all invoice logic.
import fs from 'node:fs';
const root=new URL('../',import.meta.url),read=p=>fs.readFileSync(new URL(p,root),'utf8'),write=(p,s)=>fs.writeFileSync(new URL(p,root),s);
const relocate=s=>s.replaceAll('KEY13-20261029','SAFARI14-20261029').replaceAll('-v13.js','-v14.js');
const before='for await(let e of t)n.lang??=e.lang,Object.assign(n.styles,e.styles),n.items.push(...e.items);return n';
const after='const r=t.getReader();try{for(;;){const{value:e,done:i}=await r.read();if(i)break;n.lang??=e.lang,Object.assign(n.styles,e.styles),n.items.push(...e.items)}}catch(e){try{await r.cancel(e)}catch{}throw e}finally{r.releaseLock()}return n';
let pdf=relocate(read('assets/pdf-KEY13-20261029.js'));
if(pdf.split(before).length!==2)throw Error('PDF text-stream seam changed; inspect upstream before rebuilding');
write('assets/pdf-SAFARI14-20261029.js',pdf.replace(before,after));
for(const name of ['classification','inline','pdf','downloads','zip'])write(`assets/invoice-${name}-v14.js`,relocate(read(`assets/invoice-${name}-v13.js`)));
for(const name of ['excel','photo'])write(`assets/commercial-${name}-v14.js`,relocate(read(`assets/commercial-${name}-v13.js`)));
write('assets/ocr-SAFARI14-20261029.js',relocate(read('assets/ocr-KEY13-20261029.js')));
write('assets/index-VELLUM-SAFARI14-20261029.js',relocate(read('assets/index-VELLUM-KEY13-20261029.js')).replace('key-invoice-20261029-r13','safari-stream-20261029-r14'));
write('index.html',relocate(read('index.html')).replace('key-invoice-20261029-r13','safari-stream-20261029-r14'));
console.log('Built isolated R14. Only functional change: PDF text-stream reader compatibility.');
