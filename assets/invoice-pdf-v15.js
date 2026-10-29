import {createImportRun, onceAsync} from './invoice-runtime-v15.js';
/** Browser-local COMPASS import. No document data leaves this device. */
const clean = value => String(value).replace(/[\u2012-\u2015]/g, '-').replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').trim();
const rounded = n => Math.round((n + Number.EPSILON) * 100) / 100;

// Accept OCR's grouping-dot substitution only when the entire number is valid.
// Never strip arbitrary punctuation or guess missing cents/digits.
export function decimal(value) {
  const s = clean(value);
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+|\d{1,3}(?:\.\d{3})+)\.\d{2}$/.test(s)) return NaN;
  const at = s.lastIndexOf('.');
  return Number(s.slice(0, at).replace(/[,.]/g, '') + s.slice(at));
}
const money = '[\\d,.]+\\.\\d{2}';
// OCR may add separator punctuation around printed identifiers. Do not change
// digits or letters inside identifiers, quantities, weights or amounts.
const separators = '(?:[=+~\\-]\\s*)*';
const rowPattern = new RegExp('^(\\d{1,4})[.,:;)]*\\s+' + separators + '(\\d{4}[.\\d]{6,14})\\s+' + separators + '(\\d{8})[.,:;)]*\\s+(.+?)\\s+(USA?|ITALY|IT|GERMANY|DE|FRANCE|FR)\\s+([\\d,.]+)\\s*(?:GM|G[MNM]|AM|EM|CM)\\s+(\\d{1,4}(?:\\.0{1,3})?)\\s+[$§]\\s*(' + money + ')\\s+[$§]\\s*(' + money + ')\\s*$', 'i');
// A malformed row still terminates the previous description. Otherwise its
// wrapped suffix can be attached to a different SKU while the row is missing.
const candidateRowPattern = new RegExp('^(?:\\d{1,4}|[Ilt|])[.,:;)]*\\s+' + separators + '[\\dA-Za-z]{4}[.\\dA-Za-z]{6,14}[_.,:;)]*\\s+' + separators + '\\d{7,10}\\b', 'i');
const isCandidateRow = line => candidateRowPattern.test(clean(line));
export function parseLine(text) {
  const m = clean(text).match(rowPattern);
  if (!m) return null;
  const weight = /^\d+(?:\.\d{1,3})?$/.test(m[6]) ? Number(m[6]) : NaN;
  return { lineNumber: Number(m[1]), hts: m[2], sku: m[3], description: clean(m[4]), origin: m[5], unitWeightGrams: weight, quantity: Number(m[7]), unitCost: decimal(m[8]), extendedCost: decimal(m[9]) };
}
const continuation = line => line.length <= 70 && /^[A-Z0-9./&()' -]+$/i.test(line) && !/^(?:Commercial|Page|Total|Grand|Product|Value|I declare|HTS|Weight|Sold|Ship|Invoice|Print|Processor|Unit|Origin|Description)\b/i.test(line) && !/\$|\bgm\b|^\d+\s+\d{4}[.\d]+\s+\d{8}\b/i.test(line);
export function parseInvoice(text, filename = '') {
  const lines = [], errors = [];
  let current = null, inTable = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = clean(raw);
    if (/\bHTS\b.*\bSKU\b/i.test(line)) { inTable = true; current = null; continue; }
    if (/^(?:Total\s*#?\s*of\s*Pieces|Commercial Invoice|Page\s+\d)/i.test(line)) { inTable = false; current = null; }
    const row = parseLine(line);
    if (row) { lines.push(row); current = row; inTable = true; continue; }
    if (inTable && current && /^(?:Freight\s*\/\s*Insurance|SUB\s*TOTAL)\b/i.test(line)) {
      const amounts = [...line.matchAll(new RegExp('[$§]\\s*(' + money + ')(?![\\d,.])', 'g'))].map(match => decimal(match[1]));
      if (amounts.length !== 2 || !amounts.every(Number.isFinite)) errors.push('A freight or subtotal row could not be read completely.');
      else if (/^Freight/i.test(line)) { current.unitFreight = amounts[0]; current.extendedFreight = amounts[1]; }
      else current.totalCost = amounts[1];
      continue;
    }
    if (isCandidateRow(line)) {
      errors.push(`Invoice line ${line.match(/^\d{1,4}/)?.[0] || '?'} could not be read completely; compare its SKU, weight, quantity and amounts with the source.`); current = null;
    } else if (inTable && current && line && continuation(line)) current.description = clean(current.description + ' ' + line);
  }
  const name = filename.replace(/\s*\(\d+\)(?=\.pdf$)/i, '');
  const fromName = name.match(/COMPASS-(\d{5,})-\d+-(\d+)(?:-ex)?(?:_repaired)?\.pdf$/i);
  const invoice = text.match(/Commercial\s+Invoice\s*[:#]\s*(\d{5,})/i)?.[1];
  let shipto = '';
  const shipLine = text.match(/Ship\s*To[^\n]*\n([^\n]+)/i)?.[1];
  if (shipLine) shipto = [...shipLine.matchAll(/\b(\d{1,4})\s*-/g)].at(-1)?.[1] || '';
  if (invoice && fromName && invoice !== fromName[1]) errors.push('Invoice number disagrees with the filename.');
  if (shipto && fromName && Number(shipto) !== Number(fromName[2])) errors.push('Ship To disagrees with the filename.');
  const amountAfter = label => text.match(new RegExp(label + '\\s+(?:U?US[DPB]\\s*)?[$§]+\\s*(' + money + ')(?![\\d,.])', 'i'))?.[1];
  const merchandise = amountAfter('Product\\s+Tota[l!]\\s+Value');
  const freight = amountAfter('Freight\\s*/\\s*Insurance\\s*Tota[l!]\\s+Value');
  const grand = amountAfter('Grand\\s+Tota[l!]\\s+Value');
  if (/Product\s+Tota[l!]\s+Value/i.test(text) && merchandise === undefined) errors.push('The product total is present but its amount could not be read.');
  if (/Freight\s*\/\s*Insurance\s*Tota[l!]\s+Value/i.test(text) && freight === undefined) errors.push('The freight total is present but its amount could not be read.');
  if (/Grand\s+Tota[l!]\s+Value/i.test(text) && grand === undefined) errors.push('The grand total is present but its amount could not be read.');
  const merchandiseValue = merchandise === undefined ? undefined : decimal(merchandise);
  const freightValue = freight === undefined ? undefined : decimal(freight);
  const value = grand === undefined ? merchandiseValue : decimal(grand);
  if (grand && merchandise && Math.abs(value - merchandiseValue - (freightValue || 0)) > .011) errors.push('Product, freight and grand totals disagree.');
  const qty = text.match(/Total\s*#?\s*of\s*Pieces\s+([\d,]+(?:\.0{1,3})?)(?![\d.])/i)?.[1];
  if (qty && !/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.0{1,3})?$/.test(qty)) errors.push('The declared quantity has invalid punctuation.');
  const weight = text.match(/Total\s+Weight\s+(\d+(?:\.\d+)?)\s*g[mn]/i)?.[1];
  return { invoiceNumber: invoice || fromName?.[1] || '', shipmentNumber: text.match(/Sterling\s+Shipment\s*#?\s*(\d{7,})/i)?.[1] || '', cartonNumber: text.match(/Carton(?:\s*#|s)\s*(\d+)/i)?.[1], hawb: text.match(/AWB[H#]*\s*:?\s*(\d{5,})/i)?.[1], shipto: shipto || fromName?.[2] || '', lines, declaredTotals: { quantity: qty ? Number(qty.replace(/,/g, '')) : undefined, value, merchandiseValue, freightValue, weightGrams: weight ? Number(weight) : undefined }, errors };
}
export function validateInvoice(invoice) {
  const errors = [...invoice.errors];
  if (!invoice.lines.length) errors.push('No complete invoice rows were found.');
  if (!invoice.invoiceNumber || !invoice.shipmentNumber || !invoice.shipto) errors.push('Invoice number, Sterling shipment number or Ship To is missing.');
  const seen = new Set();
  let quantity = 0, value = 0, weight = 0, merchandise = 0, freight = 0;
  for (const [index, row] of invoice.lines.entries()) {
    if (seen.has(row.lineNumber)) errors.push('Duplicate invoice line numbers need review.');
    seen.add(row.lineNumber);
    if (row.lineNumber !== index + 1) errors.push('Invoice line numbers are incomplete or out of order.');
    const identity = `Line ${row.lineNumber} (SKU ${row.sku})`;
    if (![row.quantity, row.unitWeightGrams, row.unitCost, row.extendedCost].every(Number.isFinite) || row.quantity <= 0 || row.unitWeightGrams < 0 || row.unitCost < 0 || row.extendedCost < 0) errors.push(`${identity}: a quantity, weight or amount is invalid.`);
    if (row.unitWeightGrams === 0 && row.zeroWeightConfirmed !== true) errors.push(`${identity}: source weight is 0.00 g. Verify the original and explicitly confirm that zero is printed, or correct the extraction; no replacement weight is estimated.`);
    if (Math.abs(rounded(row.quantity * row.unitCost) - row.extendedCost) > .011) errors.push(`${identity}: line amount does not match quantity × unit cost.`);
    const lineFreight = row.extendedFreight || 0;
    if (row.unitFreight !== undefined && (!Number.isFinite(row.unitFreight) || row.unitFreight < 0 || Math.abs(rounded(row.quantity * row.unitFreight) - lineFreight) > .011)) errors.push('A freight amount does not match quantity × unit freight.');
    if (row.totalCost !== undefined && Math.abs(row.totalCost - row.extendedCost - lineFreight) > .011) errors.push('A line subtotal does not match merchandise plus freight.');
    quantity += row.quantity; merchandise += row.extendedCost; freight += lineFreight; value += row.extendedCost + lineFreight; weight += row.quantity * row.unitWeightGrams;
  }
  for (const [field, actual, tolerance] of [['quantity', quantity, 0], ['value', value, .011], ['weightGrams', weight, .011]]) {
    const declared = invoice.declaredTotals[field];
    if (!Number.isFinite(declared)) errors.push(`The declared ${field} total could not be read.`);
    else if (Math.abs(actual - declared) > tolerance) errors.push(`The extracted ${field} total does not match the invoice.`);
  }
  for (const [key, actual] of [['merchandiseValue', merchandise], ['freightValue', freight]]) {
    if (invoice.declaredTotals[key] !== undefined && Math.abs(invoice.declaredTotals[key] - actual) > .011) errors.push(`The extracted ${key} does not match the invoice.`);
  }
  return [...new Set(errors)];
}

/** Keep each invoice independent, including PDFs containing several invoices. */
export function parseDocument(pages, filename = '') {
  const groups = [], pageErrors = [];
  for (const text of pages) {
    const metadata = parseInvoice(text);
    const number = metadata.invoiceNumber, shipto = metadata.shipto;
    const last = groups.at(-1);
    if(last && !number && !validateInvoice(parseInvoice(last.pages.join('\n'))).some(error=>!error.includes(': source weight is 0.00 g.')))pageErrors.push('An unidentified page follows an already complete invoice; it cannot be silently treated as a continuation.');
    const sameMetadata = !last || ['shipmentNumber', 'cartonNumber', 'hawb'].every(field => !metadata[field] || !last.metadata[field] || metadata[field] === last.metadata[field]);
    if (last && (!number || last.number === number) && (!shipto || !last.shipto || shipto === last.shipto) && sameMetadata) last.pages.push(text);
    else groups.push({ number, shipto, metadata, pages: [text] });
  }
  const invoices = groups.map(group => parseInvoice(group.pages.join('\n'), groups.length === 1 ? filename : ''));
  const errors = invoices.flatMap((invoice, index) => validateInvoice(invoice).map(error => `Invoice ${invoice.invoiceNumber || index + 1}: ${error}`));
  return { invoices, errors: [...pageErrors, ...errors], pageErrors };
}
export function combineInvoices(invoices) {
  // Keep all validated source rows. Common model aggregation runs after classification,
  // and retains carton/HAWB provenance rather than discarding differing metadata.
  const lines = invoices.flatMap(invoice => invoice.lines.map(line => ({...line, invoiceNumber:invoice.invoiceNumber, shipmentNumber:invoice.shipmentNumber, cartonNumber:invoice.cartonNumber, hawb:invoice.hawb, shipto:invoice.shipto, sourceLineNumber:line.lineNumber})));
  lines.forEach((line, index) => { line.lineNumber = index + 1; });
  const declaredTotals = invoices.reduce((sum, invoice) => ({ quantity: sum.quantity + invoice.declaredTotals.quantity, value: rounded(sum.value + invoice.declaredTotals.value), weightGrams: sum.weightGrams + invoice.declaredTotals.weightGrams }), { quantity: 0, value: 0, weightGrams: 0 });
  return { ...invoices[0], invoices, lines, declaredTotals, errors: [] };
}

export function textLines(items) {
  const rows = [];
  for (const item of items) {
    if (!item.str?.trim()) continue;
    const x = Number(item.transform?.[4] || 0), y = Number(item.transform?.[5] || 0);
    let row = rows.find(r => Math.abs(r.y - y) <= 2.25);
    if (!row) { row = { y, words: [] }; rows.push(row); }
    row.words.push({ x, text: item.str });
  }
  return rows.sort((a, b) => b.y - a.y).map(row => row.words.sort((a, b) => a.x - b.x).map(w => w.text).join(' ')).join('\n');
}
function operation(run, fn, ms, message) {
  if(run)return run.step(fn,ms,message);
  let timer;return Promise.race([Promise.resolve().then(fn),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(message)),ms)})]).finally(()=>clearTimeout(timer));
}
async function renderPage(page, options, run) {
  let task, remove;
  try { return await operation(run,()=>{task=page.render(options);remove=run?.onStop(()=>task.cancel());return task.promise},30000,'PDF page rendering timed out. No workbook was created.'); }
  finally {remove?.()}
}
async function readWeightCrop(canvas, worker, number, run) {
  const x = Math.max(0, Number(number[6]) - 8), y = Math.max(0, Number(number[7]) - 8);
  const width = Math.min(canvas.width - x, Number(number[8]) + 16), height = Math.min(canvas.height - y, Number(number[9]) + 16);
  if (![x,y,width,height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
  const crop = document.createElement('canvas'); crop.width = width * 4; crop.height = height * 4;
  try {
    crop.getContext('2d').drawImage(canvas, x, y, width, height, 0, 0, crop.width, crop.height);
    await operation(run,()=>worker.setParameters({ tessedit_pageseg_mode: '7', tessedit_char_whitelist: '0123456789.' }),30000,'OCR setup timed out.');
    const result = await operation(run,()=>worker.recognize(crop, {}, { text: true }), 30000, 'Local weight recognition timed out.');
    const candidate = result.data.text.trim();
    return result.data.confidence >= 80 && /^\d+\.\d{1,3}$/.test(candidate) ? candidate : null;
  } finally { crop.width = 1; crop.height = 1; }
}
export async function refineWeights(canvas, worker, text, tsv, run) {
  const invoice = parseInvoice(text);
  if (!invoice.lines.length || !validateInvoice(invoice).some(error => error.includes('weightGrams')) || !tsv) return text;
  const words = tsv.split('\n').slice(1).map(line => line.split('\t')).filter(fields => fields[0] === '5' && fields[11]?.trim());
  const lineKey = word => word.slice(1, 5).join(':');
  // Independently reread the printed total, never replace it with a sum of rows.
  const totalWords = words.filter(word => /^Total$/i.test(word[11])).map(word => {
    const line = words.filter(item => lineKey(item) === lineKey(word));
    const at = line.indexOf(word);
    return /^Weight$/i.test(line[at+1]?.[11] || '') && /^\d+(?:\.\d+)?$/.test(line[at+2]?.[11] || '') && /^gm$/i.test(line[at+3]?.[11] || '') ? line[at+2] : null;
  }).filter(Boolean);
  const totalLines = text.split('\n').filter(line => /^\s*Total\s+Weight\s+[\d,.]+\s*gm\b/i.test(line));
  if (totalWords.length === 1 && totalLines.length === 1 && !totalWords[0][11].includes('.')) {
    const candidate = await readWeightCrop(canvas, worker, totalWords[0], run);
    if (candidate) text = text.replace(/^(\s*Total\s+Weight\s+)[\d,.]+(\s*gm\b)/im, '$1' + candidate + '$2');
  }
  // A correct total may resolve the discrepancy; otherwise reread each unique item.
  if (!validateInvoice(parseInvoice(text)).some(error => error.includes('weightGrams'))) return text;
  for (const row of invoice.lines) {
    if (invoice.lines.filter(item => item.sku === row.sku).length !== 1) continue;
    const sku = words.find(word => word[11] === row.sku);
    if (!sku) continue;
    const rowWords = words.filter(word => lineKey(word) === lineKey(sku));
    const gm = rowWords.findIndex(word => /^gm$/i.test(word[11]));
    const number = rowWords[gm - 1];
    if (gm < 1 || !/^\d+$/.test(number[11])) continue;
    const candidate = await readWeightCrop(canvas, worker, number, run);
    if (candidate) text = text.split('\n').map(line => parseLine(line)?.sku === row.sku ? line.replace(/(\b(?:USA?|ITALY|IT|GERMANY|DE|FRANCE|FR)\s+)[\d,.]+(\s*g[mnm]\b)/i, '$1' + candidate + '$2') : line).join('\n');
  }
  return text;
}
/** Reread the printed description, independently of catalog wording. */
export async function refineDescriptions(canvas, worker, text, tsv, run, phase) {
  const invoice = parseInvoice(text), evidence = [];
  const words = (tsv || '').split('\n').slice(1).map(line=>line.split('\t')).filter(w=>w[0]==='5'&&w[11]?.trim());
  const key=w=>w.slice(1,5).join(':');
  for (const row of invoice.lines) {
    if (invoice.lines.filter(x=>x.sku===row.sku).length!==1) continue;
    const sku=words.find(w=>w[11]===row.sku); if(!sku) continue;
    const line=words.filter(w=>key(w)===key(sku)); const start=line.indexOf(sku)+1;
    const end=line.findIndex((w,i)=>i>=start&&/^(USA?|ITALY|IT|GERMANY|DE|FRANCE|FR)$/i.test(w[11]));
    const segment=line.slice(start,end); if(end<start||!segment.length)continue;
    const x=Math.max(0,Number(segment[0][6])-3), right=Number(line[end][6])-3;
    const y=Math.max(0,Math.min(...segment.map(w=>Number(w[7])))-5), bottom=Math.max(...segment.map(w=>Number(w[7])+Number(w[9])))+5;
    const width=right-x,height=bottom-y;if(width<=0||height<=0)continue;
    const crop=document.createElement('canvas');crop.width=Math.ceil(width*3);crop.height=Math.ceil(height*3);
    try {
      crop.getContext('2d').drawImage(canvas,x,y,width,height,0,0,crop.width,crop.height);
      const readings=[];
      for(const psm of ['7','6']){
        phase?.(`Checking source description ${evidence.length+1}/${invoice.lines.length}`);
        await operation(run,()=>worker.setParameters({tessedit_pageseg_mode:psm,tessedit_char_whitelist:'',preserve_interword_spaces:'1'}),30000,'OCR setup timed out.');
        const result=await operation(run,()=>worker.recognize(crop,{}, {text:true}),30000,'Local description recognition timed out.');
        readings.push({text:clean(result.data.text),confidence:result.data.confidence});
      }
      const compact=s=>s.replace(/\s/g,'').toUpperCase();
      const agrees=readings.every(r=>r.confidence>=80&&r.text.length>3)&&compact(readings[0].text)===compact(readings[1].text)&&compact(readings[0].text).length>=compact(row.description).length*.95;
      const rawConfidence=segment.reduce((sum,w)=>sum+Number(w[10]),0)/segment.length;
      evidence.push({invoiceNumber:invoice.invoiceNumber,sku:row.sku,sourceLineNumber:row.lineNumber,rawDescription:row.description,description:agrees?readings[0].text:row.description,descriptionVerified:agrees?'local-crop-agreement':undefined,descriptionReadings:readings,descriptionConfidence:rawConfidence});
    }finally{crop.width=1;crop.height=1;}
  }
  return evidence;
}

/** Direct full-page readings, not crop-derived values or arithmetic estimates. */
export function observeWeights(text, scale, psm) {
  const readings=[], occurrences=new Map();
  for(const line of text.split(/\r?\n/)){
    const item=line.match(/\b(\d{8})\s+.+?\s+(?:USA?|ITALY|IT|GERMANY|DE|FRANCE|FR)\s+(\d+(?:\.\d{1,3})?)\s*g[mn]\s+(\d+(?:\.0{1,3})?)\s+[$§]/i);
    if(item){const occurrence=(occurrences.get(item[1])||0)+1;occurrences.set(item[1],occurrence);readings.push({field:'item',sku:item[1],occurrence,quantity:Number(item[3]),value:Number(item[2]),raw:item[2],directDecimal:item[2].includes('.'),scale,psm});}
    const total=line.match(/^\s*Total\s+Weight\s+(\d+(?:\.\d{1,3})?)\s*g[mn]\b/i);
    if(total)readings.push({field:'total',value:Number(total[1]),raw:total[1],directDecimal:total[1].includes('.'),scale,psm});
  }
  return readings;
}
/** Validate untouched full-page weight ledgers before accepting their evidence. */
export function qualifyWeightLedgers(rawPages, readings) {
  const groups=[];
  for(const [page,text] of rawPages.entries()){
    const metadata=parseInvoice(text||''),number=metadata.invoiceNumber,last=groups.at(-1);
    const sameMetadata=!last||['shipmentNumber','cartonNumber','hawb'].every(field=>!metadata[field]||!last.metadata[field]||metadata[field]===last.metadata[field]);
    if(last&&(!number||number===last.number)&&(!metadata.shipto||!last.metadata.shipto||metadata.shipto===last.metadata.shipto)&&sameMetadata){last.pages.push(page);last.text+='\n'+text;}
    else groups.push({number,metadata,pages:[page],text:text||''});
  }
  return readings.map(reading=>{
    const group=groups.find(g=>g.pages.includes(reading.pageIndex));
    const source=readings.filter(r=>group?.pages.includes(r.pageIndex)),items=source.filter(r=>r.field==='item'),totals=source.filter(r=>r.field==='total');
    const quantityLabels=[...(group?.text||'').matchAll(/Total\s*#?\s*of\s*Pieces\b([^\n]*)/gi)];
    const quantityTokens=quantityLabels.map(m=>m[1].trim().split(/\s+/)[0]||'');
    const quantityFormat=/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.0{1,3})?$/;
    const quantities=quantityTokens.map(token=>quantityFormat.test(token)?Number(token.replaceAll(',','')):NaN);
    const totalLabels=[...(group?.text||'').matchAll(/^\s*Total\s+Weight\b/gmi)];
    const rawRowLines=(group?.text||'').split(/\r?\n/).filter(isCandidateRow);
    const rawSkuPattern=new RegExp('^(?:\\d{1,4}|[Ilt|])[.,:;)]*\\s+'+separators+'[\\dA-Za-z]{4}[.\\dA-Za-z]{6,14}[_.,:;)]*\\s+'+separators+'(\\d{8})\\b','i');
    const sourceRows=rawRowLines.map(line=>clean(line).match(rawSkuPattern)?.[1]||'unreadable-sku');
    const completeRows=JSON.stringify(sourceRows)===JSON.stringify(items.map(r=>r.sku));
    const complete=!!group?.number&&completeRows&&items.length>0&&totals.length>0&&totals.length===totalLabels.length&&quantities.length>0&&quantities.every(Number.isFinite)&&items.every(r=>Number.isFinite(r.quantity)&&r.quantity>0);
    const quantity=items.reduce((sum,r)=>sum+r.quantity,0),weight=items.reduce((sum,r)=>sum+r.quantity*r.value,0);
    const valid=complete&&quantities.every(q=>q===quantity)&&totals.every(r=>Math.abs(r.value-weight)<=.011);
    return {...reading,ledgerValid:valid,ledgerInvoice:group?.number||'',ledgerStatus:valid?'Complete raw weight ledger reconciles':complete?'Raw weight ledger contradicts printed quantity or weight':'Raw weight ledger is incomplete'};
  });
}

export function verifyWeightReadings(text, readings) {
  const invoice=parseInvoice(text),errors=[];
  const occurrences=new Map();
  const targets=invoice.lines.map(row=>{const occurrence=(occurrences.get(row.sku)||0)+1;occurrences.set(row.sku,occurrence);return {field:'item',sku:row.sku,occurrence,quantity:row.quantity,value:row.unitWeightGrams}});
  if(Number.isFinite(invoice.declaredTotals.weightGrams))targets.push({field:'total',value:invoice.declaredTotals.weightGrams});
  const expectedRows=targets.filter(t=>t.field==='item').map(t=>[t.sku,t.occurrence,t.quantity]);
  for(const scale of new Set(readings.filter(r=>r.ledgerValid).map(r=>r.scale))){const observedRows=readings.filter(r=>r.ledgerValid&&r.scale===scale&&r.field==='item').map(r=>[r.sku,r.occurrence,r.quantity]);if(JSON.stringify(observedRows)!==JSON.stringify(expectedRows))errors.push('An independently valid raw ledger has different source row identities or quantities.');}
  for(const target of targets){
    const observations=readings.filter(r=>r.ledgerValid&&(r.directDecimal||Number.isInteger(target.value))&&r.field===target.field&&r.sku===target.sku&&r.occurrence===target.occurrence);
    if(observations.some(r=>Math.abs(r.value-target.value)>.0001))errors.push('Independent full-page weight readings disagree; arithmetic alone cannot verify the printed weight.');
    const scales=new Set(observations.filter(r=>Math.abs(r.value-target.value)<.0001).map(r=>r.scale));
    if(scales.size<2)errors.push('Printed weights need matching direct readings at two independent image scales.');
  }
  return [...new Set(errors)];
}

async function scanPage(page, worker, scale, psm, phase, run, onRaw) {
  const base = page.getViewport({ scale: 1 });
  // Bound canvas memory for mobile Safari, including unusually large PDF pages.
  scale = Math.min(scale, Math.sqrt(8_000_000 / (base.width * base.height)), 4096 / Math.max(base.width, base.height));
  const viewport = page.getViewport({ scale }), canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
  try {
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('The page could not be prepared for local OCR.');
    phase('Rendering page');
    await renderPage(page,{ canvasContext: context, canvas, viewport, background: '#ffffff' },run);
    await operation(run,()=>worker.setParameters({ tessedit_pageseg_mode: psm, preserve_interword_spaces: '1', tessedit_char_whitelist: '', user_defined_dpi: String(Math.round(72 * scale)) }),30000,'OCR setup timed out.');
    phase('Reading full page');
    const result = await operation(run,()=>worker.recognize(canvas, {}, { text: true, tsv: true }), 120000, 'Local OCR timed out. Try fewer pages or a clearer scan.');
    // Page-wide OCR confidence is not a description gate; strict row/totals validation follows.
    onRaw(result.data.text);
    phase('Checking printed weights');
    const text=await refineWeights(canvas, worker, result.data.text, result.data.tsv, run);
    let descriptions;
    const hi=document.createElement('canvas');
    try {
      const highScale=Math.min(4,Math.sqrt(8_000_000/(base.width*base.height)),4096/Math.max(base.width,base.height));
      const highViewport=page.getViewport({scale:highScale});hi.width=Math.ceil(highViewport.width);hi.height=Math.ceil(highViewport.height);
      await renderPage(page,{canvasContext:hi.getContext('2d',{alpha:false}),canvas:hi,viewport:highViewport,background:'#ffffff'},run);
      const ratio=highScale/scale;
      const scaledTsv=result.data.tsv?.split('\n').map((line,index)=>{if(!index)return line;const f=line.split('\t');for(const i of [6,7,8,9])if(f[i])f[i]=String(Number(f[i])*ratio);return f.join('\t')}).join('\n');
      descriptions=await refineDescriptions(hi,worker,text,scaledTsv,run,phase);
    }finally{hi.width=1;hi.height=1;}
    return {text,descriptions,weightReadings:observeWeights(result.data.text,scale,psm),rawText:result.data.text};
  } finally { canvas.width = 1; canvas.height = 1; }
}
export async function readInvoicePdf(file, progress, options={}) {
  const ownRun=!options.run,run=options.run||createImportRun({progress,signal:options.signal,budgetMs:options.budgetMs});
  const report=event=>run.report({...event,label:options.labelPrefix?options.labelPrefix+' · '+event.label:event.label,percent:(options.progressStart||0)+(event.percent||0)*(options.progressSpan??100)/100});
  let loading,pdf,worker,disposePdf,disposeWorker,removePdf,removeWorker,disposeRaw,removeRaw;
  let pages=[],recoveryPages=[],pageStatus=[],descriptionEvidence=[],weightEvidence=[],failure;
  const retainRecovery=error=>{
    error.sourcePages=recoveryPages.slice();error.sourceFilename=file.name;error.numericEvidence=weightEvidence;
    error.recoveryState={expectedPageCount:pageStatus.length,unreadPages:pageStatus.flatMap((state,index)=>state==='full-page-ocr-complete'||state==='text-read'?[]:[index]),interrupted:true};
    error.zeroWeightRows=zeroWeightReviewRows(recoveryPages,file.name);return error;
  };
  const removeRecovery=run.onStop(()=>retainRecovery(run.stopped));
  try {
  report({ label: 'Reading PDF structure', percent: 2 });
  const pdfjs = await run.step(()=>import('./pdf-BOUNDED15-20261029.js'),30000,'PDF reader could not load.');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('../pdfjs/pdf.worker.min.mjs', import.meta.url).href;
  const bytes=await run.step(()=>file.arrayBuffer(),30000,'The source file could not be read.');
  loading = pdfjs.getDocument({ data: new Uint8Array(bytes), wasmUrl: new URL('../pdfjs/wasm/', import.meta.url).href, stopAtErrors: true });
  disposePdf=onceAsync(()=>loading.destroy());removePdf=run.onStop(disposePdf);
    pdf = await run.step(()=>loading.promise,30000,'PDF structure reading timed out.');
    if (pdf.numPages > 50) throw new Error('Please split invoices longer than 50 pages before importing.');
    const scanIndexes = [];
    pages=Array(pdf.numPages).fill('');recoveryPages=pages.slice();pageStatus=pages.map(()=> 'unread');
    for (let i = 1; i <= pdf.numPages; i++) {
      report({label:`Reading PDF structure · page ${i}/${pdf.numPages}`,percent:2+Math.floor(i/pdf.numPages*6)});
      const page = await run.step(()=>pdf.getPage(i));
      const text = textLines((await run.step(()=>page.getTextContent(),30000,'PDF text reading timed out.')).items);
      const ops = await run.step(()=>page.getOperatorList());
      const image = ops.fnArray.some((op, j) => [pdfjs.OPS.paintImageXObject, pdfjs.OPS.paintInlineImageXObject].includes(op) && ((ops.argsArray[j]?.[1] || ops.argsArray[j]?.[0]?.width || 0) * (ops.argsArray[j]?.[2] || ops.argsArray[j]?.[0]?.height || 0) > 200000));
      pages[i-1]=text;recoveryPages[i-1]=text;
      if (image || text.trim().length < 40) {scanIndexes.push(i - 1);pageStatus[i-1]='ocr-required';}else pageStatus[i-1]='text-read';
      page.cleanup();
    }
    let documentResult = parseDocument(pages, file.name), errors = documentResult.errors, mode = 'pdf-text';
    // A scan's existing hidden OCR is untrusted even when it contains some valid rows.
    if (scanIndexes.length || errors.length) {
      pageStatus=pageStatus.map(()=> 'ocr-required');
      report({label:'Starting local OCR · up to 4 verification passes',percent:10});
      const tessModule = await run.step(()=>import('./ocr-BOUNDED15-20261029.js'),30000,'OCR reader could not load.');
      const tess = tessModule.default;
      const asset = path => new URL('../' + path, import.meta.url).href;
      let currentPhase='Starting local OCR',currentPercent=10;
      const phase=(label,percent=currentPercent)=>{currentPhase=label;currentPercent=percent;report({label,percent})};
      const creation=run.step(()=>{
        const pending=tess.createWorker('eng',tess.OEM.LSTM_ONLY,{onWorker:raw=>{disposeRaw=onceAsync(()=>raw.terminate());removeRaw=run.onStop(disposeRaw);},workerPath:asset('tesseract/worker.min.js'),corePath:asset('tesseract/tesseract-core-lstm.wasm.js'),langPath:asset('tessdata'),logger:event=>{if(event.status==='recognizing text')report({label:currentPhase+' (current read '+Math.round(event.progress*100)+'%)',percent:currentPercent})}});
        pending.then(created=>{removeRaw?.();disposeWorker=onceAsync(()=>created.terminate());removeWorker=run.onStop(disposeWorker);},()=>{});
        return pending;
      },90000,'Local OCR could not start. No workbook was created.');
      worker=await creation;
      const indexes = scanIndexes.length ? scanIndexes : pages.map((_, i) => i), scannedPages=new Set();
      mode = 'pdf-ocr';
      let scanFailure, reviewCandidate;
      for (const [attempt, [scale, psm]] of [[2.5, tess.PSM.SINGLE_BLOCK], [3.2, tess.PSM.SINGLE_BLOCK], [4, tess.PSM.SINGLE_BLOCK], [3, tess.PSM.SINGLE_BLOCK]].entries()) {
        scanFailure = undefined;
        // Retain independently validated complete pages. Re-OCRing them can lose
        // correct digits; retry incomplete/mixed pages at bounded alternate scales.
        const retryIndexes = pages.map((_, i) => i), rawRoundPages=pages.map(()=>''), roundReadings=[];
        for (const index of retryIndexes) {
          scannedPages.add(index);
          run.check();
          const prefix=`Page ${index+1}/${pdf.numPages} · verification pass ${attempt+1}/4`;
          const pagePercent=10+Math.floor((attempt*pdf.numPages+index)/(4*pdf.numPages)*80);
          const updatePhase=label=>phase(prefix+' · '+label,pagePercent);
          updatePhase('Preparing page');
          const page = await run.step(()=>pdf.getPage(index + 1));
          try { const scan=await scanPage(page, worker, scale, psm, updatePhase, run, raw=>{run.check();recoveryPages[index]=raw;pageStatus[index]='full-page-ocr-complete';}); if(!/\b\d{4}[.\d]{6,14}\s+\d{8}\b|Total\s*#?\s*of\s*Pieces|(?:Grand|Product)\s+Total\s+Value/i.test(scan.text))throw new Error('A scanned page contains no recognizable invoice rows or totals.');rawRoundPages[index]=scan.rawText||'';roundReadings.push(...(scan.weightReadings||[]).map(reading=>({...reading,pageIndex:index})));if(!attempt || validateInvoice(parseInvoice(pages[index])).length){pages[index]=scan.text;descriptionEvidence[index]=scan.descriptions;} }
          catch (error) { if(run.stopped)throw error;scanFailure = error; pages[index] = ''; }
          finally { page.cleanup(); }
        }
        for(const reading of qualifyWeightLedgers(rawRoundPages,roundReadings)){const index=reading.pageIndex;weightEvidence[index]=[...(weightEvidence[index]||[]),reading];}
        documentResult = parseDocument(pages, file.name); errors = documentResult.errors;
        if (scanFailure) errors.push(scanFailure.message);
        for(const index of scannedPages)errors.push(...verifyWeightReadings(pages[index],weightEvidence[index]||[]));
        // Preserve one whole attempt for manual correction, never combine its
        // rows with another reading or use this ranking to authorize export.
        const reviewDocument=parseDocument(rawRoundPages,file.name);
        const reviewScore=reviewDocument.invoices.reduce((sum,invoice)=>sum+invoice.lines.length,0)*100-reviewDocument.errors.length;
        if(!reviewCandidate||reviewScore>reviewCandidate.score)reviewCandidate={score:reviewScore,pages:rawRoundPages.slice()};
        if (!errors.length) break;
      }
      if(errors.length&&reviewCandidate){
        pages.splice(0,pages.length,...reviewCandidate.pages);
        documentResult=parseDocument(pages,file.name);errors=documentResult.errors;
        if(scanFailure)errors.push(scanFailure.message);
        for(const index of scannedPages)errors.push(...verifyWeightReadings(pages[index],weightEvidence[index]||[]));
        if(!errors.length)errors.push('Automatic OCR attempts did not produce a fully verified extraction. Review the retained full-page text before export.');
      }
    }
    if (errors.length) {const error=new Error('This PDF could not be verified safely. ' + errors.join(' ').replaceAll('weightGrams', 'weight (grams)') + ' Correct the extracted fields below against the source or use a clearer scan; no workbook was created.');error.sourcePages=pages.slice();error.sourceFilename=file.name;error.numericEvidence=weightEvidence;error.zeroWeightRows=zeroWeightReviewRows(pages,file.name);throw error;}
    for(const invoice of documentResult.invoices)for(const row of invoice.lines){const matches=descriptionEvidence.flat().filter(e=>e&&e.invoiceNumber===invoice.invoiceNumber&&e.sku===row.sku&&e.sourceLineNumber===row.lineNumber);if(matches.length===1)Object.assign(row,matches[0]);}
    run.check();report({ label: 'Invoice rows and totals verified', percent: 96 });
    return { ...combineInvoices(documentResult.invoices), sourceSheetName: file.name.replace(/\.pdf$/i, '').replace(/-ex$/i, '').replace(/[\\/?*\[\]:]/g, '_').slice(0, 31), pages: pdf.numPages, extractionMode: mode, numericEvidence: weightEvidence.flatMap((readings,index)=>(readings||[]).map(reading=>({...reading,page:index+1}))) };
  } catch(error) {
    if(run.stopped)error=retainRecovery(run.stopped);
    failure=error;
    throw error;
  } finally {
    if(disposeWorker)await run.cleanup(disposeWorker);else if(disposeRaw)await run.cleanup(disposeRaw);
    if(disposePdf)await run.cleanup(disposePdf);
    removeWorker?.();removeRaw?.();removePdf?.();removeRecovery();if(ownRun)run.finish();
    if(run.stopped&&!failure)throw retainRecovery(run.stopped);
  }
}

/** Explicit source-printed zero review is scoped to exact text plus row identity.
 * This does not certify a physical weight and never estimates a replacement value.
 * It is used only after a person reviews the original; automatic OCR stays blocked.
 */
const zeroReviewKey=(invoice,row,index)=>JSON.stringify([invoice.invoiceNumber,invoice.shipto,invoice.shipmentNumber,invoice.cartonNumber||'',invoice.hawb||'',index,row.lineNumber,row.sku]);
export function zeroWeightReviewRows(pages, filename = '') {
  if(!Array.isArray(pages)||!pages.every(page=>typeof page==='string'))return [];
  const sourceText=JSON.stringify([filename,pages]);
  return parseDocument(pages,filename).invoices.flatMap((invoice,index)=>invoice.lines
    .filter(row=>row.unitWeightGrams===0)
    .map(row=>({key:zeroReviewKey(invoice,row,index),
      invoiceNumber:invoice.invoiceNumber,shipto:invoice.shipto,lineNumber:row.lineNumber,sku:row.sku,sourceText})));
}
/** Revalidate explicitly reviewed extraction; every non-zero numeric check remains. */
export function parseCorrectedPages(pages,filename,originalPages=pages,confirmedZeroWeights=[],recoveryState){
 if(recoveryState){
  if(pages.length!==recoveryState.expectedPageCount)throw Error('Every original PDF page must remain in the review.');
  for(const index of recoveryState.unreadPages||[]){
   if(!pages[index]?.trim()||!(recoveryState.confirmedPages||[]).some(item=>item.index===index&&item.text===pages[index]))throw Error(`Page ${index+1} was not fully read. Transcribe all its invoice fields from the original PDF and explicitly confirm that page before exporting.`);
  }
 }
 const parsed=parseDocument(pages,filename),candidates=zeroWeightReviewRows(pages,filename);
 const confirmations=Array.isArray(confirmedZeroWeights)?confirmedZeroWeights:[];
 for(const [index,invoice] of parsed.invoices.entries())for(const row of invoice.lines){
   const key=zeroReviewKey(invoice,row,index);
   const candidate=candidates.find(item=>item.key===key);
   if(candidate&&confirmations.some(item=>item?.key===key&&item.sourceText===candidate.sourceText)){
     row.zeroWeightConfirmed=true;
     row.zeroWeightConfirmation='User explicitly confirmed source-printed 0.00 g; value retained, not estimated.';
   }
 }
 const errors=[...(parsed.pageErrors||[]),...parsed.invoices.flatMap((invoice,index)=>validateInvoice(invoice).map(error=>`Invoice ${invoice.invoiceNumber||index+1}: ${error}`))];
 if(errors.length){const error=Error(errors.join(' ').replaceAll('weightGrams','weight (grams)'));error.sourcePages=pages.slice();error.sourceFilename=filename;error.zeroWeightRows=candidates;throw error;}
 return {...combineInvoices(parsed.invoices),sourceSheetName:filename.replace(/\.pdf$/i,'').slice(0,31),pages:pages.length,extractionMode:'pdf-ocr',editedExtraction:pages.slice(),originalExtractionPages:originalPages.slice()};
}
