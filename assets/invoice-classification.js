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
  let product = saved?.product || inferred;
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
