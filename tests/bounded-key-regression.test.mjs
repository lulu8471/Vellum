// Synthetic descriptions and identifiers only. No customer data or photos.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {bundle} from './bounded-harness.mjs';
import {isKeyDescription,preserveKeyCategory,inferProduct,classifyInvoiceItem} from '../assets/invoice-classification-v15.js';
import {parseCorrectedPages,zeroWeightReviewRows} from '../assets/invoice-pdf-v15.js';
import {createInlineExtractionElement} from '../assets/invoice-inline-v15.js';
const api=bundle();
const headers=['Carton ID','Commercial Invoice','Shipto','Item Name','Item Description','Product Family Group','Product Description','Shipped Qty','Unit Price','Extended Merch Line Value','Unit Freight','Extended Freight Line Value','Total Line Value','Item Weight Grams','Item COO','HTS','HAWB'];
const item=(overrides={})=>({...Object.fromEntries(headers.map((h,i)=>[h,['','100001','99','TEST-KEY','TEST DI KEY','FINE JEWELRY','Pendant',2,10.25,20.50,.37,.74,21.24,2.5,'US','71131900009',''][i]])),...overrides});
function spreadsheet(rows,format='csv') {
  const workbook=api.xlsx.utils.book_new();
  api.xlsx.utils.book_append_sheet(workbook,api.xlsx.utils.aoa_to_sheet([headers,...rows.map(row=>headers.map(h=>row[h]))]),'Synthetic');
  if(format==='csv')return new File([api.xlsx.utils.sheet_to_csv(workbook.Sheets.Synthetic)],'synthetic.csv');
  return new File([api.xlsx.write(workbook,{type:'array',bookType:format==='xls'?'biff8':'xlsx'})],`synthetic.${format}`);
}
async function output(model) {return api.xlsx.read(await(await api.write(model)).arrayBuffer(),{type:'array',cellFormula:true});}
const main=workbook=>workbook.Sheets[workbook.SheetNames[0]];
function pdfSource(description='TEST DI KEY') {
  return {sourceSheetName:'SYNTHETIC',invoiceNumber:'100001',shipmentNumber:'200001',shipto:'99',pages:1,extractionMode:'pdf-text',declaredTotals:{quantity:2,value:20.5,weightGrams:5},lines:[{lineNumber:1,sku:'TEST-KEY',description,rawDescription:description,origin:'US',hts:'71131900009',invoiceNumber:'100001',shipto:'99',quantity:2,unitCost:10.25,extendedCost:20.5,unitWeightGrams:2.5}]};
}
function commercial(description='TEST DI KEY') {
  const rows=[['Commercial Invoice:','100001'],['#','HTS','SKU','Description','Origin','Unit Weight (gm)','Quantity','Unit Cost (USD)','Extended Cost (USD)'],[1,'71131900009','TEST-KEY',description,'US',2.5,2,10.25,20.5],['','','','','Total :','',2,'',20.5]];
  const workbook=api.xlsx.utils.book_new();api.xlsx.utils.book_append_sheet(workbook,api.xlsx.utils.aoa_to_sheet(rows),'Data');
  return new File([api.xlsx.write(workbook,{type:'array',bookType:'xlsx'})],'synthetic-commercial.xlsx');
}
test('specific bounded KEY markers classify Key without photos or a SKU catalog',()=>{
  for(const description of ['TEST DI KEY','test di key','TEST DI KEY  ','Key-TEST DI','Key: TEST DI','TEST KEY PENDANT','TEST KEY-SHAPED PENDANT','TEST KEY PDT']) {
    assert.equal(isKeyDescription(description),true,description);
    assert.equal(inferProduct(description),'Key',description);
    const result=classifyInvoiceItem('SYNTHETIC-NEW',description,'Italy');
    assert.equal(result.product,'Key');assert.equal(result.description,description);assert.equal(result.coo,'IT');
  }
});
test('genuine pendants and necklaces retain existing classification; substring names are not keys',()=>{
  for(const [description,category] of [['TEST PENDANT','Pendant w/Chain'],['TEST PDT1618','Pendant w/Chain'],['TEST CLPDTI1618','Pendant w/Chain'],['MONKEY PENDANT','Pendant w/Chain'],['KEYSTONE PENDANT','Pendant w/Chain'],['TEST NECKLACE','Necklace'],['TEST NL','Necklace'],['KEY NECKLACE','Necklace'],['TEST KEY RING','Ring']]) {
    assert.equal(isKeyDescription(description),false,description);assert.equal(inferProduct(description),category,description);
  }
  for(const description of ['MONKEY','KEYSTONE','KEYBOARD','TEST KEYCHAIN','TEST KEYRING'])assert.notEqual(inferProduct(description),'Key',description);
});
test('only generic or missing categories yield to explicit key wording',()=>{
  for(const category of ['',undefined,'Jewelry','Unknown (unverified)','Pendant','Pendant w/Chain'])assert.equal(preserveKeyCategory('TEST DI KEY',category),'Key');
  for(const category of ['Necklace','Ring','Earrings','Brooch','Bangle','Bracelet','Platter'])assert.equal(preserveKeyCategory('TEST DI KEY',category),category);
  assert.equal(preserveKeyCategory('NO EXPLICIT MARKER','key'),'Key');
  assert.equal(preserveKeyCategory('TEST PENDANT','Pendant'),'Pendant');
  assert.equal(classifyInvoiceItem('SYNTHETIC','TEST DI KEY','US',{product:'Pendant'}).product,'Key');
  assert.equal(classifyInvoiceItem('SYNTHETIC','TEST DI KEY','US',{product:'Ring'}).product,'Unknown (unverified)');
});
test('CSV XLS and XLSX preserve Key in classification declaration and unchanged full-description export',async()=>{
  for(const format of ['csv','xls','xlsx']) {
    const model=await api.parse(spreadsheet([item()],format));
    assert.equal(model.rows[0].productDescription,'Key');assert.equal(model.rows[0].itemDescription,'TEST DI KEY');assert.equal(model.rows[0].declarationDescription,'(Key)');
    assert.equal(model.issues.filter(issue=>issue.severity==='error').length,0);
    const sheet=main(await output(model));
    assert.equal(sheet.F2.v,'TEST DI KEY');assert.equal(sheet.G2.v,'Key');assert.equal(sheet.H2.v,'(Key)');
    assert.equal(sheet.U2.f,'E2&CHAR(10)&F2&CHAR(10)&H2');assert.equal(sheet.U2.v,'TEST-KEY\nTEST DI KEY\n(Key)');
    assert.equal(sheet.K2.f,'I2*J2');assert.equal(sheet.K2.v,20.5);assert.equal(sheet.M2.f,'I2*L2');assert.equal(sheet.M2.v,.74);
    assert.equal(sheet.N2.f,'K2+M2');assert.equal(sheet.N2.v,21.24);assert.equal(sheet.P2.f,'I2*O2/1000');assert.equal(sheet.P2.v,.005);
    assert.equal(sheet.O2.v,2.5);assert.equal(sheet.R2.v,'7113.19.00.00-9');assert.equal(sheet.S2.v,50);assert.equal(sheet.T2.v,'PCE');
  }
});
test('existing explicit Key category survives without any description inference',async()=>{
  const model=await api.parse(spreadsheet([item({'Product Description':'Key','Item Description':'TEST MATERIAL ONLY'})]));
  assert.equal(model.rows[0].productDescription,'Key');assert.equal(main(await output(model)).G2.v,'Key');
});
test('commercial invoice recognizes Key prefix and suffix without a photo worksheet',async()=>{
  for(const description of ['TEST DI KEY','Key-TEST MATERIAL']) {
    const model=await api.parse(commercial(description));const sheet=main(await output(model));
    assert.equal(model.rows[0].productDescription,'Key');assert.equal(model.rows[0].code,50);
    assert.equal(sheet.F2.v,description);assert.equal(sheet.G2.v,'Key');assert.equal(sheet.H2.v,'(Key)');
    assert.equal(sheet.U2.f,'E2&CHAR(10)&F2');assert.equal(sheet.U2.v,`TEST-KEY\n${description}`);
    assert.equal(sheet.P2.v,.005);assert.equal(sheet.N2.v,20.5);assert.equal(sheet.O2.v,2.5);
  }
});
test('PDF conversion and workbook audit preserve Key without any image evidence',async()=>{
  const model=await api.parsePdf(new File([],'synthetic.pdf'),undefined,pdfSource());
  assert.equal(model.rows[0].productDescription,'Key');assert.equal(model.rows[0].code,50);assert.equal(model.rows[0].unit,'PCE');
  const workbook=await output(model),sheet=main(workbook);
  assert.equal(sheet.G2.v,'Key');assert.equal(sheet.H2.v,'(Key)');assert.equal(sheet.U2.v,'TEST-KEY\nTEST DI KEY\n(Key)');
  const audit=api.xlsx.utils.sheet_to_json(workbook.Sheets['PDF extraction'],{header:1});
  assert.equal(audit[1][5],'TEST DI KEY');assert.equal(audit[1][6],'TEST DI KEY');assert.equal(audit[1][7],'Key');
});
test('true Pendant and Necklace exports are not globally converted to Key',async()=>{
  for(const [description,category] of [['TEST PENDANT','Pendant w/Chain'],['TEST NL','Necklace']]) {
    const model=await api.parsePdf(new File([],'synthetic.pdf'),undefined,pdfSource(description));
    assert.equal(model.rows[0].productDescription,category);assert.equal(main(await output(model)).G2.v,category);
  }
});
test('repeat imports and duplicate-row aggregation retain Key without accumulating state',async()=>{
  for(let repeat=0;repeat<2;repeat++) {
    const model=await api.parse(spreadsheet([item(),item()]));
    assert.equal(model.rows.length,1);assert.equal(model.rows[0].shippedQty,4);assert.equal(model.rows[0].productDescription,'Key');
    assert.equal(model.rows[0].sourceRows.length,2);assert.equal(model.totals.quantity,4);
    const workbook=await output(model),sheet=main(workbook);assert.equal(sheet.G2.v,'Key');assert.equal(sheet.I2.v,4);assert.equal(sheet.P2.v,.01);
    assert.equal(sheet.K2.v,41);assert.equal(sheet.N2.v,42.48);assert.equal(api.xlsx.utils.sheet_to_json(workbook.Sheets['Source rows'],{header:1}).length,3);
  }
});
test('category correction never releases invalid quantity or ordinary zero-weight errors',async()=>{
  for(const changes of [{'Item Weight Grams':0},{'Shipped Qty':0}]) {
    const model=await api.parse(spreadsheet([item(changes)]));assert.equal(model.rows[0].productDescription,'Key');
    assert.ok(model.issues.some(issue=>issue.severity==='error'));await assert.rejects(api.write(model),/Resolve/);
  }
});
function zeroPages() {
  return ['Commercial Invoice: 100001\nSterling Shipment # 200001234\nShip To\n99 - Test Depot\n# HTS SKU Description\n1 7113.19.0000 11111111 TEST DI KEY US 0.00 gm 1 $10.00 $10.00\n2 7113.19.0000 22222222 TEST PENDANT US 2.50 gm 1 $20.00 $20.00\nTotal # of Pieces 2\nProduct Total Value USD $30.00\nTotal Weight 2.50 gm\nGrand Total Value USD $30.00'];
}
test('explicit per-row zero-weight review retains zero and writes an audit, not a fabricated weight',async()=>{
  const pages=zeroPages(),filename='synthetic.pdf';
  assert.throws(()=>parseCorrectedPages(pages,filename),/zero|0\.00|weight/i);
  const candidates=zeroWeightReviewRows(pages,filename);assert.equal(candidates.length,1);
  const parsed=parseCorrectedPages(pages,filename,pages,candidates);
  const model=await api.parsePdf(new File([],filename),undefined,parsed);assert.equal(model.issues.filter(issue=>issue.severity==='error').length,0);
  assert.equal(model.rows[0].itemWeightGrams,0);assert.equal(model.rows[0].extendedWeightKg,0);
  const workbook=await output(model),sheet=main(workbook);assert.equal(sheet.O2.v,0);assert.equal(sheet.P2.v,0);assert.equal(sheet.P2.f,'I2*O2/1000');
  assert.ok(workbook.SheetNames.includes('Zero weight review'));
  const audit=api.xlsx.utils.sheet_to_json(workbook.Sheets['Zero weight review'],{header:1});assert.equal(audit.length,2);assert.equal(audit[1][4],0);assert.match(audit[1][5],/confirmed/i);
});
test('zero-weight review is bound to exact source text and is not reused after an edit',()=>{
  const pages=zeroPages(),candidates=zeroWeightReviewRows(pages,'synthetic.pdf');
  assert.throws(()=>parseCorrectedPages([pages[0].replace('TEST DI KEY','CHANGED KEY')],'synthetic.pdf',pages,candidates),/zero|0\.00|weight/i);
  assert.throws(()=>parseCorrectedPages(pages,'different.pdf',pages,candidates),/zero|0\.00|weight/i);
});
test('zero-weight review cannot release a different row with zero weight',async()=>{
  const pages=zeroPages(),filename='synthetic.pdf',parsed=parseCorrectedPages(pages,filename,pages,zeroWeightReviewRows(pages,filename));
  parsed.lines[1].unitWeightGrams=0;parsed.declaredTotals.weightGrams=0;
  const model=await api.parsePdf(new File([],filename),undefined,parsed);
  assert.ok(model.issues.some(issue=>issue.severity==='error'&&issue.field==='Item Weight Grams'&&issue.sourceRow===3));
  await assert.rejects(api.write(model),/Resolve/);
});
test('R15 entry and helpers share the isolated R15 graph',()=>{
  const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
  assert.match(read('index.html'),/index-PEBBLE17-20261030\.js/);
  const imports=JSON.parse(read('index.html').match(/<script type="importmap">([^<]+)<\/script>/)[1]).imports;
  assert.equal(imports['./assets/index-VELLUM-BOUNDED15-20261029.js'],'./assets/index-PEBBLE17-20261030.js');
  const app=read('assets/index-VELLUM-BOUNDED15-20261029.js');
  for(const name of ['classification','inline','downloads','pdf','zip'])assert.ok(app.includes(`invoice-${name}-v15.js`));
  assert.ok(app.includes('commercial-excel-v15.js'));
  const graph=['index-VELLUM-BOUNDED15-20261029.js',...['classification','inline','downloads','pdf','zip'].map(name=>`invoice-${name}-v15.js`),'commercial-excel-v15.js','commercial-photo-v15.js','pdf-BOUNDED15-20261029.js','ocr-BOUNDED15-20261029.js'];
  for(const filename of graph) {
    const code=read('assets/'+filename);
    assert.ok(!/(?:invoice|commercial)-[a-z-]+-v(?:[0-9]|1[0-2])\.js|EXCEL12-20261021|PDF(?:[0-9]|1[01])-20261020/.test(code),filename+' imports an old graph');
    const appRefs=[...code.matchAll(/index-VELLUM-[A-Z0-9-]+\.js/g)].map(match=>match[0]);
    assert.ok(appRefs.every(name=>name==='index-VELLUM-BOUNDED15-20261029.js'),filename+' refers to a different app root');
  }
  for(const name of ['pdf','ocr']) {
    assert.ok(read(`assets/${name}-BOUNDED15-20261029.js`).includes('index-VELLUM-BOUNDED15-20261029.js'));
    assert.ok(read('assets/invoice-pdf-v15.js').includes(`${name}-BOUNDED15-20261029.js`));
  }
  assert.ok(!app.includes('-v12.js'));assert.ok(!app.includes('EXCEL12-20261021'));
});

