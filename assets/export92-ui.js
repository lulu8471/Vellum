import {issueMessage,errorMessage} from './export92-messages.js?v=r17';
/** Independent Export92 UI state. This module never invokes the normal invoice/OCR app. */
export function mountExport92(root,{XLSX,readExport92,writeExport92,document:doc=root.ownerDocument,URL:urls=URL}) {
 const find=id=>root.querySelector('#'+id),input=find('export92-file'),clear=find('export92-clear'),error=find('export92-error'),status=find('export92-status'),results=find('export92-results'),warnings=find('export92-warnings'),download=find('export92-download'),dropzone=find('export92-dropzone'),fileInfo=find('export92-file-info'),filename=find('export92-filename'),fileSize=find('export92-filesize'),phaseLabel=find('export92-phase'),resultTitle=find('result-heading'),resultMark=find('export92-result-mark');
 let source=null,model=null,url='',ticket=0,busy=false,disposed=false;
 const el=(tag,value,className)=>{const node=doc.createElement(tag);if(value!==undefined)node.textContent=String(value);if(className)node.className=className;return node};
 const release=()=>{if(url)urls.revokeObjectURL(url);url='';download.removeAttribute('href');download.removeAttribute('download');download.hidden=true};
 const showError=message=>{error.textContent=message;error.hidden=!message};
 function empty(){release();model=null;results.hidden=true;warnings.replaceChildren();showError('')}
 function phase(name,label){if(root.dataset)root.dataset.phase=name;if(phaseLabel)phaseLabel.textContent=label;if(resultTitle)resultTitle.textContent=name==='error'?'A quick check needed.':'Ready to go.';if(resultMark)resultMark.textContent=name==='error'?'!':'✓'}
 function showFile(file){if(fileInfo)fileInfo.hidden=!file;if(filename)filename.textContent=file?.name||'';if(fileSize)fileSize.textContent=file?`${(Number(file.size||0)/1024).toFixed(1)} KB`:''}
 function accept(file){if(busy||disposed)return;ticket++;empty();source=file||null;clear.disabled=!source;clear.hidden=!source;input.disabled=false;showFile(source);status.textContent=source?'Preparing your file…':'Ready when you are.';phase('idle','Ready');return source?run():undefined;}
 function select(){return accept(input.files?.[0]||null)}
 function reset(){ticket++;busy=false;source=null;input.value='';input.disabled=false;clear.disabled=true;clear.hidden=true;empty();showFile(null);phase('idle','Ready');status.textContent='Ready when you are.';}
 const drag=event=>{event.preventDefault();if(dropzone?.dataset)dropzone.dataset.dragging=String(!busy&&!disposed)};
 const leave=()=>{if(dropzone?.dataset)dropzone.dataset.dragging='false'};
 const drop=event=>{event.preventDefault();leave();if(busy||disposed)return;const files=event.dataTransfer?.files;if(!files?.length)return;if(files.length!==1){reset();showError('Please open one file at a time. No file was processed.');phase('error','Check file');return;}input.value='';return accept(files[0]);};
 function render(current){
  const issueList=current.issues||[];
  if(issueList.length){const list=el('ul');for(const item of issueList)list.append(el('li',(item.source?item.source+': ':'')+issueMessage(item)));warnings.append(el('h3',issueList.some(item=>item.severity==='error')?'Review required':'Review notes'),list)}
  results.hidden=false;
 }
 async function run(){
  if(!source||busy||disposed)return;
  const own=++ticket,file=source;busy=true;empty();input.disabled=true;clear.disabled=true;status.textContent='Reading and checking your file…';phase('reading','Working');
  try{
   const parsed=await readExport92(file,XLSX);if(disposed||own!==ticket)return;model=parsed;render(parsed);
   if(!parsed.canExport){showError('Correct the source fields listed below, then prepare the file again. No download was created.');status.textContent='Review required';phase('error','Check file');return;}
   status.textContent='Preparing your download…';phase('writing','Working');
   const blob=await writeExport92(parsed,XLSX);if(disposed||own!==ticket)return;
   url=urls.createObjectURL(blob);download.href=url;download.download=parsed.outputName;download.hidden=false;status.textContent='All set. Your source file is unchanged.';phase('ready','Complete');
  }catch(failure){if(!disposed&&own===ticket){release();showError(errorMessage(failure));status.textContent='No download created';phase('error','Check file')}}
  finally{if(!disposed&&own===ticket){busy=false;input.disabled=false;clear.disabled=!source}}
 }
 input.addEventListener('change',select);clear.addEventListener('click',reset);
 if(dropzone){dropzone.addEventListener('dragenter',drag);dropzone.addEventListener('dragover',drag);dropzone.addEventListener('dragleave',leave);dropzone.addEventListener('drop',drop)}
 clear.disabled=true;clear.hidden=true;download.hidden=true;results.hidden=true;error.hidden=true;
 return {reset,dispose(){disposed=true;ticket++;release();input.removeEventListener('change',select);clear.removeEventListener('click',reset);if(dropzone){dropzone.removeEventListener('dragenter',drag);dropzone.removeEventListener('dragover',drag);dropzone.removeEventListener('dragleave',leave);dropzone.removeEventListener('drop',drop)}},getState(){return{sourceName:source?.name||'',hasModel:!!model,busy,hasDownload:!!url}}};
}
/** Safari may restore this document from bfcache; keep its controls live, not stale. */
export function installExport92Lifecycle(app,target=window){
 const pagehide=event=>{if(event.persisted)app.reset();else app.dispose()};
 target.addEventListener('pagehide',pagehide);
 return()=>target.removeEventListener('pagehide',pagehide);
}
