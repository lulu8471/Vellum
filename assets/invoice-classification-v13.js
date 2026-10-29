// Owner-confirmed category only; source description and origin remain untouched.
const approvedProducts = Object.freeze({'75962061': 'Brooch'});
// Category-only evidence: each item's original source image was independently
// reviewed for an explicit RG + numeric ring size. No public product-page match
// was found. Do not use this table to replace OCR descriptions or invoice values.
export const verifiedProducts = Object.freeze(Object.fromEntries(
  ['76076405','76009538','76009953','75655118'].map(sku => [sku, Object.freeze({
    product:'Ring', method:'source-image-review', verifiedOn:'2026-10-20',
    evidence:'Original source image checked: explicit ring marker and numeric ring size. Not an online product-page match.'
  })])
));
/** Product abbreviations are read as bounded suffixes/tokens, never arbitrary substrings. */
export function isKeyDescription(description) {
  const text=String(description ?? '').toUpperCase().replace(/\s+/g,' ').trim();
  // A specific key item is not a generic pendant. Do not match MONKEY,
  // KEYSTONE, key rings, or necklace names merely containing the word key.
  return /(?:^KEY\s*[-:]|\bKEY\s*$|\bKEY(?:[- ]SHAPED)?\s+(?:PENDANT|PDT)\s*$)/.test(text)
    && !/\b(?:NECKLACE|NL|RING|RG|EARRINGS?|BRACELET|BANGLE)\b/.test(text);
}
export function preserveKeyCategory(description, category) {
  const value=String(category ?? '').trim();
  if (/^key$/i.test(value)) return 'Key';
  return isKeyDescription(description) && /^(?:|Jewelry|Unknown \(unverified\)|Pendant(?: w\/Chain)?)$/i.test(value) ? 'Key' : value;
}
export function inferProduct(description) {
  const text=String(description ?? '').toUpperCase().replace(/\s+/g,' ').trim();
  const hits=[];
  const add=(yes,product)=>{if(yes)hits.push(product)};
  add(/\b(?:TRAY|PLATTER)\b/.test(text),'Platter');
  const key=isKeyDescription(text);
  add(key,'Key');
  add(!key && /\bPENDANT\b|(?:\b|\d|CL)PDT(?=I?\d|[ .]|$)/.test(text),'Pendant w/Chain');
  add(/(?:\b|\d|HNG|TW)BGL(?:SM|MD|LG|XL|XS|\b)|\bBANGLE\b/.test(text),'Bangle');
  add(/(?:\b|\d|MM)BLT(?:\s|$)|\bBRACELET\b/.test(text),'Bracelet');
  add(/\b(?:ER|EARRINGS?|STUDS)\b|(?:DI|DRP|DROP)ER$/.test(text),'Earrings');
  add(/\b(?:NECKLACE|NL)\b/.test(text),'Necklace');
  add(/\bBROOCH\b/.test(text),'Brooch');
  add(/(?:\b|WINGS|DI|\d)RG(?:\s*\d+(?:\.\d+)?)?\s*$|\bRG\b|\bRING\b|\bTCO FL \d+(?:\.\d+)?MM \d+(?:\.\d+)?$|\bBAND\b|\bTFVR\b|\bTTGR\b/.test(text),'Ring');
  return [...new Set(hits)].length===1?hits[0]:'Jewelry';
}
function family(description,product){
  if(product==='Platter')return 'Misc Non Product';
  return product==='Ring'&&/\b(?:R?D\s*DI|CUDI|TRUE PAVE)\b.*\b(?:VVS|VS|SI)\d?\b|\bSLST\b/i.test(description)?'ENGAGEMENT':'FINE JEWELRY';
}
export function classifyInvoiceItem(sku,rawDescription,rawOrigin,saved){
  const description=String(rawDescription ?? '');
  const inferred=inferProduct(description),verified=verifiedProducts[sku];
  const known=approvedProducts[sku]||verified?.product||(saved?.product ? preserveKeyCategory(description,saved.product) : undefined);
  const conflict=!!known&&inferred!=='Jewelry'&&inferred!==known;
  const product=conflict||(!known&&inferred==='Jewelry')?'Unknown (unverified)':known||inferred;
  const origin=String(rawOrigin ?? '').replace(/[^A-Za-z]/g,'').toUpperCase();
  return {description,family:product==='Unknown (unverified)'?'Unknown (unverified)':saved?.family||family(description,product),product,coo:({USA:'US',UNITEDSTATES:'US',ITALY:'IT',GERMANY:'DE',FRANCE:'FR'})[origin]||origin,matchedApprovedItem:!!known,classificationEvidence:verified?.evidence||(approvedProducts[sku]?'Owner-confirmed product category.':inferred!=='Jewelry'?'Explicit product abbreviation in source description.':saved?'Saved verified SKU category.':undefined),classificationUnresolved:conflict?`Saved category ${known} conflicts with source marker ${inferred}.`:product==='Unknown (unverified)'?'No verified SKU category or unambiguous product abbreviation.':undefined};
}
/** Source text is used directly. Confidence is advisory, never an export gate. */
export function reviewInvoiceDescriptions(lines,mode,catalog){
  return lines.map(line=>{
    const description=line.rawDescription ?? line.description ?? '';
    return {...line, description, rawDescription:description,
      descriptionReviewed:undefined,
      descriptionVerified:description===line.description?line.descriptionVerified:undefined,
      descriptionUnresolved:mode==='pdf-ocr'&&line.sourceExtractionMode!=='pdf-text'
        ? 'Original extracted source text retained automatically. OCR wording is unverified; no name confirmation is required.' : undefined};
  });
}
export async function reviewInvoiceProducts(lines){return lines;}
