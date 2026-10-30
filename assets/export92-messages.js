/** Display-only English copy. Never rewrite source data, parser models or workbook output. */
export const ENGLISH_PREVIEW_HEADERS=Object.freeze([
  'Declaration date','Declaration number','Master bill','House bill','Item number',
  'Country of origin','Part number','Goods name','Additional description','Tariff code',
  'Import duty rate','Unit price','Quantity','Customs value','Net weight','Clearance status','Tax method'
]);

const originMessages=Object.freeze({
  same:'Invoice and Packing List origins agree.',
  different:'Invoice and the reliably matched Packing List have different origins. The Invoice value is retained; only its origin cell is highlighted.',
  unavailable:'No single usable current Packing List is available. Origins were not compared; no difference is confirmed.',
  unmatched:'No reliable, unique matching item was found in the Packing List. Origins were not compared.',
  ambiguous:'The same SKU has conflicting descriptions, quantities or units, or more than one matching item. No origin difference was inferred.',
  'missing-origin':'One source is missing its origin. The Invoice value is retained without filling the gap or marking a difference.',
  'unverified-source':'A text field used to compare origins contains a formula cache or an Excel error. Check the source cells; no confirmed difference is highlighted.'
});
const issueMessages=Object.freeze({
  AMBIGUOUS_PACKING:'More than one current Packing List was found. No comparison source was selected automatically; keep the intended list to compare origins.',
  FILENAME_INVOICE_DATE_DIFFERENCE:'The filename date differs from the current Invoice number date. Neither is treated as the declaration date; column A remains blank.',
  FORMULA_DESCRIPTION:'Description contains a formula. Verify it in the source workbook and replace it with an explicit text value before exporting.',
  FORMULA_IDENTIFIER:'An identifier contains a formula. Verify it in the source workbook and replace it with an explicit value before exporting.',
  IMPORT_REFERENCE_CONFLICT:'The original-import information is conflicting or unclear. The full Description is retained; review it against Cust no before using the reference.',
  IMPORT_REFERENCE_UNPARSED:'Cust no could not be split reliably. Its original value is retained in the source review sheet; check the original-import reference manually.',
  INVALID_IDENTIFIER:'An identifier is not text or a safely representable non-negative integer. Correct the source cell without losing leading zeros.',
  INVALID_QUANTITY:'Quantity must be greater than zero. Correct the source quantity before exporting.',
  INVOICE_TEXT_FORMULA:'Invoice origin or unit comes from a formula cache. Its source value is retained, but it cannot confirm an origin difference; verify the source cell.',
  ITEM_AFTER_TOTAL:'Item-like data appears after Total. It was not silently included or discarded; confirm the current Invoice table boundary in the source workbook before exporting.',
  LINE_AMOUNT_MISMATCH:'The source line amount differs from quantity multiplied by unit price. The source unit price is retained, not inferred from the amount; review the discrepancy.',
  MISSING_DESCRIPTION:'An item is missing its Description. Fill in the source description before exporting.',
  MISSING_NUMBER:'A required numeric value is missing. It has not been replaced with zero; fill in the source cell before exporting.',
  MISSING_SKU:'An item is missing its SKU. The source row has been retained; fill in the SKU before exporting.',
  MULTIPLE_TOTALS:'More than one Total row was found. All are retained for review and none replaces the item rows; check the source totals.',
  NEGATIVE_VALUE:'Weight and unit price must not be negative. Correct the source values before exporting.',
  ORIGIN_DIFFERENCE:originMessages.different,
  ORIGIN_SOURCE_UNVERIFIED:originMessages['unverified-source'],
  PACKING_ITEM_AFTER_TOTAL:'Item-like data appears after Total in the Packing List. Its table boundary is unclear, so it was not used to compare origins; check the source list.',
  PACKING_MATCH_AMBIGUOUS:originMessages.ambiguous,
  PACKING_SOURCE_UNREADABLE:'A Packing List item contains a value that could not be read safely. That item was not matched for origin comparison; correct the source row.',
  PRECISION_LOSS:'A source value cannot be preserved in the six-decimal output format. Review the source precision before exporting; it has not been silently rounded.',
  SOURCE_CELL_ERROR:'A source cell contains an Excel error. It was not accepted as valid data or converted into an error-code string; correct the cell before exporting.',
  SOURCE_ZERO_WEIGHT:'The source explicitly gives a weight of zero. Zero is retained without an estimated replacement; verify the weight before using the output.',
  STALE_FORMULA_CACHE:'The cached formula value differs from the safely calculated same-sheet result. Both are retained in the source review sheet; check the formula and its result.',
  TOTAL_AMOUNT_MISMATCH:'The source Total amount differs from the current item sum. All item rows are retained rather than replaced by the inconsistent total; check the source calculation.',
  TOTAL_QUANTITY_MISMATCH:'The source Total quantity differs from the current item sum. Check the source total and item quantities.',
  UNREADABLE_NUMBER:'A numeric value could not be read safely. Verify the source cell or replace an unsupported formula with a checked value. No value was guessed or replaced with zero.',
  WEIGHT_SEMANTICS:'Quantity is greater than one. Confirm whether Item weight is per item or per row. The source Item weight is retained without multiplying it by quantity.'
});
const issueVariants=Object.freeze({
  SOURCE_CELL_ERROR:Object.freeze({
    '來源識別欄含 Excel 錯誤值，未轉成文字代碼。':'A source identifier contains an Excel error. It was not converted into a text code; correct the identifier cell before exporting.',
    '來源文字欄含 Excel 錯誤值，未轉成字串或當成有效資料。':'A source text field contains an Excel error. It was not converted into text or accepted as valid data; correct the source cell before exporting.'
  }),
  IMPORT_REFERENCE_CONFLICT:Object.freeze({
    'Description 與 Cust no 的原進口資訊衝突或不明；原文保留，未自行選擇。':'The original-import information in Description and Cust no conflicts or is unclear. The full Description is retained; neither reference was chosen automatically. Check both source fields.',
    'Description 的原進口段落不唯一或格式不明，原文保留待核對。':'Description contains multiple or unrecognized original-import segments. Its full text is retained without removing a segment; check the source wording.'
  })
});
const numberReasons=Object.freeze({
  '缺少數值':'A referenced numeric value is missing.',
  '來源 Excel 儲存格錯誤':'A source Excel cell contains an error.',
  '不是明確數值':'The source value is not an explicit number.',
  '公式循環或超過安全深度':'The formula is circular or exceeds the supported reference depth.',
  '公式過長':'The formula exceeds the supported length.',
  'SUM 範圍無效':'The SUM range is invalid, outside Excel bounds or larger than the supported 10,000-cell range.',
  'SUM 範圍含來源 Excel 錯誤值':'A cell in the SUM range contains an Excel error.',
  '不支援或外部連結公式':'The formula uses an unsupported expression or an external workbook link.',
  '公式括號不完整':'The formula has incomplete parentheses.',
  '公式數值無效':'The formula contains an invalid numeric expression.',
  '公式結果無效':'The formula result is invalid or non-finite.',
  '數值超過安全範圍':'The value exceeds the supported numeric range.',
  '公式位址超出 Excel 安全範圍':'The formula references a cell outside the supported Excel address bounds.',
  '公式運算超過安全上限':'The formula exceeds the total supported calculation workload.',
  '公式範圍運算超過安全上限':'Formula range visits exceed the total supported calculation workload.',
  '公式符號數超過安全上限':'The formulas exceed the total supported expression-token limit.'
});
const errorMessages=Object.freeze({
  UNSUPPORTED_SOURCE:'The workbook could not be read. Open it in Excel, check that the current Invoice is present, then save and select the source file again.',
  INVALID_ADDRESS:'A worksheet or formula address is outside supported Excel bounds. Correct the source workbook before trying again.',
  ROW_LIMIT:'A visible worksheet exceeds the supported 50,000-row limit. Keep only the current Invoice and any needed Packing List, then try again.',
  ITEM_LIMIT:'A single file can contain at most 5,000 source items. Split the current items into smaller source workbooks.',
  NO_ITEMS:'No recognizable items were found below the Invoice headers. Check the item rows and required columns in the source workbook.',
  AMBIGUOUS_INVOICE:'A single current Invoice could not be identified. Keep one visible Invoice with the required item headers, then try again.',
  FILE_LIMIT:'The source workbook exceeds 25 MB. Keep only the current Invoice and any needed Packing List, then select the smaller file.',
  EXCEL_SIGNATURE:'The file contents are not a recognizable Excel workbook. Save an actual .xlsx or .xls file; changing the filename extension is not enough.',
  UNSAFE_ARCHIVE:'The workbook archive is invalid or exceeds supported safety limits. Open and save a fresh, smaller .xlsx source file, then try again.',
  MACRO_SOURCE:'This mode does not read workbooks containing VBA. Save a macro-free .xlsx copy of the required source sheets, then select it.',
  EXCEL_ONLY:'Choose a source Excel workbook (.xlsx or .xls). This mode does not read PDFs, images or email files.',
  EXPORT_BLOCKED:'Correct the reported errors in the source workbook, then select it again before creating the output.'
});
const errorVariants=Object.freeze({
  INVALID_ADDRESS:Object.freeze({
    '欄位位址超出 Excel 安全範圍。':'A column address is outside Excel bounds. Correct the source column references before trying again.',
    '工作表位址超出安全範圍。':'A worksheet cell address is outside supported bounds. Correct the source worksheet before trying again.'
  }),
  AMBIGUOUS_INVOICE:Object.freeze({
    '有多個可成立的目前 Invoice，請先在來源 Excel 保留要整理的那一張。':'More than one valid current Invoice was found. Keep only the Invoice you want to arrange visible in the source workbook, then select it again.',
    '找不到包含 SKU、Description、Item weight、Qty 與 USD 單價的目前 Invoice。':'No current Invoice with the required item headers was found. Check SKU, Description, Item weight, Country of Origin, Qty, Unit of measure, Unit Price (USD) and Total Amount (USD).'
  }),
  UNSAFE_ARCHIVE:Object.freeze({
    'Excel ZIP 結構不完整。':'The workbook archive is incomplete. Obtain the complete file or save a fresh .xlsx copy in Excel.',
    '不支援分卷或 ZIP64 Excel。':'Multi-volume and ZIP64 workbook archives are not supported. Save a standard, smaller .xlsx source file.',
    'Excel ZIP 目錄數量或範圍超出安全限制。':'The workbook archive directory is inconsistent or exceeds the supported 2,000-entry limit. Save a smaller, fresh .xlsx source file.',
    'Excel ZIP 目錄無效。':'The workbook archive directory is invalid. Open and save a fresh .xlsx copy in Excel.',
    '不支援加密或特殊壓縮的 Excel。':'Encrypted or specially compressed workbook archives are not supported. Select an unencrypted, standard .xlsx source copy.',
    'Excel 宣告解壓大小超過安全限制（單檔 30 MB、合計 100 MB）。':'The workbook declares more than the supported expanded size: 30 MB per archive entry or 100 MB in total. Save a smaller source workbook.',
    'Excel ZIP 項目位置無效。':'An archive entry has an invalid location. Open and save a fresh .xlsx copy in Excel.',
    'Excel ZIP 本機項目與目錄不一致。':'An archive entry does not match its directory record. Open and save a fresh .xlsx copy in Excel.',
    'Excel ZIP 檔名不一致。':'Archive entry names are inconsistent. Open and save a fresh .xlsx copy in Excel.',
    'Excel ZIP 宣告大小不一致。':'Declared archive entry sizes are inconsistent. Open and save a fresh .xlsx copy in Excel.',
    'Excel ZIP 含不支援的路徑。':'The workbook archive contains an unsupported entry path. Save a fresh standard .xlsx copy in Excel.',
    'Excel ZIP 目錄長度不一致。':'The workbook archive directory length is inconsistent. Open and save a fresh .xlsx copy in Excel.'
  })
});

