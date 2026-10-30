// Display-only localization checks. Synthetic data only; no customer fixtures.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {ENGLISH_PREVIEW_HEADERS,issueMessage,errorMessage,originMessage} from '../assets/export92-messages.js';
import {parseExport92Workbook,buildExport92Workbook,EXPORT92_HEADERS} from '../assets/export92-v1.js';
import XLSX from '../assets/export92-xlsx.js';
const parser=await readFile(new URL('../assets/export92-v1.js',import.meta.url),'utf8');
const english=value=>{assert.equal(typeof value,'string');assert.ok(value.length>15);assert.doesNotMatch(value,/\p{Script=Han}/u);return value;};
const issueCodes=['AMBIGUOUS_PACKING','FILENAME_INVOICE_DATE_DIFFERENCE','FORMULA_DESCRIPTION','FORMULA_IDENTIFIER','IMPORT_REFERENCE_CONFLICT','IMPORT_REFERENCE_UNPARSED','INVALID_IDENTIFIER','INVALID_QUANTITY','INVOICE_TEXT_FORMULA','ITEM_AFTER_TOTAL','LINE_AMOUNT_MISMATCH','MISSING_DESCRIPTION','MISSING_NUMBER','MISSING_SKU','MULTIPLE_TOTALS','NEGATIVE_VALUE','ORIGIN_DIFFERENCE','ORIGIN_SOURCE_UNVERIFIED','PACKING_ITEM_AFTER_TOTAL','PACKING_MATCH_AMBIGUOUS','PACKING_SOURCE_UNREADABLE','PRECISION_LOSS','SOURCE_CELL_ERROR','SOURCE_ZERO_WEIGHT','STALE_FORMULA_CACHE','TOTAL_AMOUNT_MISMATCH','TOTAL_QUANTITY_MISMATCH','UNREADABLE_NUMBER','WEIGHT_SEMANTICS'];
const errorCodes=['UNSUPPORTED_SOURCE','INVALID_ADDRESS','ROW_LIMIT','ITEM_LIMIT','NO_ITEMS','AMBIGUOUS_INVOICE','FILE_LIMIT','EXCEL_SIGNATURE','UNSAFE_ARCHIVE','MACRO_SOURCE','EXCEL_ONLY','EXPORT_BLOCKED'];
test('all emitted parser issue codes have specific English messages',()=>{
  assert.deepEqual([...new Set([...parser.matchAll(/issue\(issues,'([^']+)'/g)].map(m=>m[1]))].sort(),issueCodes.slice().sort());
  for(const code of issueCodes)assert.doesNotMatch(english(issueMessage({code,message:'待核對'})),/^A source value needs review/);
  for(const [,code,message]of parser.matchAll(/issue\(issues,'([^']+)','([^']+)'/g))english(issueMessage({code,message}));
});
test('every literal parser error and archive failure is covered, including default codes',()=>{
  const emitted=new Set(['UNSUPPORTED_SOURCE','UNSAFE_ARCHIVE']);
  for(const call of parser.matchAll(/(?:new Export92Error|\bfail)\(([^;\n]*?)\)/g))for(const code of call[1].matchAll(/'([A-Z][A-Z_]+)'/g))emitted.add(code[1]);
  assert.deepEqual([...emitted].sort(),errorCodes.slice().sort());
  for(const code of errorCodes)assert.doesNotMatch(english(errorMessage({code,message:'內部錯誤'})),/^The workbook could not be processed/);
  let count=0;
  for(const [,kind,message,explicit]of parser.matchAll(/(new Export92Error|\bfail)\('([^']*)'(?:,'([A-Z_]+)')?\)/g)){
    count++;english(errorMessage({code:explicit||(kind==='fail'?'UNSAFE_ARCHIVE':'UNSUPPORTED_SOURCE'),message}));
  }
  assert.ok(count>=25,'Literal parser failure inventory unexpectedly changed');
});
test('every dynamic numeric failure reason is translated with no guessing or zero substitution',()=>{
  const reasons=[...new Set([...parser.matchAll(/throw Error\('([^']+)'\)/g)].map(m=>m[1]))];
  assert.equal(reasons.length,16);
  for(const reason of reasons){const message=english(issueMessage({code:'UNREADABLE_NUMBER',message:reason+'；未猜測或當成 0。'}));assert.doesNotMatch(message,/^A numeric value could not be read safely/);assert.match(message,/No value was guessed or replaced with zero/);}
  const unknown=english(issueMessage({code:'UNREADABLE_NUMBER',message:'新的公式錯誤；未猜測或當成 0。'}));assert.match(unknown,/source cell/);assert.match(unknown,/zero/);
});
test('reused codes retain their specific source distinctions',()=>{
  const variants={
    AMBIGUOUS_INVOICE:[['有多個可成立的目前 Invoice，請先在來源 Excel 保留要整理的那一張。',/More than one/],['找不到包含 SKU、Description、Item weight、Qty 與 USD 單價的目前 Invoice。',/No current Invoice/]],
    INVALID_ADDRESS:[['欄位位址超出 Excel 安全範圍。',/column address/],['工作表位址超出安全範圍。',/worksheet cell address/]]
  };
  for(const [code,entries]of Object.entries(variants))for(const [message,pattern]of entries)assert.match(english(errorMessage({code,message})),pattern);
  const issueVariants={SOURCE_CELL_ERROR:[['來源識別欄含 Excel 錯誤值，未轉成文字代碼。',/identifier/],['來源文字欄含 Excel 錯誤值，未轉成字串或當成有效資料。',/text field/]],IMPORT_REFERENCE_CONFLICT:[['Description 與 Cust no 的原進口資訊衝突或不明；原文保留，未自行選擇。',/conflicts/],['Description 的原進口段落不唯一或格式不明，原文保留待核對。',/multiple or unrecognized/]]};
  for(const [code,entries]of Object.entries(issueVariants))for(const [message,pattern]of entries)assert.match(english(issueMessage({code,message})),pattern);
  const archiveMessages=[...parser.matchAll(/fail\('([^']+)'\)/g)].map(m=>m[1]);
  assert.equal(new Set(archiveMessages.map(message=>english(errorMessage({code:'UNSAFE_ARCHIVE',message})))).size,new Set(archiveMessages).size);
});
test('origin display covers every emitted status without hiding uncertainty',()=>{
  const statuses=['same','different','unavailable','unmatched','ambiguous','missing-origin','unverified-source'];
  for(const status of statuses){assert.ok(parser.includes("'"+status+"'"));english(originMessage({status,message:'來源訊息'}));}
  assert.match(originMessage({status:'different'}),/Invoice value is retained; only its origin cell is highlighted/);
  assert.match(originMessage({status:'ambiguous'}),/No origin difference was inferred/);
  assert.match(originMessage({status:'missing-origin'}),/without filling the gap/);
  assert.match(originMessage({status:'unverified-source'}),/no confirmed difference/);
  assert.match(english(originMessage({status:'future'})),/not confirmed/);
});
test('unknown Chinese errors use actionable English and only a bounded diagnostic code',()=>{
  for(const message of ['內部錯誤','Error at 私人檔案.xlsx','𠀀']){
    assert.match(english(errorMessage({code:'NEW_SOURCE_ERROR',message})),/NEW_SOURCE_ERROR/);
    english(issueMessage({code:'NEW_SOURCE_WARNING',message}));
  }
  for(const code of ['私人.xlsx','<script>alert(1)</script>','A'.repeat(49),'private/file.xlsx']){
    assert.ok(!english(errorMessage({code,message:'錯誤'})).includes(code));
    assert.ok(!english(issueMessage({code,message:'警告'})).includes(code));
  }
  for(const input of [null,undefined,{},42]){english(errorMessage(input));english(issueMessage(input));english(originMessage(input));}
  for(const code of ['constructor','toString','__proto__'])english(errorMessage({code,message:'錯誤'}));
  assert.equal(errorMessage(new Error('The file could not be opened.')),'The file could not be opened.');
  assert.equal(errorMessage('Please choose a file.'),'Please choose a file.');
  assert.equal(issueMessage({message:'Check Sheet One!E2.'}),'Check Sheet One!E2.');
});
function freeze(value){if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.freeze(value);for(const nested of Object.values(value))freeze(nested);}return value;}
test('English display leaves source text, warnings, model and complete exported workbook unchanged',()=>{
  const source=XLSX.utils.book_new();
  const description='  TEST  商品\nExact source spacing  ';
  XLSX.utils.book_append_sheet(source,XLSX.utils.aoa_to_sheet([
    ['No.','SKU','Description','Item weight (KGM)','Country of Origin','Qty','Unit of measure','Unit Price(USD)','Total Amount(USD)'],
    [1,'00000001',description,0,' 法國 ',2,'PC',3,6]
  ]),'來源 Invoice');
  const model=parseExport92Workbook(source,'原始  檔案.xlsx');
  const before=structuredClone(model),outputBefore=buildExport92Workbook(model,XLSX);
  freeze(model);
  for(const issue of model.issues)english(issueMessage(issue));
  for(const row of model.rows)english(originMessage(row.originComparison));
  errorMessage(freeze({code:'EXPORT_BLOCKED',message:'先核對',source:model.sourceName}));
  assert.deepEqual(model,before);
  assert.deepEqual(buildExport92Workbook(model,XLSX),outputBefore);
  assert.equal(model.rows[0].description,description);
  assert.equal(model.rows[0].origin,' 法國 ');
  assert.equal(model.sourceName,'原始  檔案.xlsx');
  assert.equal(model.sourceSheet,'來源 Invoice');
  assert.ok(model.issues.every(issue=>/\p{Script=Han}/u.test(issue.message)));
  assert.equal(outputBefore.Sheets['工作表1'].I2.v,description);
  assert.equal(outputBefore.Sheets['工作表1'].A1.v,'報關日期');
  assert.equal(outputBefore.Sheets['工作表1'].Q2.v,'92');
});
test('optional English header labels are immutable display-only strings in the original 17 positions',()=>{
  assert.equal(ENGLISH_PREVIEW_HEADERS.length,17);
  for(const label of ENGLISH_PREVIEW_HEADERS){assert.equal(typeof label,'string');assert.doesNotMatch(label,/\p{Script=Han}/u);}
  assert.equal(ENGLISH_PREVIEW_HEADERS[5],'Country of origin');
  assert.equal(ENGLISH_PREVIEW_HEADERS[11],'Unit price');
  assert.equal(ENGLISH_PREVIEW_HEADERS[14],'Net weight');
  assert.ok(Object.isFrozen(ENGLISH_PREVIEW_HEADERS));
  assert.notEqual(ENGLISH_PREVIEW_HEADERS,EXPORT92_HEADERS);
  assert.equal(EXPORT92_HEADERS[5],'生產國別');
});
