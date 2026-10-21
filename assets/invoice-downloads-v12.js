/** One source, one workbook. Never silently omit an invoice with numeric errors. */
export async function buildInvoiceDownloads(model, buildWorkbook) {
  if (model.issues?.some(issue => issue.severity === 'error')) return [];
  const blob = await buildWorkbook(model);
  return [{ name: model.outputName, href: URL.createObjectURL(blob) }];
}
