import {issueMessage,errorMessage} from './export92-messages.js?v=r17';
/** Independent Export92 UI state. This module never invokes the normal invoice/OCR app. */
export function mountExport92(root,{XLSX,readExport92,writeExport92,document:doc=root.ownerDocument,URL:urls=URL}) {
 const find=id=>root.querySelector('#'+id),input=find('export92-file'),clear=find('export92-clear'),error=find('export92-error'),status=find('export92-status'),results=find('export92-results'),warnings=find('export92-warnings'),download=find('export92-download');
 let source=null,model=null,url='',ticket=0,busy=false,disposed=false;
 const el=(tag,value,className)=>{const node=doc.createElement(tag);if(value!==undefined)node.textContent=String(value);if(className)node.className=className;return node};
 const release=()=>{if(url)urls.revokeObjectURL(url);url='';download.removeAttribute('href');download.removeAttribute('download');download.hidden=true};
 const showError=message=>{error.textContent=message;error.hidden=!message};
 function empty(){release();model=null;results.hidden=true;warnings.replaceChildren();showError('')}
 function select(){if(busy||disposed)return;ticket++;busy=false;empty();source=input.files?.[0]||null;clear.disabled=!source;clear.hidden=!source;input.disabled=false;status.textContent=source?source.name:'No file selected';return source?run():undefined;}
 function reset(){ticket++;busy=false;source=null;input.value='';input.disabled=false;clear.disabled=true;clear.hidden=true;empty();status.textContent='Cleared';}
 function render(current){
  const issueList=current.issues||[];
  if(issueList.length){const list=el('ul');for(const item of issueList)list.append(el('li',(item.source?item.source+': ':'')+issueMessage(item)));warnings.append(el('h3',issueList.some(item=>item.severity==='error')?'Review required':'Review notes'),list)}
  results.hidden=false;
 }
 async function run(){
  if(!source||busy||disposed)return;
  const own=++ticket,file=source;busy=true;empty();input.disabled=true;clear.disabled=true;status.textContent='Preparing file…';
  try{
   const parsed=await readExport92(file,XLSX);if(disposed||own!==ticket)return;model=parsed;render(parsed);
   if(!parsed.canExport){showError('Correct the source fields listed below, then prepare the file again. No download was created.');status.textContent='Review required';return;}
   const blob=await writeExport92(parsed,XLSX);if(disposed||own!==ticket)return;
   url=urls.createObjectURL(blob);download.href=url;download.download=parsed.outputName;download.hidden=false;status.textContent='Ready to download';
  }catch(failure){if(!disposed&&own===ticket){release();showError(errorMessage(failure));status.textContent='No download created'}}
  finally{if(!disposed&&own===ticket){busy=false;input.disabled=false;clear.disabled=!source}}
 }
 input.addEventListener('change',select);clear.addEventListener('click',reset);
 clear.disabled=true;clear.hidden=true;download.hidden=true;results.hidden=true;error.hidden=true;
 return {reset,dispose(){disposed=true;ticket++;release();input.removeEventListener('change',select);clear.removeEventListener('click',reset)},getState(){return{sourceName:source?.name||'',hasModel:!!model,busy,hasDownload:!!url}}};
}
/** Safari may restore this document from bfcache; keep its controls live, not stale. */
export function installExport92Lifecycle(app,target=window){
 const pagehide=event=>{if(event.persisted)app.reset();else app.dispose()};
 target.addEventListener('pagehide',pagehide);
 return()=>target.removeEventListener('pagehide',pagehide);
}
