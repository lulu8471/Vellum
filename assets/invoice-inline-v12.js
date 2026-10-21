/** Descriptive evidence belongs in the workbook, never a user confirmation. */
export function withoutDescriptionNotices(issues = []) {
  return issues.filter(issue => !['Item Description', 'Product Description', 'Classification'].includes(issue.field));
}
/** Keep supplied wording; a missing category is explicit rather than invented. */
export function applySourceDescriptionPolicy(model) {
  model.issues = withoutDescriptionNotices(model.issues);
  for (const row of model.rows || []) {
    if (!String(row.productDescription ?? '').trim()) {
      row.productDescription = 'Unknown (unverified)';
      row.declarationDescription = '(Unknown (unverified))';
      row.code = ''; row.unit = '';
      row.combinedDescription = [row.itemName, row.itemDescription, row.declarationDescription].filter(Boolean).join('\n');
    }
  }
  return model;
}
// R8 uses source descriptions directly; only numeric extraction recovery is editable.
const text = value => value == null ? '' : String(value);
const extractionComponents = new WeakMap();
const modelKeys = new WeakMap();
let nextModelKey = 0;
const controlStyle = {display:'block',boxSizing:'border-box',width:'100%',padding:'.65rem',font:'inherit'};
export function createInlineReviewElement() { return null; }
function matchesPdfLine(line, row, source) {
  return text(Number(line.lineNumber) + 1) === text(row.sourceRow)
    && text(line.sku) === text(row.itemName)
    && text(line.invoiceNumber ?? source.invoiceNumber) === text(row.commercialInvoice)
    && text(line.shipto ?? source.shipto) === text(row.shipto);
}

function pdfLineFor(model, row) {
  const source = model?.pdfSource;
  if (!source?.lines) return undefined;
  const matches = source.lines.filter(line => matchesPdfLine(line, row, source));
  return matches.length === 1 ? matches[0] : undefined;
}

