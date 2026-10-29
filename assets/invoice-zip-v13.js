/** Bounded, local PDF archive import. Nothing is extracted to the filesystem. */
export async function readPdfArchive(file, XLSX, readPdf, progress) {
  const bytes=new Uint8Array(await file.arrayBuffer());
  if(bytes.length>20_000_000)throw Error('PDF ZIP exceeds the 20 MB compressed limit. Import its PDFs separately.');
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  let expanded=0,count=0;
  for(let i=0;i+46<=bytes.length;i++)if(view.getUint32(i,true)===0x02014b50){
    const flags=view.getUint16(i+8,true),size=view.getUint32(i+24,true);
    if(flags&1)throw Error('Encrypted ZIP files are not supported.');
    expanded+=size;count++;
    if(expanded>50_000_000||count>30)throw Error('ZIP exceeds the safe expanded size or file-count limit.');
    i+=45+view.getUint16(i+28,true)+view.getUint16(i+30,true)+view.getUint16(i+32,true);
  }
  if(!count)throw Error('This is not a supported ZIP archive.');
  const archive=XLSX.CFB.read(bytes,{type:'array'});
  const files=archive.FileIndex.filter(entry=>/\.pdf$/i.test(entry.name)&&entry.content?.length).sort((a,b)=>a.name.localeCompare(b.name));
  if(!files.length||files.length>20)throw Error('Choose a ZIP containing between 1 and 20 PDF files.');
  const invoices=[],numericEvidence=[],seen=new Set();let pages=0,ocr=false;
  for(const entry of files){
    const content=new Uint8Array(entry.content);
    const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',content))).map(x=>x.toString(16).padStart(2,'0')).join('');
    if(seen.has(digest))throw Error('The ZIP contains duplicate PDF content. Remove the duplicate before importing to avoid double counting.');seen.add(digest);
    const parsed=await readPdf(new File([content],entry.name,{type:'application/pdf'}),progress);
    numericEvidence.push(...(parsed.numericEvidence||[]).map(reading=>({...reading,sourceFilename:entry.name})));
    pages+=parsed.pages;if(pages>50)throw Error('Import at most 50 PDF pages at a time.');ocr ||= parsed.extractionMode==='pdf-ocr';
    for(const invoice of parsed.invoices)invoices.push({...invoice,lines:invoice.lines.map(line=>({...line,sourceFilename:entry.name,sourceExtractionMode:parsed.extractionMode}))});
  }
  const lines=invoices.flatMap(invoice=>invoice.lines.map(line=>({...line,invoiceNumber:invoice.invoiceNumber,shipmentNumber:invoice.shipmentNumber,cartonNumber:invoice.cartonNumber,hawb:invoice.hawb,shipto:invoice.shipto,sourceLineNumber:line.lineNumber})));
  lines.forEach((line,index)=>line.lineNumber=index+1);
  const declaredTotals=invoices.reduce((sum,invoice)=>({quantity:sum.quantity+invoice.declaredTotals.quantity,value:sum.value+invoice.declaredTotals.value,weightGrams:sum.weightGrams+invoice.declaredTotals.weightGrams}),{quantity:0,value:0,weightGrams:0});
  return {...invoices[0],invoices,lines,declaredTotals,numericEvidence,sourceSheetName:'PDF archive',pages,extractionMode:ocr?'pdf-ocr':'pdf-text'};
}
