## R16 — separate Export Excel → 92 entry

Open `export-92.html` explicitly from the mode navigation. The normal R15 invoice/OCR application and its dependency files remain byte-identical; no parser dispatch, Key/50/38 rule, merging rule or workbook writer is replaced.

This independent route accepts only the current uploaded Export Excel (`.xlsx` / `.xls`), selects a visible Invoice table by its source schema, and excludes hidden historical sheets. Ambiguous Invoice tables are rejected. One source becomes one 17-column `工作表1`, with source row order and exact description whitespace preserved, no SKU merging, unknown destination fields blank and payment-method text `92`. Source import references stay on the separate review sheet, not appended to descriptions.

The Invoice country-of-origin value is retained. Packing List is comparison-only: source-supported unique item matching is required, Box No. is not an item key, missing/ambiguous comparison is not a mismatch, and only a confirmed different country cell receives `FFF2CC` fill. The small US/USA equivalence rule does not rewrite the source value. Item weight is copied from the source, not inferred from Packing gross weight or multiplied by quantity; multi-quantity semantics are flagged for source review.

Source totals, formulas, identifiers and comparison coordinates remain traceable in the review sheet. Unsafe required data block download; no macro, external formula, source network request or old-session value is used. The standalone spreadsheet vendor is the exact existing xlsx-js-style 1.2.0 / SheetJS 0.18.5 code, isolated from the application mount and category data; the license is in `licenses/`.

Run `node scripts/build-export92.mjs` then `node --test tests/*.test.mjs`. Public tests are synthetic only; private source workbooks and their expected results must never be committed. Validate real source fixtures privately, inspect native XLSX values/types/fills and verify both website routes after deployment. Output is a template arrangement, not a claim of acceptance by any customs filing system.

## R15 — bounded browser-local PDF processing

Build: `bounded-ocr-20261029-r15`. Run `node scripts/build-bounded.mjs` and `node --test tests/*.test.mjs`.

- Whole-run progress is monotonic and names the page, verification pass, current operation and elapsed time. Current-read percentages are explicitly separate from overall progress.
- Stop and review cancels the actual OCR worker (including initialization), active render and PDF task. A five-minute whole-import safety deadline and per-operation deadlines lead to retained-text review, never an unchecked partial download. This is a fail-safe, not a promised processing time. Browser suspension or a frozen OS can delay timers; keep the tab foregrounded.
- Timeouts and engine failures are terminal for that run: no more OCR jobs queue on the stopped worker. Cleanup is bounded; late results cannot create a download or overwrite a later run.
- An unread page cannot be omitted just because the remaining rows reconcile. Recovery keeps the original page count and requires source-based transcription plus exact-text-bound completion confirmation for each unread page. Existing row, total, zero-weight and classification checks remain intact.
- A ZIP shares one deadline. An incomplete archive exposes retained text only as a reference; it cannot export one failed member as if it were the complete archive. Import the original PDFs separately for correction.
- R14's Safari text-stream reader fix and R13's Key/optional-picture workflow are retained. No new export-declaration mode, OCR service or private fixture is included.

# Vellum

Browser-local preparation of shipment Excel files from spreadsheets and COMPASS PDF invoices. The existing English UI, workbook template, spreadsheet formulas, grouping and sorting are retained.

## Current release: Safari PDF stream compatibility (R14)

- PDF.js text extraction now drains `ReadableStream.getReader()` instead of relying on stream async iteration, which is unavailable in some shipping Safari versions. Text item order, styles, language and the XFA branch are retained; reader locks are released on success and error.
- This is an isolated dependency-graph compatibility patch, not a library upgrade or global prototype polyfill. R13 Key rules, scanned invoice review, zero-weight confirmation, local OCR, formulas and numeric checks are unchanged.
- Build: `node scripts/build-safari.mjs`. Test: `node --test tests/*.test.mjs`. Synthetic tests reproduce the absent-async-iterator failure in the previous exact vendor method, then verify the patched method, cleanup and R14 Key/zero-review exports. Shipping Apple Safari still needs device-side confirmation; a Chromium or bundled-WebKit pass alone is not proof of Safari behavior.

## Current release: Key classification and source-weight review (R13)

