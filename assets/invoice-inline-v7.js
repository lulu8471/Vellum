/**
 * Inline editing only. The owner of the model validates edits, rebuilds derived
 * fields/checks/downloads, and retains the immutable original source evidence.
 * onApply receives [{ sourceRow, itemName, description, product }] and may return
 * a promise. Throw/reject (or return false) to show an inline failure message.
 */
export const invoiceProductOptions = Object.freeze([
  'Ring', 'Earrings', 'Bracelet', 'Bangle', 'Pendant w/Chain',
  'Necklace', 'Brooch', 'Platter'
]);

const editableFields = new Set(['Item Description', 'Product Description']);
const text = value => value == null ? '' : String(value);
const components = new WeakMap();
const extractionComponents = new WeakMap();
const modelKeys = new WeakMap();
let nextModelKey = 0;

/** Match actual source rows, including rows retained behind an aggregate. */
export function getInlineReviewRows(model) {
  const issues = (model?.issues || []).filter(issue =>
    issue.severity === 'error' && editableFields.has(issue.field)
  );
  const bySource = new Map();
  for (const output of model?.rows || []) {
    for (const row of output.sourceRows?.length ? output.sourceRows : [output]) {
      if (row.sourceRow == null) continue;
      const sourceKey = text(row.sourceRow);
      // Ambiguous source identifiers must remain blocked, never guessed.
      if (bySource.has(sourceKey)) bySource.set(sourceKey, null);
      else bySource.set(sourceKey, row);
    }
  }
  const pending = new Map();
  for (const issue of issues) {
    if (issue.sourceRow == null) continue;
    const row = bySource.get(text(issue.sourceRow));
    if (!row || (issue.itemName != null && text(issue.itemName) !== text(row.itemName))) continue;
    const key = JSON.stringify([row.sourceRow, text(row.itemName)]);
    if (!pending.has(key)) pending.set(key, { key, row, issues: [] });
    pending.get(key).issues.push(issue);
  }
  return [...pending.values()];
}

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

function sourceEvidence(model, row, issues) {
  const line = pdfLineFor(model, row);
  for (const value of [
    row.rawDescription, row.rawSourceDescription, row.originalDescription,
    row.rawSource?.description, line?.rawDescription, line?.description,
    ...issues.map(issue => issue.rawDescription)
  ]) {
    if (value != null) return {
      label: 'Original extracted source text', value: text(value) || '(blank)',
      readings: line?.descriptionReadings || []
    };
  }
  return {
    label: 'Imported description',
    value: text(row.itemDescription) || '(blank)'
  };
}

