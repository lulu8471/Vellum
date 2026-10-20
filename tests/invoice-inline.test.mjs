// Synthetic editor interactions, not a substitute for real-browser UI testing.
// All identifiers, descriptions and financial examples below are invented.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {
  createInlineReviewElement,
  createInlineExtractionElement,
  getInlineReviewRows,
  appendInvoiceEvidence,
  invoiceProductOptions
} from '../assets/invoice-inline-v7.js';

function freeze(value) {
  Object.freeze(value);
  Object.values(value).forEach(child => {
    if (child && typeof child === 'object') freeze(child);
  });
  return value;
}

// Small hook harness tests element/event contracts without installing another
// React version or mounting the application. State survives successive renders.
function harness(factory) {
  let cursor = 0;
  const hooks = [], cleanups = [];
  const React = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useId: () => ':synthetic:',
    useState(initial) {
      const index = cursor++;
      if (!(index in hooks)) hooks[index] = typeof initial === 'function' ? initial() : initial;
      return [hooks[index], next => {
        hooks[index] = typeof next === 'function' ? next(hooks[index]) : next;
      }];
    },
    useRef(initial) {
      const index = cursor++;
      return hooks[index] ??= { current: initial };
    },
    useEffect(effect) {
      const index = cursor++;
      if (!(index in hooks)) {
        hooks[index] = true;
        cleanups.push(effect());
      }
    }
  };
  const element = factory(React);
  return {
    React,
    element,
    render() {
      cursor = 0;
      return element?.type(element.props) ?? null;
    },
    unmount() { cleanups.forEach(cleanup => cleanup?.()); }
  };
}

function nodes(node) {
  return !node || typeof node !== 'object' ? [] : [
    node,
    ...(node.props?.children || []).flat(Infinity).flatMap(nodes)
  ];
}
const elements = (tree, type) => nodes(tree).filter(node => node.type === type);
const submit = form => form.props.onSubmit({ preventDefault() {} });

function reviewModel() {
  return {
    sourceName: 'synthetic.pdf',
    rows: [
      { sourceRow: 2, itemName: 'TEST-A', itemDescription: 'Raw OCR RG 7', rawDescription: 'Raw  OCR RG 7', productDescription: 'Jewelry', commercialInvoice: 'INV-A', shipto: 'DEST-A' },
      { sourceRow: 3, itemName: 'TEST-B', itemDescription: 'Already valid', productDescription: 'Ring' },
      { sourceRow: 4, itemName: 'TEST-C', itemDescription: 'Another OCR RG 8', rawDescription: 'Another  OCR RG 8', productDescription: 'Ring' }
    ],
    issues: [
      { id: 'p2', sourceRow: 2, severity: 'error', field: 'Product Description', message: 'Choose a category.' },
      { id: 'd2', sourceRow: 2, severity: 'error', field: 'Item Description', message: 'Check description.' },
      { id: 'w3', sourceRow: 3, severity: 'warning', field: 'Item Description', message: 'Already resolved.' },
      { id: 'd4', sourceRow: 4, severity: 'error', field: 'Item Description', message: 'Check description.' },
      { id: 'n3', sourceRow: 3, severity: 'error', field: 'Item Weight Grams', message: 'Bad number.' }
    ]
  };
}

test('inline review includes only unresolved descriptive fields and exact unambiguous source rows', () => {
  const model = reviewModel();
  assert.deepEqual(getInlineReviewRows(model).map(entry => entry.row.sourceRow), [2, 4]);
  const first = model.rows[0];
  const merged = { ...first, sourceRows: [first, { ...first, sourceRow: 5 }] };
  const issue = { sourceRow: 5, severity: 'error', field: 'Item Description' };
  assert.equal(getInlineReviewRows({ rows: [merged], issues: [issue] })[0].row.sourceRow, 5);
  assert.equal(getInlineReviewRows({
    rows: [first, { ...first, itemName: 'DIFFERENT' }], issues: model.issues
  }).length, 0);
  assert.equal(getInlineReviewRows({
    rows: model.rows,
    issues: [{ ...issue, sourceRow: 2, itemName: 'WRONG-SKU' }]
  }).length, 0);
  assert.equal(getInlineReviewRows({
    rows: model.rows, issues: [{ ...issue, sourceRow: 99 }]
  }).length, 0);
});

