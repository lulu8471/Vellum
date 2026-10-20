# Vellum

Browser-local preparation of shipment Excel files from spreadsheets and COMPASS PDF invoices. The existing English UI, workbook template, spreadsheet formulas, grouping and sorting are retained.

## PDF repair (2026-10-20)

- `assets/invoice-pdf.js` is the maintained PDF parser and local OCR pipeline.
- `assets/invoice-classification.js` handles conservative category inference and explicit OCR-description review.
- `scripts/build-app.mjs` deterministically integrates these modules into the existing deployed application. Run `node scripts/build-app.mjs` after changing integration hooks. The repository contains deployed assets, not the original React source project; the verified `index-VELLUM-SAFE3-20260826.js` is preserved as the integration baseline.
- `index.html` loads `index-VELLUM-PDF-20261020.js`. PDF/Tesseract helper imports point to that same module, preventing an old app from mounting a second React root during PDF import. The old global `String.prototype.match` patch is no longer loaded.

### Reliability and privacy

Native-text pages are parsed first. Large raster images trigger fresh local OCR even when the PDF contains an existing text layer. Missing rows, invalid amounts, mismatching line calculations, duplicate/gapped line numbers, missing totals and inconsistent metadata block export. Failed validation triggers a higher-resolution single-block OCR pass, including text pages in mixed documents.

OCR uses the bundled Tesseract worker, WASM core and English data on the device. No documents or extracted rows are sent to OCR services. Canvas dimensions are bounded; PDF and OCR resources are released on completion and errors.

Document totals cannot verify gemstone details or product names. For scans, whitespace-only differences may use the existing reference spacing with a visible check entry. Other differences, and descriptions without a reference, require editable per-row confirmation against the original PDF. Cancelling stops the import. Original OCR and reviewed descriptions are shown in the checks. Source country of origin is retained instead of silently replaced by the catalog. Category conflicts require explicit confirmation; an unknown generic `Jewelry` category blocks download.

### Tests

Run `node --test tests/*.test.mjs` for synthetic regression cases. These tests deliberately contain no private customer invoices or rows. Keep private PDF/Excel fixtures, extracted text, screenshots and test workbooks outside this public repository.

Validation includes actual bundled PDF.js rendering and local Tesseract OCR on private examples covering clear text, image-only, almost-empty text layers, and inaccurate pre-existing OCR, with quantity/value/weight reconciliation. Excel regression verifies formulas, sorting/grouping and special product rules. This does not replace real-browser testing: local browser preview access was unavailable in the repair environment, and actual Safari validation remains necessary. Review prompts require a person to check the original description; correct totals alone are not a claim of perfect OCR.

### Deployment and rollback

Publish only reviewed application assets, scripts and synthetic tests. Do not commit private fixtures or test outputs. After publishing, verify the deployed `index.html` points to the intended bundle and that dynamic PDF/OCR chunks reference the same app. To roll back, restore the prior commit as a normal commit (no force push); baseline artifacts have not been removed.