function componentFor(React) {
  if (components.has(React)) return components.get(React);
  const h = React.createElement;
  function InlineInvoiceReview({ model, onApply }) {
    const entries = getInlineReviewRows(model);
    const prefix = React.useId();
    const [drafts, setDrafts] = React.useState(() => Object.fromEntries(entries.map(entry => [
      entry.key, {
        description: text(entry.row.itemDescription),
        product: invoiceProductOptions.includes(entry.row.productDescription)
          ? entry.row.productDescription : ''
      }
    ])));
    const [feedback, setFeedback] = React.useState({});
    const [busy, setBusy] = React.useState('');
    const busyRef = React.useRef(false);
    const alive = React.useRef(true);
    React.useEffect(() => {
      alive.current = true;
      return () => { alive.current = false; };
    }, []);

    const update = (key, field, value) => {
      setDrafts(previous => ({ ...previous, [key]: { ...previous[key], [field]: value } }));
      setFeedback(previous => ({ ...previous, [key]: undefined }));
    };
    const apply = async (event, entry) => {
      event.preventDefault();
      if (busyRef.current || typeof onApply !== 'function') return;
      const draft = drafts[entry.key];
      const description = draft.description.trim();
      const product = draft.product;
      if (!description || !invoiceProductOptions.includes(product)) {
        setFeedback(previous => ({
          ...previous,
          [entry.key]: {
            error: true,
            message: !description ? 'Enter the description from the original source.' : 'Choose a product category.'
          }
        }));
        return;
      }
      busyRef.current = true;
      setBusy(entry.key);
      setFeedback(previous => ({ ...previous, [entry.key]: undefined }));
      try {
        const result = await onApply([{
          sourceRow: entry.row.sourceRow,
          itemName: text(entry.row.itemName),
          description,
          product
        }]);
        if (result === false) throw new Error('The changes could not be applied. Please check this row and try again.');
        if (alive.current) setFeedback(previous => ({
          ...previous,
          [entry.key]: { error: false, message: 'Changes applied. Any remaining checks still need to pass before download.' }
        }));
      } catch (error) {
        if (alive.current) setFeedback(previous => ({
          ...previous,
          [entry.key]: {
            error: true,
            message: error instanceof Error ? error.message : 'The changes could not be applied. Please try again.'
          }
        }));
      } finally {
        busyRef.current = false;
        if (alive.current) setBusy('');
      }
    };

    return h('section', {
      className: 'invoice-inline-review',
      'aria-labelledby': `${prefix}-title`,
      style: { textAlign: 'left', margin: '1.25rem 0', width: '100%' }
    },
    h('h3', { id: `${prefix}-title`, style: { margin: '0 0 .5rem' } }, 'Review unresolved rows'),
    h('p', { style: { fontSize: '.9rem', margin: '0 0 1rem' } },
      'Edit these fields here using the original source. Apply each reviewed row to rerun the checks.'),
    ...entries.map((entry, index) => {
      const { row, issues, key } = entry;
      const id = `${prefix}-${index}`;
      const draft = drafts[key];
      const evidence = sourceEvidence(model, row, issues);
      const status = feedback[key];
      const descriptionIssue = issues.some(issue => issue.field === 'Item Description');
      const productIssue = issues.some(issue => issue.field === 'Product Description');
      return h('form', {
        key,
        noValidate: true,
        onSubmit: event => apply(event, entry),
        'aria-label': `Review source row ${row.sourceRow}, SKU ${text(row.itemName)}`,
        style: { margin: '0 0 1rem' }
      },
      h('fieldset', {
        disabled: !!busy || typeof onApply !== 'function',
        'aria-busy': busy === key,
        style: {
          margin: 0, padding: '1rem', minWidth: 0, border: '1px solid #b6c9c1',
          borderRadius: '12px', background: '#f7faf8'
        }
      },
      h('legend', { style: { padding: '0 .35rem', fontWeight: 700 } },
        `Row ${row.sourceRow} · SKU ${text(row.itemName) || '(missing)'}`),
      (row.commercialInvoice || row.shipto) && h('p', {
        style: { margin: '0 0 .75rem', fontSize: '.8rem', overflowWrap: 'anywhere' }
      }, [
        row.commercialInvoice && `Invoice ${row.commercialInvoice}`,
        row.shipto && `Shipto ${row.shipto}`
      ].filter(Boolean).join(' · ')),
      h('ul', {
        id: `${id}-issues`,
        style: { margin: '0 0 .75rem', paddingLeft: '1.25rem', fontSize: '.85rem' }
      }, ...issues.map((issue, issueIndex) => h('li', {
        key: `${issue.id || issue.field}-${issueIndex}`, style: { overflowWrap: 'anywhere' }
      }, issue.message))),
      h('div', { id: `${id}-evidence`, style: { margin: '0 0 .85rem', fontSize: '.85rem' } },
        h('strong', null, `${evidence.label}: `),
        h('span', { style: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' } }, evidence.value),
        evidence.readings?.length > 0 && h('ul', { style: { margin: '.4rem 0 0', paddingLeft: '1.25rem' } },
          ...evidence.readings.map((reading, readingIndex) => h('li', {
            key: readingIndex, style: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }
          }, `Local reading ${readingIndex + 1}: ${text(reading.text)}${
            Number.isFinite(reading.confidence) ? ` (${reading.confidence.toFixed(1)}% OCR confidence)` : ''
          }`)))),
      h('div', {
        style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,15rem),1fr))', gap: '.85rem' }
      },
      h('label', { htmlFor: `${id}-description`, style: { display: 'block', fontSize: '.85rem', fontWeight: 600 } },
        `Item description${descriptionIssue ? ' · needs review' : ''}`,
        h('input', {
          id: `${id}-description`, name: 'description', type: 'text',
          value: draft.description, 'aria-required': true,
          'aria-describedby': `${id}-evidence ${id}-issues${status ? ` ${id}-status` : ''}`,
          'aria-invalid': !!(status?.error && !draft.description.trim()),
          onChange: event => update(key, 'description', event.target.value),
          style: controlStyle
        })),
      h('label', { htmlFor: `${id}-product`, style: { display: 'block', fontSize: '.85rem', fontWeight: 600 } },
        `Product category${productIssue ? ' · needs review' : ''}`,
        h('select', {
          id: `${id}-product`, name: 'product', value: draft.product, 'aria-required': true,
          'aria-describedby': `${id}-issues${status ? ` ${id}-status` : ''}`,
          'aria-invalid': !!(status?.error && !invoiceProductOptions.includes(draft.product)),
          onChange: event => update(key, 'product', event.target.value),
          style: controlStyle
        }, h('option', { value: '' }, 'Select a category'),
        ...invoiceProductOptions.map(product => h('option', { key: product, value: product }, product))))),
      h('button', {
        type: 'submit', className: 'text-button',
        style: { marginTop: '.85rem', padding: '.6rem .8rem', border: '1px solid #527566', borderRadius: '8px' },
        'aria-label': `Apply reviewed source row ${row.sourceRow}, SKU ${text(row.itemName)}`
      }, busy === key ? 'Applying row…' : 'Apply row'),
      status && h('p', {
        id: `${id}-status`, role: status.error ? 'alert' : 'status',
        style: { margin: '.65rem 0 0', fontSize: '.85rem', color: status.error ? '#8b2d20' : '#24523f', overflowWrap: 'anywhere' }
      }, status.message)));
    }));
  }
  components.set(React, InlineInvoiceReview);
  return InlineInvoiceReview;
}

const controlStyle = Object.freeze({
  display: 'block', boxSizing: 'border-box', width: '100%', marginTop: '.4rem',
  padding: '.65rem', border: '1px solid #93aea2', borderRadius: '7px',
  background: '#fff', color: '#173c32', font: 'inherit', fontWeight: 400
});

/** Safe to call conditionally from the application's render; hooks live inside. */
export function createInlineReviewElement(React, model, onApply) {
  if (!model || getInlineReviewRows(model).length === 0) return null;
  if (!modelKeys.has(model)) modelKeys.set(model, ++nextModelKey);
  return React.createElement(componentFor(React), {
    key: modelKeys.get(model), model, onApply
  });
}

/**
 * Append an invoice-local audit sheet. A split download may retain the complete
 * pdfSource object; exact source identity prevents other invoices leaking in.
 */
export function appendInvoiceEvidence(workbook, model, xlsx) {
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
    'Description verification', 'Description review'
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
      line.descriptionVerified || '', line.descriptionReviewed || ''
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
