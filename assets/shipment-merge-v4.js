/** Invoice + destination + SKU aggregation. Never guesses a price or discards a source row. */
const numericFields = ['unitPrice', 'unitFreight', 'itemWeightGrams'];
const descriptiveFields = ['itemDescription', 'productDescription', 'itemCoo', 'hts', 'unit', 'code'];
const unique = values => [...new Set(values)];
const sum = (rows, field) => rows.reduce((n, row) => n + row[field], 0);
export function mergeShipmentModel(model) {
  if (model.mergeVersion === 4) return model;
  const issues = [...model.issues], groups = new Map();
  for (const row of model.rows) {
    const key = JSON.stringify([row.commercialInvoice, row.shipto, row.itemName]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const rows = [];
  for (const sources of groups.values()) {
    if (sources.length === 1) { rows.push(sources[0]); continue; }
    const first = sources[0];
    const conflict = [...numericFields, ...descriptiveFields].filter(field => sources.some(row => row[field] !== first[field]));
    if (conflict.length) {
      issues.push({id:`merge-conflict-${first.sourceRow}`,severity:'error',sourceRow:first.sourceRow,field:'Merge',message:`Invoice ${first.commercialInvoice}, Shipto ${first.shipto}, SKU ${first.itemName} cannot be combined safely: different ${conflict.join(', ')}.`,resolution:`Source rows ${sources.map(row=>row.sourceRow).join(', ')} are retained. Review these values in the source; no price, weight or description is guessed.`});
      rows.push(...sources); continue;
    }
    const row = {...first, sourceRows: sources.map(source => ({...source}))};
    for (const field of ['shippedQty','extendedMerchLineValue','extendedFreightLineValue','totalLineValue','extendedWeightKg']) row[field] = sum(sources, field);
    // Formula values must remain consistent with the merged quantity and unchanged unit values.
    const checks = [['extendedMerchLineValue',row.shippedQty*row.unitPrice,1e-8],['extendedFreightLineValue',row.shippedQty*row.unitFreight,1e-8],['extendedWeightKg',row.shippedQty*row.itemWeightGrams/1000,1e-8]];
    if (checks.some(([field,value,tolerance])=>Math.abs(row[field]-value)>tolerance)) {
      issues.push({id:`merge-rounding-${first.sourceRow}`,severity:'error',sourceRow:first.sourceRow,field:'Merge',message:`SKU ${first.itemName} has source rounding that cannot be represented by one quantity × unit-value formula.`,resolution:'Original rows are retained. Review the source amounts before exporting.'});
      rows.push(...sources); continue;
    }
    row.cartonId = unique(sources.map(source=>source.cartonId || '(blank)')).join(' / ');
    row.documentNumber = unique(sources.map(source=>source.documentNumber || 'Unassigned')).join(' / ');
    if (sources.every(source=>!source.cartonId)) row.cartonId = '';
    rows.push(row);
    issues.push({id:`merge-${first.sourceRow}`,severity:'fixed',sourceRow:first.sourceRow,field:'Merge',message:`Combined ${sources.length} rows for invoice ${first.commercialInvoice}, Shipto ${first.shipto}, SKU ${first.itemName}; quantity ${row.shippedQty}.`,resolution:`Source rows ${sources.map(source=>source.sourceRow).join(', ')}. Cartons: ${row.cartonId || '(blank)'}. HAWB groups: ${row.documentNumber}. Original values are preserved in the Source rows worksheet.`});
  }
  // Map iteration preserves the existing Shipto order and the first source occurrence.
  return {...model, rows, issues, mergeVersion:4};
}
export function appendMergeSources(workbook, model, xlsx) {
  if (!model.rows.some(row=>row.sourceRows?.length>1)) return;
  const header=['Output row','Source row','Invoice','Shipto','SKU','Carton ID','HAWB group','Description','Product','Quantity','Unit price','Merchandise','Unit freight','Freight','Total','Unit grams','Total kg','COO','HTS'];
  const rows=[header];
  model.rows.forEach((row,index)=>(row.sourceRows || [row]).forEach(source=>rows.push([index+2,source.sourceRow,source.commercialInvoice,source.shipto,source.itemName,source.cartonId,source.documentNumber,source.itemDescription,source.productDescription,source.shippedQty,source.unitPrice,source.extendedMerchLineValue,source.unitFreight,source.extendedFreightLineValue,source.totalLineValue,source.itemWeightGrams,source.extendedWeightKg,source.itemCoo,source.hts])));
  let name='Source rows'; if (workbook.SheetNames.includes(name)) name='Source rows audit';
  xlsx.utils.book_append_sheet(workbook,xlsx.utils.aoa_to_sheet(rows),name);
}