// Small deterministic hook renderer: it executes the real component and event
// handlers without a browser, network, React replacement package, or DOM shim.
function reviewComponent(error,onApply) {
  const hooks=[],effects=[];let cursor=0;
  const React={
    createElement:(type,props,...children)=>({type,props:props||{},children:children.flat()}),
    useId:()=>{const index=cursor++;return hooks[index]??(hooks[index]='test-review-'+index);},
    useState:initial=>{const index=cursor++;if(!(index in hooks))hooks[index]=typeof initial==='function'?initial():initial;return [hooks[index],value=>{hooks[index]=typeof value==='function'?value(hooks[index]):value;}];},
    useRef:initial=>{const index=cursor++;return hooks[index]??(hooks[index]={current:initial});},
    useEffect:effect=>{const index=cursor++;if(!(index in hooks)){hooks[index]=true;effects.push(effect());}}
  };
  const element=createInlineExtractionElement(React,error,onApply);
  return {render(){cursor=0;return element.type(element.props);},unmount(){for(const cleanup of effects)cleanup?.();},hooks,element};
}
function elements(tree,predicate) {
  if(!tree||typeof tree!=='object')return [];
  return [...(predicate(tree)?[tree]:[]),...(tree.children||[]).flatMap(child=>elements(child,predicate))];
}
const byType=(tree,type)=>elements(tree,node=>node.type===type);
const checkboxes=tree=>elements(tree,node=>node.type==='input'&&node.props.type==='checkbox');
const submit=tree=>byType(tree,'form')[0].props.onSubmit({preventDefault(){}});
test('zero review UI starts unchecked per row, submits only selected exact-source candidate and resets after editing',async()=>{
  const sourcePages=[zeroPages()[0].replace('US 2.50 gm','US 0.00 gm').replace('Total Weight 2.50 gm','Total Weight 0.00 gm')];
  const error={sourcePages,sourceFilename:'synthetic-zero.pdf'},calls=[];
  const component=reviewComponent(error,async(...args)=>{calls.push(args);return true;});
  let tree=component.render();assert.equal(tree.type,'details');
  assert.equal(checkboxes(tree).length,2);assert.ok(checkboxes(tree).every(node=>node.props.checked===false));
  assert.equal(byType(tree,'fieldset')[0].props.disabled,false);
  checkboxes(tree)[1].props.onChange({target:{checked:true}});tree=component.render();
  assert.deepEqual(checkboxes(tree).map(node=>node.props.checked),[false,true]);
  await submit(tree);tree=component.render();
  assert.equal(calls.length,1);assert.deepEqual(calls[0][0],sourcePages);assert.notEqual(calls[0][0],sourcePages);
  assert.equal(calls[0][1].length,1);assert.equal(calls[0][1][0].sku,'22222222');
  assert.equal(calls[0][1][0].sourceText,JSON.stringify(['synthetic-zero.pdf',sourcePages]));
  assert.equal(elements(tree,node=>node.props.role==='status').length,1);
  const changed=sourcePages[0].replace('TEST DI KEY','TEST CHANGED KEY');
  byType(tree,'textarea')[0].props.onChange({target:{value:changed}});tree=component.render();
  assert.ok(checkboxes(tree).every(node=>node.props.checked===false));
  assert.equal(elements(tree,node=>node.props.role==='status').length,0);
  await submit(tree);assert.equal(calls[1][1].length,0);assert.equal(calls[1][0][0],changed);
  assert.equal(sourcePages[0],error.sourcePages[0]);assert.ok(!sourcePages[0].includes('CHANGED'));
});
test('zero review UI blocks repeated submits while busy and recovers after a failed recheck',async()=>{
  let resolvePending,calls=0;
  const component=reviewComponent({sourcePages:zeroPages(),sourceFilename:'synthetic.pdf'},()=>{calls++;return new Promise(resolve=>{resolvePending=resolve;});});
  let tree=component.render();checkboxes(tree)[0].props.onChange({target:{checked:true}});tree=component.render();
  const first=submit(tree);await submit(tree);assert.equal(calls,1);
  tree=component.render();assert.equal(byType(tree,'fieldset')[0].props.disabled,true);assert.equal(byType(tree,'fieldset')[0].props['aria-busy'],true);
  assert.equal(byType(tree,'button')[0].children[0],'Rechecking fields…');
  resolvePending(false);await first;tree=component.render();
  assert.equal(byType(tree,'fieldset')[0].props.disabled,false);
  assert.match(elements(tree,node=>node.props.role==='alert')[0].children[0],/still need attention/);
  const retry=submit(tree);assert.equal(calls,2);resolvePending(true);await retry;
  tree=component.render();assert.equal(elements(tree,node=>node.props.role==='alert').length,0);assert.equal(elements(tree,node=>node.props.role==='status').length,1);
});
test('zero review UI displays precise errors, clearing feedback on checkbox changes and rejecting blank pages',async()=>{
  let calls=0;
  const component=reviewComponent({sourcePages:zeroPages(),sourceFilename:'synthetic.pdf'},async()=>{calls++;throw Error('Synthetic row 2 does not reconcile.');});
  let tree=component.render();await submit(tree);tree=component.render();
  assert.equal(elements(tree,node=>node.props.role==='alert')[0].children[0],'Synthetic row 2 does not reconcile.');
  checkboxes(tree)[0].props.onChange({target:{checked:true}});tree=component.render();
  assert.equal(elements(tree,node=>node.props.role==='alert').length,0);
  byType(tree,'textarea')[0].props.onChange({target:{value:'   '}});tree=component.render();
  assert.equal(checkboxes(tree).length,0);await submit(tree);tree=component.render();
  assert.equal(calls,1);assert.match(elements(tree,node=>node.props.role==='alert')[0].children[0],/Enter the invoice text/);
});
test('zero review UI uses a new filename-bound identity on a replacement source and ignores late unmounted completion',async()=>{
  let resolvePending;
  const first=reviewComponent({sourcePages:zeroPages(),sourceFilename:'first.pdf'},()=>new Promise(resolve=>{resolvePending=resolve;}));
  let tree=first.render();checkboxes(tree)[0].props.onChange({target:{checked:true}});tree=first.render();
  const pending=submit(tree);first.unmount();const stateBefore=first.hooks.slice(0,5);resolvePending(true);await pending;
  // busyRef unlocks, but unmounted components must not receive feedback/state updates.
  assert.deepEqual(first.hooks.slice(0,5),stateBefore);
  const calls=[],second=reviewComponent({sourcePages:zeroPages(),sourceFilename:'second.pdf'},async(...args)=>calls.push(args));
  tree=second.render();assert.equal(checkboxes(tree)[0].props.checked,false);
  checkboxes(tree)[0].props.onChange({target:{checked:true}});tree=second.render();await submit(tree);
  assert.equal(calls[0][1][0].sourceText,JSON.stringify(['second.pdf',zeroPages()]));
  assert.ok(!calls[0][1][0].sourceText.includes('first.pdf'));
});