export function appendInvoiceEvidence(workbook, model, xlsx) {
  if(model.pdfSource?.numericEvidence?.length){
    const header=['Source file','Page','Field','SKU','Occurrence','Original full-page value','Parsed value','Image scale','Page segmentation mode','Direct decimal reading','Source quantity','Ledger eligible','Ledger invoice','Ledger status'];
    const rows=model.pdfSource.numericEvidence.map(r=>[r.sourceFilename||model.sourceName||'',r.page,r.field,r.sku||'',r.occurrence||'',r.raw,r.value,r.scale,r.psm,r.directDecimal?'Yes':'No',r.quantity??'',r.ledgerValid?'Yes':'No',r.ledgerInvoice||'',r.ledgerStatus||'']);
    let name='Numeric OCR evidence',suffix=2;while(workbook.SheetNames.includes(name))name=`Numeric OCR evidence ${suffix++}`;
    const sheet=xlsx.utils.aoa_to_sheet([header,...rows]);sheet['!cols']=header.map(()=>({wch:24}));xlsx.utils.book_append_sheet(workbook,sheet,name);
  }

  if (!model?.pdfSource?.lines?.length) return;
  const before=model.pdfSource.originalExtractionPages, after=model.pdfSource.editedExtraction;
  if(Array.isArray(before)&&Array.isArray(after)){
    const invoices=new Set((model.rows||[]).map(row=>String(row.commercialInvoice)));
    const changes=[['Page','Invoice','Original extraction','Explicitly edited extraction']];
    let invoice='';
    after.forEach((text,index)=>{
      invoice=text.match(/Commercial\s+Invoice\s*[:#]\s*(\d{5,})/i)?.[1]||invoice;
      if(invoices.has(invoice)&&before[index]!==text)changes.push([index+1,invoice,before[index]||'',text]);
    });
    if(changes.length>1){let name='Extraction changes',suffix=2;while(workbook.SheetNames.includes(name))name=`Extraction changes ${suffix++}`;xlsx.utils.book_append_sheet(workbook,xlsx.utils.aoa_to_sheet(changes),name);}
  }

  const matches = [];
  const seen = new Set();
  for (const output of model.rows || []) {
    for (const source of output.sourceRows?.length ? output.sourceRows : [output]) {
      const line = pdfLineFor(model, source);
      if (!line || seen.has(line)) continue;
      seen.add(line);
      matches.push({ output, source, line });
    }
  }
  if (!matches.length) return;
  const readingCount = matches.reduce((max, { line }) =>
    Math.max(max, line.descriptionReadings?.length || 0), 0);
  const header = [
    'Source row', 'Invoice', 'Shipto', 'SKU', 'Printed line',
    'Original extracted description', 'Output description', 'Output product',
    'Description verification', 'Description review', 'Classification status', 'Description status'
  ];
  for (let index = 0; index < readingCount; index++) {
    header.push(`Local reading ${index + 1}`, `Reading ${index + 1} confidence`);
  }
  const rows = [header, ...matches.map(({ output, source, line }) => {
    const row = [
      source.sourceRow, source.commercialInvoice, source.shipto, source.itemName,
      line.sourceLineNumber ?? line.lineNumber,
      line.rawDescription ?? line.description ?? '',
      output.itemDescription, output.productDescription,
      line.descriptionVerified || '', line.descriptionReviewed || '',
      line.classificationVerified || (output.productDescription === 'Unknown (unverified)' ? 'Unknown: no unambiguous verified classification' : 'Automatically classified from saved category or bounded source marker'),
      line.descriptionVerified === 'independent-original-image-review' ? 'Output verified against original source image; original extraction retained separately' : line.descriptionUnresolved || 'Original source text used directly'
    ];
    for (let index = 0; index < readingCount; index++) {
      const reading = line.descriptionReadings?.[index];
      row.push(reading?.text ?? '', Number.isFinite(reading?.confidence) ? reading.confidence : '');
    }
    return row;
  })];
  let name = 'PDF extraction';
  let suffix = 2;
  while (workbook.SheetNames.includes(name)) name = `PDF extraction ${suffix++}`;
  const sheet = xlsx.utils.aoa_to_sheet(rows);
  sheet['!cols'] = header.map((_, index) => ({ wch: index === 5 || index === 6 || index >= 10 && index % 2 === 0 ? 52 : 21 }));
  sheet['!autofilter'] = { ref: xlsx.utils.encode_range({
    s: { r: 0, c: 0 }, e: { r: rows.length - 1, c: header.length - 1 }
  }) };
  xlsx.utils.book_append_sheet(workbook, sheet, name);
}

function extractionComponentFor(React) {
  if (extractionComponents.has(React)) return extractionComponents.get(React);
  const h = React.createElement;
  function InlineExtractionReview({ error, onApply }) {
    const prefix = React.useId();
    const [pages, setPages] = React.useState(() => error.sourcePages.slice());
    const [busy, setBusy] = React.useState(false);
    const [feedback, setFeedback] = React.useState(null);
    const busyRef = React.useRef(false);
    const alive = React.useRef(true);
    React.useEffect(() => {
      alive.current = true;
      return () => { alive.current = false; };
    }, []);
    const apply = async event => {
      event.preventDefault();
      if (busyRef.current || typeof onApply !== 'function') return;
      if (!pages.some(page => page.trim())) {
        setFeedback({ error: true, message: 'Enter the invoice text from the original PDF before rechecking.' });
        return;
      }
      busyRef.current = true;
      setBusy(true);
      setFeedback(null);
      try {
        const result = await onApply(pages.slice());
        if (result === false) throw new Error('The extracted fields still need attention. Check the original PDF and try again.');
        if (alive.current) setFeedback({
          error: false,
          message: 'Checks rerun. Any remaining issues are shown with the results.'
        });
      } catch (failure) {
        if (alive.current) setFeedback({
          error: true,
          message: failure instanceof Error ? failure.message : 'The extracted fields could not be verified. Please review them and try again.'
        });
      } finally {
        busyRef.current = false;
        if (alive.current) setBusy(false);
      }
    };
    return h('details', {
      className: 'invoice-inline-extraction',
      style: { margin: '1rem 0', textAlign: 'left', width: '100%' }
    },
    h('summary', { style: { cursor: 'pointer', fontWeight: 600 } }, 'Edit extracted fields and recheck'),
    h('p', { id: `${prefix}-guidance`, style: { fontSize: '.85rem' } },
      'Correct text or numbers only when you can verify them in the original PDF, including decimal points and weights. Rechecking runs all row and total validations again. Download stays blocked until the checks pass.'),
    h('form', { noValidate: true, onSubmit: apply, 'aria-label': 'Correct PDF extraction' },
      h('fieldset', {
        disabled: busy || typeof onApply !== 'function',
        'aria-busy': busy,
        style: { margin: 0, padding: 0, border: 0, minWidth: 0 }
      },
      h('legend', {
        style: { fontSize: '.9rem', fontWeight: 600, marginBottom: '.6rem' }
      }, 'Extracted page text'),
      ...pages.map((page, index) => h('label', {
        key: index, htmlFor: `${prefix}-page-${index}`,
        style: { display: 'block', margin: '0 0 1rem', fontSize: '.85rem', fontWeight: 600 }
      }, `Page ${index + 1}`,
      h('textarea', {
        id: `${prefix}-page-${index}`,
        name: `page-${index + 1}`, value: page, rows: 12,
        spellCheck: false, autoCapitalize: 'off', autoComplete: 'off',
        'aria-describedby': `${prefix}-guidance${feedback ? ` ${prefix}-status` : ''}`,
        onChange: event => {
          const value = event.target.value;
          setPages(previous => previous.map((old, pageIndex) => pageIndex === index ? value : old));
          setFeedback(null);
        },
        style: {
          ...controlStyle, minHeight: '10rem', resize: 'vertical',
          fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
          fontSize: '.8rem', lineHeight: 1.5, whiteSpace: 'pre'
        }
      }))),
      h('button', {
        type: 'submit', className: 'text-button',
        style: { padding: '.65rem .85rem', border: '1px solid #527566', borderRadius: '8px' }
      }, busy ? 'Rechecking fields…' : 'Recheck fields')),
      feedback && h('p', {
        id: `${prefix}-status`, role: feedback.error ? 'alert' : 'status',
        style: { fontSize: '.85rem', color: feedback.error ? '#8b2d20' : '#24523f', overflowWrap: 'anywhere' }
      }, feedback.message)));
  }
  extractionComponents.set(React, InlineExtractionReview);
  return InlineExtractionReview;
}

/** Only errors carrying recoverable page text get this collapsed inline editor. */
export function createInlineExtractionElement(React, error, onApply) {
  if (!Array.isArray(error?.sourcePages) || error.sourcePages.length === 0 ||
      !error.sourcePages.every(page => typeof page === 'string')) return null;
  if (!modelKeys.has(error)) modelKeys.set(error, ++nextModelKey);
  return React.createElement(extractionComponentFor(React), {
    key: modelKeys.get(error), error, onApply
  });
}
