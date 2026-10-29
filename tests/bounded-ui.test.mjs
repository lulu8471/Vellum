import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createImportRun} from '../assets/invoice-runtime-v15.js';
import {createInlineExtractionElement} from '../assets/invoice-inline-v15.js';
import {buildInvoiceDownloads} from '../assets/invoice-downloads-v15.js';
const defer=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return{promise,resolve,reject}};
const pause=()=>new Promise(resolve=>setTimeout(resolve,0));
const nodes=(tree,predicate)=>{if(!tree||typeof tree!=='object')return[];return[...(predicate(tree)?[tree]:[]),...[tree.props?.children].flat(Infinity).flatMap(child=>nodes(child,predicate))]};
function app(parse,write){
 const source=fs.readFileSync(new URL('../assets/index-VELLUM-BOUNDED15-20261029.js',import.meta.url),'utf8'),start=source.indexOf('function je(){'),end=source.lastIndexOf('(0,T.createRoot)');
 const hooks=[];let cursor=0,created=0,revoked=0;
 const React={useRef(value){const index=cursor++;return hooks[index]??(hooks[index]={current:value})},useState(initial){const index=cursor++;if(!(index in hooks))hooks[index]=initial;return[hooks[index],next=>hooks[index]=typeof next==='function'?next(hooks[index]):next]},useEffect(){cursor++}};
 const context={w:React,V:{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})},ke(){},Oe(){},createInlineExtractionElement:()=>null,createInlineReviewElement:()=>null,createImportRun,xe:parse,Ee:write,buildInvoiceDownloads,URL:{createObjectURL(){created++;return'blob:synthetic'},revokeObjectURL(){revoked++}},Ae:e=>e.message,console:{error(){}},document:{querySelector:()=>null},requestAnimationFrame:()=>{},Intl,Set};
 vm.createContext(context);vm.runInContext(source.slice(start,end)+';globalThis.render=je;',context);
 return{hooks,render(){cursor=0;return context.render()},stats:()=>({created,revoked}),select(file){const input=nodes(this.render(),x=>x.type==='input'&&x.props.type==='file')[0];input.props.onChange({target:{files:[file]}})},button(label){return nodes(this.render(),x=>x.type==='button'&&JSON.stringify(x.props.children).includes(label))[0]}};
}
const model=()=>({issues:[],rows:[{commercialInvoice:'123',shipto:'99'}],sourceKind:'pdf',outputName:'test.xlsx'});
test('real app Stop and review cancels active work, leaves source and no downloadable output',async()=>{
 let started=0;const ui=app(async(_f,_p,{run})=>run.step(()=>{started++;return new Promise(()=>{})}),async()=>new Blob(['test']));ui.select({name:'test.pdf'});
 const job=ui.button('Prepare file').props.onClick();await pause();assert.equal(started,1);
 ui.button('Stop and review').props.onClick();await job;
 assert.equal(ui.hooks[6],false);assert.equal(ui.hooks[1].name,'test.pdf');assert.equal(ui.hooks[3],null);assert.equal(ui.hooks[4],'');assert.equal(ui.stats().created,0);assert.match(ui.hooks[5],/Stopped by you/);
});
test('cancel during workbook build blocks late output, then a new run can finish without stale state',async()=>{
 const first=defer();let writes=0;const ui=app(async()=>model(),async()=>++writes===1?first.promise:new Blob(['new']));ui.select({name:'test.pdf'});
 const job=ui.button('Prepare file').props.onClick();await pause();assert.equal(writes,1);ui.button('Stop and review').props.onClick();await job;first.resolve(new Blob(['late']));await pause();assert.equal(ui.stats().created,0);assert.equal(ui.hooks[3],null);
 await ui.button('Prepare file').props.onClick();assert.equal(writes,2);assert.equal(ui.stats().created,1);assert.equal(ui.hooks[4],'blob:synthetic');assert.equal(ui.hooks[3].outputName,'test.xlsx');
});
test('main run controls exist only for PDF/ZIP; ordinary spreadsheet pathway remains unchanged',async()=>{
 const ui=app(async()=>({...model(),sourceKind:'spreadsheet'}),async()=>new Blob(['ok']));ui.select({name:'test.xlsx'});const result=ui.button('Prepare file').props.onClick();assert.equal(ui.button('Stop and review'),undefined);await result;assert.equal(ui.stats().created,1);
});
// Hook renderer for the actual recovery editor.
function review(error,onApply){const hooks=[];let cursor=0;const h=(type,props,...children)=>({type,props:{...props,children}});const React={createElement:h,useId(){cursor++;return'qa'},useState(initial){const i=cursor++;if(!(i in hooks))hooks[i]=typeof initial==='function'?initial():initial;return[hooks[i],n=>hooks[i]=typeof n==='function'?n(hooks[i]):n]},useRef(initial){const i=cursor++;return hooks[i]??(hooks[i]={current:initial})},useEffect(){cursor++}};const element=createInlineExtractionElement(React,error,onApply);return{render(){cursor=0;return element.type(element.props)}}}
test('unread page confirmation starts disabled for blank text and is invalidated by edits',async()=>{
 const seen=[],ui=review({sourcePages:[''],sourceFilename:'test.pdf',recoveryState:{interrupted:true,expectedPageCount:1,unreadPages:[0]}},async(...args)=>{seen.push(args)});
 let tree=ui.render();assert.equal(tree.props.open,true);let box=nodes(tree,n=>n.type==='input')[0];assert.equal(box.props.disabled,true);
 nodes(tree,n=>n.type==='textarea')[0].props.onChange({target:{value:'Complete original page transcription'}});tree=ui.render();box=nodes(tree,n=>n.type==='input')[0];assert.equal(box.props.disabled,false);box.props.onChange({target:{checked:true}});
 tree=ui.render();await nodes(tree,n=>n.type==='form')[0].props.onSubmit({preventDefault(){}});assert.equal(seen[0][2][0].text,'Complete original page transcription');
 nodes(ui.render(),n=>n.type==='textarea')[0].props.onChange({target:{value:'Edited transcription'}});assert.equal(nodes(ui.render(),n=>n.type==='input')[0].props.checked,false);
});
test('incomplete ZIP snapshot can be read but can never submit as an entire archive',async()=>{
 let calls=0;const ui=review({sourcePages:['Read member text'],sourceFilename:'member.pdf',archiveIncomplete:true},()=>{calls++});const tree=ui.render();assert.equal(nodes(tree,n=>n.type==='textarea').length,1);assert.equal(nodes(tree,n=>n.type==='button')[0].props.disabled,true);await nodes(tree,n=>n.type==='form')[0].props.onSubmit({preventDefault(){}});assert.equal(calls,0);
});
test('Stop settles the outer import even if a post-PDF adaptation promise never resolves',async()=>{const ui=app(()=>new Promise(()=>{}),async()=>new Blob(['bad']));ui.select({name:'test.pdf'});const job=ui.button('Prepare file').props.onClick();await pause();ui.button('Stop and review').props.onClick();await job;assert.equal(ui.hooks[6],false);assert.equal(ui.hooks[3],null);assert.equal(ui.stats().created,0)});
test('synchronous cancellation snapshot reaches the editor before asynchronous cleanup completes',async()=>{const source=['completed source page',''];const ui=app(async(_f,_p,{run})=>{run.onStop(()=>{run.stopped.sourcePages=source;run.stopped.recoveryState={expectedPageCount:2,unreadPages:[1],interrupted:true}});return run.step(()=>new Promise(()=>{}))},async()=>new Blob(['bad']));ui.select({name:'test.pdf'});const job=ui.button('Prepare file').props.onClick();await pause();ui.button('Stop and review').props.onClick();await job;assert.equal(ui.hooks[8].sourcePages,source);assert.deepEqual(ui.hooks[8].recoveryState.unreadPages,[1]);assert.equal(ui.hooks[6],false)});