test('inline review uses labelled controls, preserves raw evidence, and avoids modal or native validation', () => {
  const model = freeze(reviewModel());
  const ui = harness(React => createInlineReviewElement(React, model, () => {}));
  const tree = ui.render();
  assert.equal(elements(tree, 'form').length, 2);
  assert.equal(elements(tree, 'input').length, 2);
  assert.equal(elements(tree, 'select').length, 2);
  assert.equal(elements(tree, 'dialog').length, 0);
  assert.ok(elements(tree, 'form').every(form => form.props.noValidate));
  for (const control of [...elements(tree, 'input'), ...elements(tree, 'select')]) {
    assert.ok(elements(tree, 'label').some(label => label.props.htmlFor === control.props.id));
    assert.ok(control.props['aria-describedby']);
  }
  assert.ok(JSON.stringify(tree).includes('Raw  OCR RG 7'));
  assert.equal(elements(tree, 'select')[0].props.value, '');
  assert.equal(invoiceProductOptions.length, 8);
  assert.equal(ui.element.type, createInlineReviewElement(ui.React, model, () => {}).type);
  assert.equal(ui.element.props.key, createInlineReviewElement(ui.React, model, () => {}).props.key);
  assert.equal(createInlineReviewElement(ui.React, { rows: [], issues: [] }, () => {}), null);
  ui.unmount();
});

test('review validates fields inline and emits a guarded edit without mutating the source model', async () => {
  const model = freeze(reviewModel()), before = structuredClone(model), calls = [];
  const ui = harness(React => createInlineReviewElement(React, model, async edits => calls.push(edits)));
  await submit(elements(ui.render(), 'form')[0]);
  assert.equal(calls.length, 0);
  assert.ok(nodes(ui.render()).some(node => node.props?.role === 'alert'));
  elements(ui.render(), 'select')[0].props.onChange({ target: { value: 'Ring' } });
  elements(ui.render(), 'input')[0].props.onChange({ target: { value: '   ' } });
  await submit(elements(ui.render(), 'form')[0]);
  assert.equal(calls.length, 0);
  elements(ui.render(), 'input')[0].props.onChange({ target: { value: 'Reviewed RG 7' } });
  await submit(elements(ui.render(), 'form')[0]);
  assert.deepEqual(calls, [[{
    sourceRow: 2, itemName: 'TEST-A', description: 'Reviewed RG 7', product: 'Ring'
  }]]);
  assert.deepEqual(model, before);
  ui.unmount();
});

test('review guards rapid double submit, disables other edits, shows async errors, and permits retry', async () => {
  const calls = [];
  let release, fail = true;
  const ui = harness(React => createInlineReviewElement(React, freeze(reviewModel()), async edits => {
    calls.push(edits);
    if (fail) {
      await new Promise(resolve => { release = resolve; });
      throw new Error('Synthetic rebuild failed.');
    }
  }));
  const form = elements(ui.render(), 'form')[1];
  const pending = submit(form);
  await submit(form);
  assert.equal(calls.length, 1);
  assert.ok(elements(ui.render(), 'fieldset').every(fieldset => fieldset.props.disabled));
  release();
  await pending;
  assert.ok(JSON.stringify(ui.render()).includes('Synthetic rebuild failed.'));
  assert.ok(elements(ui.render(), 'fieldset').every(fieldset => !fieldset.props.disabled));
  fail = false;
  await submit(elements(ui.render(), 'form')[1]);
  assert.equal(calls.length, 2);
  assert.ok(nodes(ui.render()).some(node => node.props?.role === 'status'));
  ui.unmount();
});

function recoveryError() {
  return freeze(Object.assign(new Error('Synthetic total mismatch'), {
    sourcePages: ['Invoice A\n1 SKU 25.50 gm\nTotal Weight 2550 gm', 'Page 2 unchanged\n']
  }));
}

