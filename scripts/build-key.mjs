// Isolate R13 from the deployed R12 graph. Never rebuild the R11 baseline.
import fs from 'node:fs';
const root=new URL('../',import.meta.url),read=p=>fs.readFileSync(new URL(p,root),'utf8'),write=(p,s)=>fs.writeFileSync(new URL(p,root),s);
const relocate=s=>s.replaceAll('EXCEL12-20261021','KEY13-20261029').replaceAll('-v12.js','-v13.js');
function replaceOnce(source,before,after){if(source.split(before).length!==2)throw Error('R13 integration seam changed: '+before);return source.replace(before,after);}
let app=relocate(read('assets/index-VELLUM-EXCEL12-20261021.js'));
app=replaceOnce(app,'document.documentElement.dataset.vellumBuild="20260826-safe3"','document.documentElement.dataset.vellumBuild="key-invoice-20261029-r13"');
app=replaceOnce(app,'async pages=>{const parsed=', 'async (pages,zeroWeights)=>{if(d)return false;f(!0);m(`Rechecking reviewed fields…`);try{const parsed=');
app=replaceOnce(app,'.parseCorrectedPages(pages,t.name,recovery.sourcePages)', '.parseCorrectedPages(pages,t.name,recovery.sourcePages,zeroWeights)');
app=replaceOnce(app,'else c(URL.createObjectURL(await Ee(model)));}}),(0,V.jsxs)(`div`,{className:`upload-column`', 'else c(URL.createObjectURL(await Ee(model)));}}finally{f(!1)}}),(0,V.jsxs)(`div`,{className:`upload-column`');
// Release only row-level zero errors backed by explicit, text-bound PDF review.
app=replaceOnce(app,'let l=withoutDescriptionNotices([...s.issues,...r]);', 'const zeroLines=n.lines.filter(line=>line.zeroWeightConfirmed===true&&line.unitWeightGrams===0);s.issues=s.issues.filter(issue=>!(issue.field===`Item Weight Grams`&&issue.id===`${issue.sourceRow}-weight`&&zeroLines.some(line=>line.lineNumber+1===issue.sourceRow&&s.rows.some(row=>(row.sourceRows?.length?row.sourceRows:[row]).some(source=>source.sourceRow===issue.sourceRow&&source.itemName===line.sku&&source.commercialInvoice===String(line.invoiceNumber||n.invoiceNumber)&&source.itemWeightGrams===0)))));let l=withoutDescriptionNotices([...s.issues,...r]);');
write('assets/index-VELLUM-KEY13-20261029.js',app);
for(const name of ['pdf','ocr'])write(`assets/${name}-KEY13-20261029.js`,relocate(read(`assets/${name}-EXCEL12-20261021.js`)));
let html=relocate(read('index.html')).replace('commercial-excel-20261021-r12','key-invoice-20261029-r13');
write('index.html',html);
console.log('Built isolated R13 app; R12 and all previous graphs retained.');
