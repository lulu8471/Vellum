// UI-only derivative. Keep the R15 data/validation modules and original bundle untouched.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root=new URL('../',import.meta.url),read=p=>fs.readFileSync(new URL(p,root),'utf8');
const original=read('assets/index-VELLUM-BOUNDED15-20261029.js');
const hash=s=>createHash('sha1').update('blob '+Buffer.byteLength(s)+'\0').update(s).digest('hex');
if(hash(original)!=='06b2ad31cc4afeea3751daf657811a3f8fcc6ba5')throw Error('R15 baseline changed; review the UI patch.');
let s=original;
function once(a,b){if(s.split(a).length!==2)throw Error('UI seam changed: '+a.slice(0,80));s=s.replace(a,b)}
once('activeImport=(0,w.useRef)(null);','activeImport=(0,w.useRef)(null),uiBusy=(0,w.useRef)(false);');
once('let h=e=>{if(e&&!d)', 'let h=e=>{if(e&&!d&&!uiBusy.current)');
once('dataset.vellumBuild="bounded-ocr-20261029-r15"','dataset.vellumBuild="pebble-ui-20261030-r17"');
// Pass the selected File directly: React state commits asynchronously.
once('setRecovery(null)}},g=async()=>{if(t&&!d)', 'setRecovery(null);return g(e)}},g=async(source=t)=>{if(source&&!d&&!uiBusy.current)');
const start=s.indexOf('g=async(source=t)'),end=s.indexOf('},_=()=>',start);
let handler=s.slice(start,end).replace('if(source&&!d&&!uiBusy.current){f(!0)','if(source&&!d&&!uiBusy.current){uiBusy.current=true;f(!0)').replace('f(!1)}}','uiBusy.current=false;f(!1)}}').replaceAll('t.name','source.name').replace('xe(t,','xe(source,');s=s.slice(0,start)+handler+s.slice(end);
// Rename rendered controls only. Workbook metadata and source descriptions are untouched.
for(const[a,b]of [
 ['children:`Prepare files`','children:`Pebble`'],
 ['children:`Processed locally in your browser`','children:`Local processing`'],
 ['children:`Drop your file here`','children:`Open`'],
 ['children:`Choose another file`','children:`Open`'],
 ['children:`or click to browse · XLSX, XLS, CSV, PDF or PDF ZIP`','children:`XLSX · XLS · CSV · PDF · ZIP`'],
 ['children:`Stop and review`','children:`Stop`'],
 ['children:`Start a new run`','children:`Reset`'],
 ['children:`Download Excel`','children:`Save`'],
 ['children:`Download ${item.name}`','children:`Save ${item.name}`'],
 ['children:`Download unavailable`','children:`Save unavailable`'],
 ['`Your Excel file is ready in the required format.`','`Ready to save.`'],
 ['children:`Vellum`','children:`Pebble`'],
 ['children:`© 2026 Vellum Systems Ltd. All rights reserved.`','children:`Files stay on this device.`'],
 ['children:`88 Meridian Avenue, Taipei 110, Taiwan`','children:``']
])once(a,b);
// Progress remains visible, but there is no extra Run button or preview step.
once('(0,V.jsxs)(`button`,{className:`run-button`,disabled:!t||d,onClick:g,type:`button`,children:[(0,V.jsx)(`span`,{children:d?p:t?`Prepare file`:`Select a source file`}),(0,V.jsx)(Oe,{name:`arrow`,size:18})]})','(0,V.jsx)(`div`,{className:`run-button`,role:`status`,hidden:!d,children:p})');
// An always-accessible reset for a selected idle file, including validation failures.
once('children:`Your source file stays on this device while it is prepared.`})]})]}),','children:`Your source file stays on this device while it is prepared.`})]}),t&&!d&&!a&&(0,V.jsx)(`button`,{className:`text-button`,type:`button`,onClick:_,children:`Reset`})]}),');
once('onChange:e=>h(e.target.files?.[0]),tabIndex:-1','onChange:e=>h(e.target.files?.[0]),\"aria-label\":`Open`,tabIndex:-1');
// Do not permit the file chooser while the current read is in flight.
once('onClick:()=>e.current?.click(),onDragEnter:', 'onClick:()=>!d&&e.current?.click(),disabled:d,"aria-label":`Open`,onDragEnter:');
fs.writeFileSync(new URL('assets/index-PEBBLE17-20261030.js',root),s);
execFileSync(process.execPath,['--check',new URL('assets/index-PEBBLE17-20261030.js',root).pathname]);
console.log('Pebble UI derivative built; R15 parser, writer and runtime modules preserved.');
