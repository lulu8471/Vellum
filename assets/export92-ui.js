/** Independent Export92 UI state. This module never invokes the normal invoice/OCR app. */
export function mountExport92(root,{XLSX,readExport92,writeExport92,document:doc=root.ownerDocument,URL:urls=URL}) {
 const find=id=>root.querySelector('#'+id),input=find('export92-file'),prepare=find('export92-prepare'),clear=find('export92-clear'),error=find('export92-error'),status=find('export92-status'),results=find('export92-results'),summary=find('export92-summary'),warnings=find('export92-warnings'),preview=find('export92-preview'),originInfo=find('export92-origin-info'),download=find('export92-download');
 let source=null,model=null,url='',ticket=0,busy=false,disposed=false;
 const el=(tag,value,className)=>{const node=doc.createElement(tag);if(value!==undefined)node.textContent=String(value);if(className)node.className=className;return node};
 const release=()=>{if(url)urls.revokeObjectURL(url);url='';download.removeAttribute('href');download.removeAttribute('download');download.hidden=true};
 const showError=message=>{error.textContent=message;error.hidden=!message};
 function empty(){release();model=null;results.hidden=true;summary.replaceChildren();warnings.replaceChildren();preview.replaceChildren();originInfo.replaceChildren();showError('')}
 function select(){ticket++;busy=false;empty();source=input.files?.[0]||null;prepare.disabled=!source;clear.disabled=!source;input.disabled=false;status.textContent=source?source.name+' · 只讀取本次 Excel 的 current Invoice':'尚未選取檔案';}
 function reset(){ticket++;busy=false;source=null;input.value='';input.disabled=false;prepare.disabled=true;clear.disabled=true;empty();status.textContent='已清除本次來源與結果';}
 function render(current){
  summary.append(el('strong',`${current.rows.length} 個品項`),el('span',`來源工作表：${current.sourceSheet}`),el('span',`來源數量合計：${current.totals.quantity}`),el('span',`明細金額合計 USD：${Number(current.totals.detailAmount).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:6})}`));
  const issueList=current.issues||[];
  if(issueList.length){const list=el('ul');for(const item of issueList)list.append(el('li',(item.source?item.source+'：':'')+item.message));warnings.append(el('h3','來源核對提醒'),list)}
  const differences=current.rows.filter(row=>row.originMismatch);
  originInfo.append(el('p',differences.length?`${differences.length} 個產地格來源不同，僅將「生產國別」格標淡黃；值仍保留 Invoice。`:'未找到可確認的產地差異。缺少 Packing List 或無法唯一配對，不當作差異標色。'));
  const comparison=el('details'),comparisonSummary=el('summary','查看產地比對與來源位置');comparison.append(comparisonSummary);const comparisonList=el('ul');
  for(const row of current.rows){const c=row.originComparison||{};comparisonList.append(el('li',`項次 ${row.item} · SKU ${row.sku}：Invoice ${JSON.stringify(c.invoiceValue??row.origin)} (${c.invoiceCell||''})；Packing ${JSON.stringify(c.packingValue??'')} (${c.packingCell||'未提供／未配對'})。${c.message||c.status||''}`))}
  comparison.append(comparisonList);originInfo.append(comparison);
  const table=el('table'),caption=el('caption','17 欄報單整理預覽（可橫向捲動）'),head=el('thead'),headerRow=el('tr'),body=el('tbody');
  for(const name of current.headers)headerRow.append(el('th',name));head.append(headerRow);
  for(const row of current.rows){const tr=el('tr');row.mainRow.forEach((value,index)=>{const td=el('td',value??'');if(index===8)td.className='exact-description';if(index===5&&row.originMismatch){td.className='origin-different';td.title=`Invoice: ${row.originComparison.invoiceValue}; Packing: ${row.originComparison.packingValue}`;}tr.append(td)});body.append(tr)}
  table.append(caption,head,body);preview.append(table);results.hidden=false;
 }
 async function run(){
  if(!source||busy||disposed)return;
  const own=++ticket,file=source;busy=true;empty();input.disabled=true;prepare.disabled=true;clear.disabled=true;status.textContent='正在本機讀取 Excel 並逐列整理…';
  try{
   const parsed=await readExport92(file,XLSX);if(disposed||own!==ticket)return;model=parsed;render(parsed);
   if(!parsed.canExport){showError('必要來源欄位尚未能安全整理；請依核對提醒修正來源 Excel。未建立下載。');status.textContent='需要核對來源';return;}
   const blob=await writeExport92(parsed,XLSX);if(disposed||own!==ticket)return;
   url=urls.createObjectURL(blob);download.href=url;download.download=parsed.outputName;download.hidden=false;status.textContent='整理完成 · 來源檔未修改';
  }catch(failure){if(!disposed&&own===ticket){release();showError(failure instanceof Error?failure.message:'無法讀取這份 Export Excel。');status.textContent='未建立下載，請核對來源檔'}}
  finally{if(!disposed&&own===ticket){busy=false;input.disabled=false;prepare.disabled=!source;clear.disabled=!source}}
 }
 input.addEventListener('change',select);prepare.addEventListener('click',run);clear.addEventListener('click',reset);
 prepare.disabled=true;clear.disabled=true;download.hidden=true;results.hidden=true;error.hidden=true;
 return {reset,dispose(){disposed=true;ticket++;release();input.removeEventListener('change',select);prepare.removeEventListener('click',run);clear.removeEventListener('click',reset)},getState(){return{sourceName:source?.name||'',hasModel:!!model,busy,hasDownload:!!url}}};
}
/** Safari may restore this document from bfcache; keep its controls live, not stale. */
export function installExport92Lifecycle(app,target=window){
 const pagehide=event=>{if(event.persisted)app.reset();else app.dispose()};
 target.addEventListener('pagehide',pagehide);
 return()=>target.removeEventListener('pagehide',pagehide);
}
