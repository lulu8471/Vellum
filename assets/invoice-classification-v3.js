// Owner-confirmed category only; source description and origin remain untouched.
const approvedProducts = Object.freeze({'75962061': 'Brooch'});
/** Conservative description-based categories; the catalog is a hint, not source data. */
export function inferProduct(description) {
  const text = description.toUpperCase();
  if (/\b(?:TRAY|PLATTER)\b/.test(text)) return 'Platter';
  if (/\bPENDANT\b|PDT(?:I?\d|\b)/.test(text)) return 'Pendant w/Chain';
  if (/BGL(?:SM|MD|LG|\b)|BANGLE/.test(text)) return 'Bangle';
  if (/\b(?:BLT|BRACELET)\b/.test(text)) return 'Bracelet';
  if (/\b(?:ER|EARRINGS?)\b/.test(text) && !/\bRG\s*\d|\bRING\b/.test(text)) return 'Earrings';
  if (/\bRG\s*\d|\bRING\b|\bBAND\b|\bTFVR\b|\bTTGR\b/.test(text)) return 'Ring';
  return 'Jewelry'; // Explicitly blocked by the application, never exported silently.
}
function family(description, product) {
  if (product === 'Platter') return 'Misc Non Product';
  return product === 'Ring' && /\b(?:R?D\s*DI|CUDI|TRUE PAVE)\b.*\b(?:VVS|VS|SI)\d?\b|\bSLST\b/i.test(description) ? 'ENGAGEMENT' : 'FINE JEWELRY';
}
export function classifyInvoiceItem(sku, rawDescription, rawOrigin, saved, confirm = globalThis.window?.confirm?.bind(globalThis.window)) {
  const description = rawDescription.replace(/^[=+~\-]+\s*/, '').replace(/\s+/g, ' ').trim();
  const inferred = inferProduct(description);
  let product = approvedProducts[sku] || saved?.product || inferred;
  const conflict = !!saved && inferred !== 'Jewelry' && inferred !== saved.product;
  if (conflict) {
    const question = `Classification needs confirmation for SKU ${sku}.\nDescription: ${description}\nSaved category: ${saved.product}\nDescription-based category: ${inferred}\n\nOK: use ${inferred} for this import. Cancel: stop and review the source.`;
    if (!confirm?.(question)) throw new Error(`Classification for SKU ${sku} needs confirmation: saved ${saved.product}, description suggests ${inferred}. Import cancelled; no workbook was created.`);
    product = inferred;
  }
  const origin = rawOrigin.replace(/[^A-Za-z]/g, '').toUpperCase();
  const coo = ({ USA: 'US', UNITEDSTATES: 'US', ITALY: 'IT', GERMANY: 'DE' })[origin] || origin;
  // Preserve the actual document's wording and origin, even for a known SKU.
  return { description, family: conflict ? family(description, product) : saved?.family || family(description, product), product, coo, matchedApprovedItem: !!saved, classificationConfirmed: conflict };
}

/** An OCR match on totals cannot establish that gemstone details were read correctly. */
export function reviewInvoiceDescriptions(lines, mode, catalog, prompt = globalThis.window?.prompt?.bind(globalThis.window)) {
  if (mode !== 'pdf-ocr') return lines;
  return lines.map(line => {
    const reference = catalog[line.sku]?.description;
    const raw = line.description;
    const compact = text => text.replace(/\s/g, '').toUpperCase();
    if (reference && compact(reference) === compact(raw)) {
      return { ...line, description: reference, rawDescription: raw, descriptionReviewed: reference !== raw ? 'spacing' : undefined };
    }
    const question = `Review scanned description for SKU ${line.sku}.\nOCR: ${raw}\n${reference ? 'Saved reference (verify against this PDF): ' + reference : 'No saved description is available.'}\n\nCheck the original PDF, especially decimal points and gemstone grades. Enter the verified description below. Cancel stops this import.`;
    const verified = prompt?.(question, raw);
    if (!verified?.trim()) throw new Error(`The scanned description for SKU ${line.sku} needs review. Import stopped; no workbook was created.`);
    return { ...line, description: verified.replace(/\s+/g, ' ').trim(), rawDescription: raw, descriptionReviewed: 'confirmed' };
  });
}

export async function reviewInvoiceProducts(lines, catalog, choose = chooseProduct) {
  const output = [];
  for (const line of lines) {
    if (approvedProducts[line.sku]) { output.push({...line, confirmedProduct: approvedProducts[line.sku]}); continue; }
    if (!catalog[line.sku]?.product && inferProduct(line.description) === 'Jewelry') {
      const product = await choose(line);
      if (!product) throw new Error(`Choose a product category for SKU ${line.sku} to prepare this invoice. Import cancelled; no workbook was created.`);
      output.push({ ...line, confirmedProduct: product });
    } else output.push(line);
  }
  return output;
}
function chooseProduct(line) {
  if (!globalThis.document?.createElement) return Promise.resolve(null);
  return new Promise(resolve => {
    const dialog = document.createElement('dialog');
    dialog.style.cssText = 'max-width:32rem;padding:1.5rem;border:1px solid #adc5bd;border-radius:14px;font-family:system-ui;color:#17363b';
    const title = document.createElement('h3'); title.textContent = `Choose category · SKU ${line.sku}`;
    const description = document.createElement('p'); description.textContent = line.description;
    const label = document.createElement('label'); label.textContent = 'Product category';
    const select = document.createElement('select'); select.setAttribute('aria-label', 'Product category');
    for (const value of ['', 'Ring', 'Earrings', 'Bracelet', 'Bangle', 'Pendant w/Chain', 'Necklace', 'Brooch', 'Platter']) {
      const option = document.createElement('option'); option.value = value; option.textContent = value || 'Select a category'; select.append(option);
    }
    select.style.cssText = 'display:block;width:100%;padding:.7rem;margin:1rem 0';label.append(select);
    const ok = document.createElement('button'); ok.textContent = 'Use category'; ok.disabled = true;
    const cancel = document.createElement('button'); cancel.textContent = 'Cancel import'; cancel.style.marginLeft = '1rem';
    const finish = value => { dialog.close?.(); dialog.remove(); resolve(value); };
    select.addEventListener('change', () => { ok.disabled = !select.value; });
    ok.addEventListener('click', () => { if (select.value) finish(select.value); });cancel.addEventListener('click', () => finish(null));
    dialog.addEventListener('cancel', event => { event.preventDefault(); finish(null); });
    dialog.append(title, description, label, ok, cancel); document.body.append(dialog);
    if (dialog.showModal) dialog.showModal(); else { dialog.setAttribute('open', ''); dialog.style.position = 'fixed'; dialog.style.top = '20%'; dialog.style.zIndex = '9999'; }
  });
}