test('extraction recovery is collapsed, uses per-page textareas, and preserves exact edits and original pages', async () => {
  const error = recoveryError(), calls = [];
  const ui = harness(React => createInlineExtractionElement(React, error, async pages => calls.push(pages)));
  let tree = ui.render();
  assert.equal(tree.type, 'details');
  assert.equal(tree.props.open, undefined);
  assert.equal(elements(tree, 'textarea').length, 2);
  assert.equal(elements(tree, 'button').length, 1);
  assert.equal(elements(tree, 'dialog').length, 0);
  assert.ok(elements(tree, 'form')[0].props.noValidate);
  elements(tree, 'textarea')[0].props.onChange({
    target: { value: 'Invoice A\n1 SKU 25.50 gm\nTotal Weight 25.50 gm' }
  });
  await submit(elements(ui.render(), 'form')[0]);
  assert.deepEqual(calls[0], ['Invoice A\n1 SKU 25.50 gm\nTotal Weight 25.50 gm', 'Page 2 unchanged\n']);
  assert.notEqual(calls[0], error.sourcePages);
  assert.equal(error.sourcePages[0], 'Invoice A\n1 SKU 25.50 gm\nTotal Weight 2550 gm');
  assert.equal(createInlineExtractionElement(ui.React, new Error('No page text'), () => {}), null);
  assert.equal(createInlineExtractionElement(ui.React, { sourcePages: [] }, () => {}), null);
  assert.equal(createInlineExtractionElement(ui.React, { sourcePages: [{}] }, () => {}), null);
  ui.unmount();
});

test('extraction recovery handles async double-submit, failure, retry, and blank-page rejection inline', async () => {
  let calls = 0, release, fail = true;
  const ui = harness(React => createInlineExtractionElement(React, recoveryError(), async () => {
    calls++;
    if (fail) {
      await new Promise(resolve => { release = resolve; });
      throw new Error('Synthetic weight still does not reconcile.');
    }
  }));
  const form = elements(ui.render(), 'form')[0];
  const pending = submit(form);
  await submit(form);
  assert.equal(calls, 1);
  assert.equal(elements(ui.render(), 'fieldset')[0].props.disabled, true);
  release();
  await pending;
  assert.ok(JSON.stringify(ui.render()).includes('Synthetic weight still does not reconcile.'));
  fail = false;
  await submit(elements(ui.render(), 'form')[0]);
  assert.equal(calls, 2);
  assert.equal(elements(ui.render(), 'fieldset')[0].props.disabled, false);
  for (const textarea of elements(ui.render(), 'textarea')) {
    textarea.props.onChange({ target: { value: ' \n ' } });
  }
  await submit(elements(ui.render(), 'form')[0]);
  assert.equal(calls, 2);
  assert.ok(JSON.stringify(ui.render()).includes('Enter the invoice text'));
  ui.unmount();
});

function bundledXlsx() {
  // Use the preserved baseline's real XLSX implementation, without mounting it.
  let code = fs.readFileSync(new URL('../assets/index-VELLUM-SAFE3-20260826.js', import.meta.url), 'utf8');
  code = code.replace(/^document.documentElement.dataset.vellumBuild=[^;]+;/, '');
  code = code.replace(/\(function\(\)\{let e=document\.createElement\(`link`\)[\s\S]*?\}\)\(\);var p=/, 'var p=');
  const mount = code.lastIndexOf('(0,T.createRoot)');
  assert.ok(mount > 0, 'Baseline bootstrap seam changed; inspect the test adapter.');
  code = code.slice(0, mount) + ';globalThis.xlsx=E.default;';
  const context = { console, Uint8Array, ArrayBuffer, TextEncoder, TextDecoder, File, Blob, URL, setTimeout, clearTimeout };
  vm.createContext(context);
  vm.runInContext(code, context);
  return context.xlsx;
}