- `KEY` as an explicit item marker stays **Key** in PDF, CSV/XLSX classification, the preview and workbook. A generic Pendant category cannot overwrite this more specific marker. True pendant and necklace descriptions are unchanged. No customer SKU table was added.
- Product photographs are optional. Classification uses source descriptions and existing verified evidence; unidentifiable items remain `Unknown (unverified)` rather than guessed from shape. Images, if supplied, remain subject to the unchanged local colour-photo exception rule.
- Scanned COMPASS invoices retain numeric row, sequence, total and independent raw-ledger checks. Unreliable extraction opens the existing local text correction/recheck flow. Messages identify the affected source row.
- Source-printed zero gram weights do not export automatically. Each zero row must be verified and explicitly checked in the correction panel. Confirmations are bound to the invoice/line/SKU and exact edited text, reset on edits, and recorded in a `Zero weight review` worksheet. Zero is retained as zero, never replaced with an estimated weight. All other arithmetic and invoice-total checks remain blocking.
- OCR and correction remain browser-local. No customer documents, pictures, descriptions or SKU mappings were added to this release or its synthetic tests.
- Build current release: `node scripts/build-key.mjs`. Test: `node --test tests/*.test.mjs`. This isolated build derives from the existing R12 bundle; the historical R11 build script is not the current production build. All earlier asset graphs are retained for already-open tabs.

## Current behavior: automatic combined export (R11)

- One source PDF produces **one workbook**, with all invoice rows together in the existing Vellum main worksheet. Existing formatting, sorting, formulas, invoice identifiers and totals are preserved. Different invoices are never merged by SKU.
- Names are used directly from extracted source text. Known bounded abbreviations (RG, ER, etc.) and verified SKU categories classify automatically. No name/category confirmation, popup or inline required field is presented.
- Unverified wording is retained in the extraction audit only, without visible reliability notices, confidence notices, or name/category review requests for any input format. An unknown or conflicting category is explicitly `Unknown (unverified)`, with no invented commodity code or declaration unit. This does not block download or display a category confirmation. It is not a claim that OCR wording is perfect.
- Numeric inconsistencies, missing required invoice identity, and genuine merge conflicts remain blocking. A combined source is never partially exported by silently dropping a failing invoice.
- The `PDF extraction` audit worksheet retains original extracted descriptions, output descriptions, verification basis and classification status. Private source-reviewed delivery corrections are separate from automatic application behavior.
- `assets/invoice-classification-v11.js`, `assets/invoice-inline-v11.js`, and `assets/invoice-downloads-v11.js` implement the new behavior. R11 PDF/OCR helpers reference the isolated R11 app. Prior versioned dependency graphs are unchanged for already-open tabs.
- Scanned item and total weights require matching direct full-page readings at two different effective rendering scales. A decimal crop cannot overwrite an already-decimal source weight, and contradictory readings from independently valid complete raw weight ledgers block export even when each ledger reconciles. Integer-printed weights remain supported when independently corroborated. This reduces correlated OCR risk; it does not guarantee perfect OCR. The passive `Numeric OCR evidence` worksheet retains raw values, source file/page, scale and segmentation mode, including ZIP imports. Other numeric fields retain their strict arithmetic validation.
- Corroborating weight evidence must belong to a complete original raw ledger: item identities, quantities and printed totals reconcile without crop edits. Inconsistent or incomplete raw attempts stay in the passive audit but cannot corroborate or veto an output. Continuation pages are evaluated together within one scan attempt; different attempts are never mixed into a raw ledger. Two conflicting valid ledgers still block, with no majority voting.
- Local OCR retries invalid pages at bounded alternate rendering scales. Independently validated complete pages are retained unchanged; partial continuation pages remain eligible for retries. Values from separate attempts are never combined to manufacture a passing invoice. Blank or unrecognized scanned pages cannot silently disappear behind a valid page. All original numeric checks remain in force.
- Bounded OCR spelling of the Carton label is accepted; missing cartons stay blank rather than borrowing shipment identifiers. Unknown classifications no longer claim that declaration codes are ready.
- Build: `node scripts/build-app.mjs`. Test: `node --test tests/*.test.mjs`. Current integration tests invoke the actual converter and workbook writer for warning-only export, strict numeric blocking, repeated SKU across invoices, combined formulas/audit, and dependency isolation. Historical tests also preserve prior behavior contracts where explicitly imported.

The sections below document earlier releases; their required review and split-download behavior is superseded by R11 above.

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
