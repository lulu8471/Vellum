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
const rowPattern = new RegExp('^(\\d{1,4})[.,:;)]?\\s+[=+~\\-]*\\s*(\\d{4}[.\\d]{6,14})\\s+(\\d{8})[.,]?\\s+(.+?)\\s+(USA?|ITALY|IT|GERMANY|DE)\\s+([\\d,.]+)\\s*(?:GM|G[MNM]|AM|EM|CM)\\s+(\\d{1,4}(?:\\.0{1,3})?)\\s+[$§]\\s*(' + money + ')\\s+[$§]\\s*(' + money + ')\\s*$', 'i');
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
    if (/^\d{1,4}[.,:;)]?\s+[=+~\-]*\s*\d{4}[.\d]{6,14}\s+\d{8}\b/.test(line)) {
      errors.push('An invoice row could not be read completely.'); current = null;
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
  const amountAfter = label => text.match(new RegExp(label + '\\s+(?:USD\\s*)?[$§]+\\s*(' + money + ')(?![\\d,.])', 'i'))?.[1];
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
  return { invoiceNumber: invoice || fromName?.[1] || '', shipmentNumber: text.match(/Sterling\s+Shipment\s*#?\s*(\d{7,})/i)?.[1] || '', cartonNumber: text.match(/Carton\s*#\s*(\d+)/i)?.[1], hawb: text.match(/AWB[H#]*\s*:?\s*(\d{5,})/i)?.[1], shipto: shipto || fromName?.[2] || '', lines, declaredTotals: { quantity: qty ? Number(qty.replace(/,/g, '')) : undefined, value, merchandiseValue, freightValue, weightGrams: weight ? Number(weight) : undefined }, errors };
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
    if (![row.quantity, row.unitWeightGrams, row.unitCost, row.extendedCost].every(Number.isFinite) || row.quantity <= 0 || row.unitWeightGrams <= 0 || row.unitCost < 0 || row.extendedCost < 0) errors.push('A quantity, weight or amount is invalid.');
    if (Math.abs(rounded(row.quantity * row.unitCost) - row.extendedCost) > .011) errors.push('A line amount does not match quantity × unit cost.');
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
  const groups = [];
  for (const text of pages) {
    const metadata = parseInvoice(text);
    const number = metadata.invoiceNumber, shipto = metadata.shipto;
    const last = groups.at(-1);
    const sameMetadata = !last || ['shipmentNumber', 'cartonNumber', 'hawb'].every(field => !metadata[field] || !last.metadata[field] || metadata[field] === last.metadata[field]);
    if (last && (!number || last.number === number) && (!shipto || !last.shipto || shipto === last.shipto) && sameMetadata) last.pages.push(text);
    else groups.push({ number, shipto, metadata, pages: [text] });
  }
  const invoices = groups.map(group => parseInvoice(group.pages.join('\n'), groups.length === 1 ? filename : ''));
  const errors = invoices.flatMap((invoice, index) => validateInvoice(invoice).map(error => `Invoice ${invoice.invoiceNumber || index + 1}: ${error}`));
  return { invoices, errors };
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
function timeout(promise, ms, message) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); })]).finally(() => clearTimeout(timer));
}
async function refineWeights(canvas, worker, text, tsv) {
  const invoice = parseInvoice(text);
  if (!validateInvoice(invoice).some(error => error.includes('weightGrams')) || !tsv) return text;
  const words = tsv.split('\n').slice(1).map(line => line.split('\t')).filter(fields => fields[0] === '5' && fields[11]?.trim());
  const lineKey = word => word.slice(1, 5).join(':');
  for (const row of invoice.lines) {
    // Do not apply one crop to several occurrences of the same SKU.
    if (invoice.lines.filter(item => item.sku === row.sku).length !== 1) continue;
    const sku = words.find(word => word[11] === row.sku);
    if (!sku) continue;
    const rowWords = words.filter(word => lineKey(word) === lineKey(sku));
    const gm = rowWords.findIndex(word => /^gm$/i.test(word[11]));
    const number = rowWords[gm - 1];
    if (gm < 1 || !/^\d+(?:\.\d+)?$/.test(number[11])) continue;
    const x = Math.max(0, Number(number[6]) - 8), y = Math.max(0, Number(number[7]) - 8);
    const width = Math.min(canvas.width - x, Number(number[8]) + 16), height = Math.min(canvas.height - y, Number(number[9]) + 16);
    const crop = document.createElement('canvas'); crop.width = width * 4; crop.height = height * 4;
    try {
      crop.getContext('2d').drawImage(canvas, x, y, width, height, 0, 0, crop.width, crop.height);
      await worker.setParameters({ tessedit_pageseg_mode: '7', tessedit_char_whitelist: '0123456789.' });
      const result = await timeout(worker.recognize(crop, {}, { text: true }), 30000, 'Local weight recognition timed out.');
      const candidate = result.data.text.trim();
      if (result.data.confidence < 80 || !/^\d+\.\d{1,3}$/.test(candidate)) continue;
      text = text.split('\n').map(line => parseLine(line)?.sku === row.sku ? line.replace(/(\b(?:USA?|ITALY|IT|GERMANY|DE)\s+)[\d,.]+(\s*g[mnm]\b)/i, '$1' + candidate + '$2') : line).join('\n');
    } finally { crop.width = 1; crop.height = 1; }
  }
  return text;
}
async function scanPage(page, worker, scale, psm, progress) {
  const base = page.getViewport({ scale: 1 });
  // Bound canvas memory for mobile Safari, including unusually large PDF pages.
  scale = Math.min(scale, Math.sqrt(8_000_000 / (base.width * base.height)), 4096 / Math.max(base.width, base.height));
  const viewport = page.getViewport({ scale }), canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
  try {
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('The page could not be prepared for local OCR.');
    await page.render({ canvasContext: context, canvas, viewport, background: '#ffffff' }).promise;
    await worker.setParameters({ tessedit_pageseg_mode: psm, preserve_interword_spaces: '1', tessedit_char_whitelist: '', user_defined_dpi: String(Math.round(72 * scale)) });
    progress?.({ label: 'Reading scanned invoice locally', percent: 35 });
    const result = await timeout(worker.recognize(canvas, {}, { text: true, tsv: true }), 120000, 'Local OCR timed out. Try fewer pages or a clearer scan.');
    if (result.data.confidence < 70) throw new Error('This scan is too unclear for reliable local OCR. Please use a sharper scan.');
    return await refineWeights(canvas, worker, result.data.text, result.data.tsv);
  } finally { canvas.width = 1; canvas.height = 1; }
}
export async function readInvoicePdf(file, progress) {
  progress?.({ label: 'Reading PDF structure', percent: 8 });
  const pdfjs = await import('./pdf-PDF5-20261020.js');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('../pdfjs/pdf.worker.min.mjs', import.meta.url).href;
  const loading = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), wasmUrl: new URL('../pdfjs/wasm/', import.meta.url).href, stopAtErrors: true });
  let pdf, worker;
  try {
    pdf = await loading.promise;
    if (pdf.numPages > 50) throw new Error('Please split invoices longer than 50 pages before importing.');
    const pages = [], scanIndexes = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const text = textLines((await page.getTextContent()).items);
      const ops = await page.getOperatorList();
      const image = ops.fnArray.some((op, j) => [pdfjs.OPS.paintImageXObject, pdfjs.OPS.paintInlineImageXObject].includes(op) && ((ops.argsArray[j]?.[1] || ops.argsArray[j]?.[0]?.width || 0) * (ops.argsArray[j]?.[2] || ops.argsArray[j]?.[0]?.height || 0) > 200000));
      pages.push(text);
      if (image || text.trim().length < 40) scanIndexes.push(i - 1);
      page.cleanup();
    }
    let documentResult = parseDocument(pages, file.name), errors = documentResult.errors, mode = 'pdf-text';
    // A scan's existing hidden OCR is untrusted even when it contains some valid rows.
    if (scanIndexes.length || errors.length) {
      const tessModule = await import('./ocr-PDF5-20261020.js');
      const tess = tessModule.default;
      const asset = path => new URL('../' + path, import.meta.url).href;
      let creationExpired = false;
      const creation = tess.createWorker('eng', tess.OEM.LSTM_ONLY, { workerPath: asset('tesseract/worker.min.js'), corePath: asset('tesseract/tesseract-core-lstm.wasm.js'), langPath: asset('tessdata'), logger: event => { if (event.status === 'recognizing text') progress?.({ label: `Running local OCR · ${Math.round(event.progress * 100)}%`, percent: 25 + Math.round(event.progress * 60) }); } });
      creation.then(created => { if (creationExpired) created.terminate().catch(() => {}); }, () => {});
      try { worker = await timeout(creation, 90000, 'Local OCR could not start. Reload and try again.'); } catch (error) { creationExpired = true; throw error; }
      const indexes = scanIndexes.length ? scanIndexes : pages.map((_, i) => i);
      mode = 'pdf-ocr';
      let scanFailure;
      for (const [attempt, [scale, psm]] of [[2.5, tess.PSM.SINGLE_BLOCK], [3.2, tess.PSM.SINGLE_BLOCK]].entries()) {
        scanFailure = undefined;
        // Retry every page after a failed combined validation: a mixed document
        // may contain BOTH a scan and a damaged native text page.
        const retryIndexes = attempt ? pages.map((_, i) => i) : indexes;
        for (const index of retryIndexes) {
          const page = await pdf.getPage(index + 1);
          try { pages[index] = await scanPage(page, worker, scale, psm, progress); }
          catch (error) { scanFailure = error; pages[index] = ''; }
          finally { page.cleanup(); }
        }
        documentResult = parseDocument(pages, file.name); errors = documentResult.errors;
        if (scanFailure) errors.push(scanFailure.message);
        if (!errors.length) break;
      }
    }
    if (errors.length) throw new Error('This PDF could not be verified safely. ' + errors.join(' ') + ' Use a clearer scan or review the source; no workbook was created.');
    progress?.({ label: 'Invoice rows and totals verified', percent: 96 });
    return { ...combineInvoices(documentResult.invoices), sourceSheetName: file.name.replace(/\.pdf$/i, '').replace(/-ex$/i, '').replace(/[\\/?*\[\]:]/g, '_').slice(0, 31), pages: pdf.numPages, extractionMode: mode };
  } finally {
    if (worker) await worker.terminate().catch(() => {});
    await loading.destroy().catch(() => {});
  }
}
