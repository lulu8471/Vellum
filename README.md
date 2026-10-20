# Vellum

Browser-local preparation of shipment Excel files from spreadsheets and COMPASS PDF invoices. The existing English UI, workbook template, spreadsheet formulas, grouping and sorting are retained.

## Current behavior: automatic combined export (R8)

- One source PDF produces **one workbook**, with all invoice rows together in the existing Vellum main worksheet. Existing formatting, sorting, formulas, invoice identifiers and totals are preserved. Different invoices are never merged by SKU.
- Names are used directly from extracted source text. Known bounded abbreviations (RG, ER, etc.) and verified SKU categories classify automatically. No name/category confirmation, popup or inline required field is presented.
- Unverified wording is retained in the extraction audit only, without visible reliability notices, confidence notices, or name/category review requests for any input format. An unknown or conflicting category is explicitly `Unknown (unverified)`, with no invented commodity code or declaration unit. This does not block download or display a category confirmation. It is not a claim that OCR wording is perfect.
- Numeric inconsistencies, missing required invoice identity, and genuine merge conflicts remain blocking. A combined source is never partially exported by silently dropping a failing invoice.
- The `PDF extraction` audit worksheet retains original extracted descriptions, output descriptions, verification basis and classification status. Private source-reviewed delivery corrections are separate from automatic application behavior.
- `assets/invoice-classification-v8.js`, `assets/invoice-inline-v8.js`, and `assets/invoice-downloads-v8.js` implement the new behavior. R8 PDF/OCR helpers reference the isolated R8 app. Prior versioned dependency graphs are unchanged for already-open tabs.
- Build: `node scripts/build-app.mjs`. Test: `node --test tests/*.test.mjs`. R8-specific integration tests invoke the actual converter and workbook writer for warning-only export, strict numeric blocking, repeated SKU across invoices, combined formulas/audit, and dependency isolation. Historical tests also preserve prior behavior contracts where explicitly imported.

The sections below document earlier releases; their required review and split-download behavior is superseded by R8 above.

## PDF repair (2026-10-20)

- `assets/invoice-pdf-v7.js` is the maintained PDF parser and local OCR pipeline.
- `assets/invoice-classification-v7.js` handles bounded abbreviation inference and non-interrupting description checks.
- `scripts/build-app.mjs` deterministically integrates these modules into the existing deployed application. Run `node scripts/build-app.mjs` after changing integration hooks. The repository contains deployed assets, not the original React source project; the verified `index-VELLUM-SAFE3-20260826.js` is preserved as the integration baseline.
- `index.html` loads `index-VELLUM-PDF7-20261020.js`. PDF/Tesseract helper imports point to that same module, preventing an old app from mounting a second React root during PDF import. Versioned PDF2 helpers and vendor chunks are isolated; the complete PDF1 dependency path remains unchanged for already-open pages. The old global `String.prototype.match` patch is no longer loaded.

### Reliability and privacy

Native-text pages are parsed first. Large raster images trigger fresh local OCR even when the PDF contains an existing text layer. Missing rows, invalid amounts, mismatching line calculations, duplicate/gapped line numbers, missing totals and inconsistent metadata block export. Failed validation triggers a higher-resolution single-block OCR pass, including text pages in mixed documents.

OCR uses the bundled Tesseract worker, WASM core and English data on the device. No documents or extracted rows are sent to OCR services. Canvas dimensions are bounded; PDF and OCR resources are released on completion and errors.

Document totals cannot verify gemstone details or product names. Description crops are compared with the full extracted text and available reference evidence. A short crop cannot replace a complete description, and two matching OCR passes alone do not establish correctness. Whitespace-only reference differences can be resolved automatically; uncertain characters remain marked inline. No browser prompt, confirmation dialog or modal category chooser is used. Category inference uses bounded source markers and verified SKU evidence; contradictory or unknown categories stay unresolved rather than defaulting to Jewelry. Original descriptions and origin remain traceable.

### Tests

Run `node --test tests/*.test.mjs` for synthetic regression cases. These tests deliberately contain no private customer invoices or rows. Keep private PDF/Excel fixtures, extracted text, screenshots and test workbooks outside this public repository.

Validation includes actual bundled PDF.js rendering and local Tesseract OCR on private examples covering clear text, image-only, almost-empty text layers, and inaccurate pre-existing OCR, with quantity/value/weight reconciliation. Excel regression verifies formulas, sorting/grouping and special product rules. This does not replace real-browser testing: local browser preview access was unavailable in the repair environment, and actual Safari validation remains necessary. Uncertain fields are editable inline against the original; correct totals alone are not a claim of perfect OCR.

### Deployment and rollback

