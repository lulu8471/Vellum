# Vellum

Browser-local preparation of shipment Excel files from spreadsheets and COMPASS PDF invoices. The existing English UI, workbook template, spreadsheet formulas, grouping and sorting are retained.

## PDF repair (2026-10-20)

- `assets/invoice-pdf-v4.js` is the maintained PDF parser and local OCR pipeline.
- `assets/invoice-classification-v4.js` handles conservative category inference and explicit OCR-description review.
- `scripts/build-app.mjs` deterministically integrates these modules into the existing deployed application. Run `node scripts/build-app.mjs` after changing integration hooks. The repository contains deployed assets, not the original React source project; the verified `index-VELLUM-SAFE3-20260826.js` is preserved as the integration baseline.
- `index.html` loads `index-VELLUM-PDF4-20261020.js`. PDF/Tesseract helper imports point to that same module, preventing an old app from mounting a second React root during PDF import. Versioned PDF2 helpers and vendor chunks are isolated; the complete PDF1 dependency path remains unchanged for already-open pages. The old global `String.prototype.match` patch is no longer loaded.

### Reliability and privacy

Native-text pages are parsed first. Large raster images trigger fresh local OCR even when the PDF contains an existing text layer. Missing rows, invalid amounts, mismatching line calculations, duplicate/gapped line numbers, missing totals and inconsistent metadata block export. Failed validation triggers a higher-resolution single-block OCR pass, including text pages in mixed documents.

OCR uses the bundled Tesseract worker, WASM core and English data on the device. No documents or extracted rows are sent to OCR services. Canvas dimensions are bounded; PDF and OCR resources are released on completion and errors.

Document totals cannot verify gemstone details or product names. For scans, whitespace-only differences may use the existing reference spacing with a visible check entry. Other differences, and descriptions without a reference, require editable per-row confirmation against the original PDF. Cancelling stops the import. Original OCR and reviewed descriptions are shown in the checks. Source country of origin is retained instead of silently replaced by the catalog. Category conflicts require explicit confirmation; unknown products require an explicit selection in a category dropdown.

### Tests

Run `node --test tests/*.test.mjs` for synthetic regression cases. These tests deliberately contain no private customer invoices or rows. Keep private PDF/Excel fixtures, extracted text, screenshots and test workbooks outside this public repository.

Validation includes actual bundled PDF.js rendering and local Tesseract OCR on private examples covering clear text, image-only, almost-empty text layers, and inaccurate pre-existing OCR, with quantity/value/weight reconciliation. Excel regression verifies formulas, sorting/grouping and special product rules. This does not replace real-browser testing: local browser preview access was unavailable in the repair environment, and actual Safari validation remains necessary. Review prompts require a person to check the original description; correct totals alone are not a claim of perfect OCR.

### Deployment and rollback

Publish only reviewed application assets, scripts and synthetic tests. Do not commit private fixtures or test outputs. After publishing, verify the deployed `index.html` points to the intended bundle and that dynamic PDF/OCR chunks reference the same app. To roll back, restore the prior commit as a normal commit (no force push); baseline artifacts have not been removed.

### Second repair: invoice bundles and compressed scans

The matching official PDF.js 6.2.108 image decoders and licenses live in `pdfjs/wasm/`. Supplying `wasmUrl` fixes JBIG2 images that previously rendered blank and were misleadingly reported as blurry. Decoder assets come from the official `pdfjs-dist` npm package. Numeric cell crops are locally re-read when unit weights do not reconcile; decimal points are recognized from image pixels, never inferred by dividing values.

Each invoice/destination in a PDF is validated independently and gets its own named Excel download. Same invoice + destination + SKU rows merge only when unit values and descriptions agree. Zero-price invoice lines are accepted when all quantities, weights and totals reconcile. Decimal-format whole quantities, explicit line freight/insurance and subtotal checks are supported. Actual Carton and AWB fields are preserved when present. Unknown product categories have an explicit dropdown; cancellation creates no output.

### Third repair: CSV row completeness

Shipment rows with a blank Carton ID are retained, with a visible warning and the original blank value. Candidate rows are recognized by SKU or invoice number; missing SKUs block export rather than disappearing. Quoted CSV fields and prefixed report lines use the existing spreadsheet reader. Missing HAWB remains explicitly unassigned. Previously deployed dependency graphs are preserved, and this release uses isolated PDF3 modules. An owner-confirmed category override is limited to its specific SKU; no general BOR rule is inferred.

### Fourth repair: consistent quantity aggregation

CSV, Excel and PDF rows share `assets/shipment-merge-v4.js`. Only matching invoice + Shipto + SKU rows combine. Quantities and extended values are summed; unit prices, unit freight and unit grams stay unchanged. Different unit values or conflicting descriptions/classifications block export with a source-row-specific review message instead of choosing the first value or inventing a blended price. Rounding that cannot fit the existing quantity × unit-value formulas also blocks.

Multiple carton and HAWB identifiers are explicitly retained. A `Source rows` worksheet records every original row behind a merged output, including blank identifiers. Different invoices/destinations/SKUs remain separate. Reapplying aggregation is idempotent; identical distinct source rows are counted once each, not deleted as presumed duplicates. Sequence formulas are generated after merging. Prior released dependency graphs remain unchanged.