function auditModel() {
  const row = (line, invoice) => ({
    sourceRow: line + 1, commercialInvoice: invoice, shipto: 'DEST-A',
    itemName: 'SAME-SKU', itemDescription: 'Reviewed output', productDescription: 'Ring'
  });
  const a = row(1, 'INV-A'), a2 = row(2, 'INV-A'), b = row(3, 'INV-B');
  return {
    rows: [{ ...a, sourceRows: [a, a2] }, b],
    issues: [{ id: 'd3', sourceRow: 3, severity: 'error', field: 'Item Description', message: 'Review description.' }],
    pdfSource: { lines: [
      { lineNumber: 1, sourceLineNumber: 1, invoiceNumber: 'INV-A', shipto: 'DEST-A', sku: 'SAME-SKU', rawDescription: 'Original  OCR A', description: 'OCR A', descriptionVerified: 'local-crop-agreement', descriptionReadings: [{ text: 'Crop A1', confidence: 91.2 }, { text: 'Crop A2', confidence: 89 }] },
      { lineNumber: 2, sourceLineNumber: 2, invoiceNumber: 'INV-A', shipto: 'DEST-A', sku: 'SAME-SKU', rawDescription: 'Original OCR A2', description: 'OCR A2', descriptionReviewed: 'inline' },
      { lineNumber: 3, sourceLineNumber: 1, invoiceNumber: 'INV-B', shipto: 'DEST-A', sku: 'SAME-SKU', rawDescription: 'Other invoice evidence', description: 'OCR B' }
    ] }
  };
}

test('PDF extraction audit preserves merged sources and filters split downloads by invoice, destination, SKU and source row', () => {
  const xlsx = bundledXlsx(), model = freeze(auditModel()), before = structuredClone(model);
  const book = xlsx.utils.book_new();
  appendInvoiceEvidence(book, { ...model, rows: [model.rows[0]] }, xlsx);
  assert.deepEqual(Array.from(book.SheetNames), ['PDF extraction']);
  let rows = xlsx.utils.sheet_to_json(book.Sheets['PDF extraction'], { header: 1 });
  assert.equal(rows.length, 3);
  assert.equal(rows[1][5], 'Original  OCR A');
  assert.equal(rows[1][6], 'Reviewed output');
  assert.equal(rows[1][8], 'local-crop-agreement');
  assert.equal(rows[2][9], 'inline');
  assert.equal(rows[1][10], 'Crop A1');
  assert.equal(rows[1][11], 91.2);
  assert.ok(!JSON.stringify(rows).includes('Other invoice evidence'));
  appendInvoiceEvidence(book, { ...model, rows: [model.rows[1]] }, xlsx);
  assert.equal(book.SheetNames[1], 'PDF extraction 2');
  rows = xlsx.utils.sheet_to_json(book.Sheets['PDF extraction 2'], { header: 1 });
  assert.equal(rows.length, 2);
  assert.equal(rows[1][5], 'Other invoice evidence');
  for (const change of [{ shipto: 'WRONG' }, { sourceRow: 99 }, { itemName: 'WRONG' }, { commercialInvoice: 'WRONG' }]) {
    const unmatched = xlsx.utils.book_new();
    appendInvoiceEvidence(unmatched, {
      ...model, rows: [{ ...model.rows[1], ...change }]
    }, xlsx);
    assert.equal(unmatched.SheetNames.length, 0);
  }
  const bytes = xlsx.write(book, { type: 'array', bookType: 'xlsx' });
  const roundtrip = xlsx.read(bytes, { type: 'array' });
  assert.equal(roundtrip.Sheets['PDF extraction'].F2.v, 'Original  OCR A');
  assert.equal(roundtrip.Sheets['PDF extraction'].L2.v, 91.2);
  assert.deepEqual(model, before);
});

test('inline source evidence resolves PDF source lines behind merged output without showing another invoice', () => {
  const model = freeze(auditModel());
  const ui = harness(React => createInlineReviewElement(React, model, () => {}));
  const serialized = JSON.stringify(ui.render());
  assert.ok(serialized.includes('Original OCR A2'));
  assert.ok(!serialized.includes('Other invoice evidence'));
  ui.unmount();
});
