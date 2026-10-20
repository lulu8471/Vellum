/** Build independent workbooks; do not combine financial totals across invoices. */
export async function buildInvoiceDownloads(model, buildWorkbook) {
  const groups = new Map();
  for (const row of model.rows) {
    const key = `${row.commercialInvoice}|${row.shipto}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const downloads = [];
  try {
    for (const rows of groups.values()) {
      const invoice = rows[0].commercialInvoice, shipto = rows[0].shipto;
      const multipleDestinations = [...groups.values()].filter(group => group[0].commercialInvoice === invoice).length > 1;
      const name = `${invoice}${multipleDestinations ? '-' + shipto : ''} INV.xlsx`;
      const totals = rows.reduce((sum, row) => ({ quantity: sum.quantity + row.shippedQty, merchandise: sum.merchandise + row.extendedMerchLineValue, freight: sum.freight + row.extendedFreightLineValue, totalValue: sum.totalValue + row.totalLineValue, weightKg: sum.weightKg + row.extendedWeightKg }), { quantity: 0, merchandise: 0, freight: 0, totalValue: 0, weightKg: 0 });
      const blob = await buildWorkbook({ ...model, rows, totals, sourceSheetName: invoice, outputName: name });
      downloads.push({ name, href: URL.createObjectURL(blob) });
    }
    return downloads;
  } catch (error) { downloads.forEach(item => URL.revokeObjectURL(item.href)); throw error; }
}