const hasHan=value=>/\p{Script=Han}/u.test(value);
const string=value=>typeof value==='string'?value:'';
// Only bounded conventional diagnostic identifiers may enter the generic UI copy.
const codeSuffix=code=>/^[A-Z][A-Z0-9_]{0,47}$/.test(string(code))?` (${code})`:'';
const lookup=(map,key)=>Object.prototype.hasOwnProperty.call(map,key)?map[key]:undefined;
const variant=(map,code,message)=>{const variants=lookup(map,code);return variants&&lookup(variants,message);};

/** Source names, addresses and values are rendered separately by the caller, unchanged. */
export function issueMessage(issue){
  const code=string(issue?.code),message=string(issue?.message);
  if(code==='UNREADABLE_NUMBER'){
    const reason=message.replace(/；未猜測或當成 0。$/,'');
    const translated=lookup(numberReasons,reason);
    if(translated)return translated+' Check the referenced source cell or replace the formula with a verified value. No value was guessed or replaced with zero.';
  }
  const known=variant(issueVariants,code,message)||lookup(issueMessages,code);
  if(known)return known;
  if(message&&!hasHan(message))return message;
  return 'A source value needs review. Check the referenced cell in the original workbook before using the output.'+codeSuffix(code);
}
export function errorMessage(error){
  const code=string(error?.code),message=typeof error==='string'?error:string(error?.message);
  const known=variant(errorVariants,code,message)||lookup(errorMessages,code);
  if(known)return known;
  if(message&&!hasHan(message))return message;
  return 'The workbook could not be processed. Check the source file in Excel, correct any visible errors, then select it again.'+codeSuffix(code);
}
export function originMessage(comparison){
  return lookup(originMessages,string(comparison?.status))||'Origin comparison is not confirmed. Review the Invoice and Packing List source cells; no reliable comparison is available.';
}