Publish only reviewed application assets, scripts and synthetic tests. Do not commit private fixtures or test outputs. After publishing, verify the deployed `index.html` points to the intended bundle and that dynamic PDF/OCR chunks reference the same app. To roll back, restore the prior commit as a normal commit (no force push); baseline artifacts have not been removed.

### Second repair: invoice bundles and compressed scans

The matching official PDF.js 6.2.108 image decoders and licenses live in `pdfjs/wasm/`. Supplying `wasmUrl` fixes JBIG2 images that previously rendered blank and were misleadingly reported as blurry. Decoder assets come from the official `pdfjs-dist` npm package. Numeric cell crops are locally re-read when unit weights do not reconcile; decimal points are recognized from image pixels, never inferred by dividing values.

Each invoice/destination in a PDF is validated independently and gets its own named Excel download. Same invoice + destination + SKU rows merge only when unit values and descriptions agree. Zero-price invoice lines are accepted when all quantities, weights and totals reconcile. Decimal-format whole quantities, explicit line freight/insurance and subtotal checks are supported. Actual Carton and AWB fields are preserved when present. Unknown product categories have an inline dropdown; unresolved invoices cannot be exported.

### Third repair: CSV row completeness

Shipment rows with a blank Carton ID are retained, with a visible warning and the original blank value. Candidate rows are recognized by SKU or invoice number; missing SKUs block export rather than disappearing. Quoted CSV fields and prefixed report lines use the existing spreadsheet reader. Missing HAWB remains explicitly unassigned. Previously deployed dependency graphs are preserved, and this release uses isolated PDF3 modules. An owner-confirmed category override is limited to its specific SKU; no general BOR rule is inferred.

### Fourth repair: consistent quantity aggregation

CSV, Excel and PDF rows share `assets/shipment-merge-v4.js`. Only matching invoice + Shipto + SKU rows combine. Quantities and extended values are summed; unit prices, unit freight and unit grams stay unchanged. Different unit values or conflicting descriptions/classifications block export with a source-row-specific review message instead of choosing the first value or inventing a blended price. Rounding that cannot fit the existing quantity × unit-value formulas also blocks.

Multiple carton and HAWB identifiers are explicitly retained. A `Source rows` worksheet records every original row behind a merged output, including blank identifiers. Different invoices/destinations/SKUs remain separate. Reapplying aggregation is idempotent; identical distinct source rows are counted once each, not deleted as presumed duplicates. Sequence formulas are generated after merging. Prior released dependency graphs remain unchanged.

### Fifth repair: verified PDF categories

A category-only SKU evidence table automatically fills four previously unresolved Ring categories. Evidence is independent review of the original source images' explicit ring markers and sizes; exact public SKU searches did not yield a verifiable product page, so this is not presented as an official online lookup. The UI displays the verification basis. No private invoice identifiers, prices or source descriptions are included in the table.

A bounded compact `WINGSRG` + numeric size pattern is recognized. Arbitrary `TRG`, `RGSS`, and unknown words are not assumed to be rings. Unknown categories still require review. Category evidence never replaces gemstone details, ring sizes or other source description text: OCR description review remains separate. No document or extracted row is sent to a product lookup or OCR service.

### Sixth repair: independently reread scanned total weight

When scanned weights do not reconcile, local OCR now rereads the printed Total Weight numeric cell as well as item weights. A unique label/cell and high-confidence decimal recognition are required. The total is never copied from a line weight or calculated sum. Unresolved or genuinely inconsistent totals still block export. The same bounded canvas limits and cleanup apply; no source data is uploaded for recognition.

### Seventh repair: no interrupting review dialogs

All description/category dialogs are removed. Explicit RG, ER, STUDS, BLT, BGL, PDT and NL markers, including bounded compact forms, are recognized automatically. A known SKU can supply its verified category; source descriptions, gemstone grades and sizes are never silently copied from a different reference. Unresolved rows have inline description/category controls. Failed numeric extraction exposes an optional inline text editor and reruns all original arithmetic/total checks after edits.

Independent verified invoices can download while another invoice remains unresolved. The workbook writer itself refuses error-bearing models. A `PDF extraction` worksheet records the original OCR, output text, verification basis and local readings for each invoice only. Prior files and dependency graphs remain unchanged.

PDF-only ZIP archives are accepted locally (20 MB compressed, 50 MB declared expanded size, up to 20 PDFs and 50 pages). Duplicate PDF content is rejected to avoid double counting. No archive files are written to a server. Country parsing includes FR/FRANCE; bounded OCR variants of the USD label do not change numeric punctuation rules. Blank AWB stays unassigned, not borrowed from the invoice number.
