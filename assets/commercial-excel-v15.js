import { productPhotoSkus } from './commercial-photo-v15.js';
import { preserveKeyCategory } from './invoice-classification-v15.js';
/** Local-only commercial invoice table adapter. Images are never sent or interpreted. */
const text = value => value == null ? '' : String(value).trim();
const canonical = value => text(value).toLowerCase().replace(/\s+/g,' ');
const headers = ['Carton ID','Commercial Invoice','Shipto','Item Name','Item Description','Product Family Group','Product Description','Shipped Qty','Unit Price','Extended Merch Line Value','Unit Freight','Extended Freight Line Value','Total Line Value','Item Weight Grams','Item COO','HTS','HAWB'];
const required = ['hts','sku','description','origin','quantity','unit cost (usd)','extended cost (usd)'];
// User-confirmed unit corrections: opaque file + row SHA-256 digests only.
// Neither a filename nor a similar number can activate a correction.
const confirmedKg = new Map([["e7a646fe23dc3957370c958ee7648fd8237abf913f91528106211ec32a69d49c",["426e375d29df9d9854bc6432ea2f2a3162e7117b5a586411e316b43397335680","efacd841e384b34ca738d381541e8b6cb492f83672b45556f014ebf57ee79c98"]]]);
export async function digest(bytes) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
}
export async function rowDigest(sheet,row,values) {
  return digest(new TextEncoder().encode(JSON.stringify([sheet,row,values])));
}
function numeric(value,label) {
  if(typeof value==='string' && !/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(value.trim())) throw Error(`Commercial invoice: invalid ${label}.`);
  const n=typeof value==='number'?value:Number(text(value).replace(/,/g,''));
  if(value==null || text(value)==='' || !Number.isFinite(n) || n<0) throw Error(`Commercial invoice: invalid ${label}.`);
  return n;
}
export async function adaptCommercialWorkbook(workbook,bytes,xlsx,corrections=confirmedKg) {
  const candidates=[];
  for(const name of workbook.SheetNames) {
    const rows=xlsx.utils.sheet_to_json(workbook.Sheets[name],{header:1,raw:true,defval:null});
    for(let index=0;index<rows.length;index++) {
      const cols=rows[index].map(canonical);
      if(required.every(h=>cols.includes(h))) candidates.push({name,rows,index,cols});
    }
  }
  if(!candidates.length) return null;
  if(candidates.length!==1) throw Error('Commercial invoice: multiple data tables need separate source files.');
  const {name,rows,index,cols}=candidates[0];
  if(required.some(h=>cols.filter(c=>c===h).length!==1)) throw Error('Commercial invoice: duplicate column headers.');
  const weights=cols.map((h,i)=>({h,i,m:h.match(/^unit weight \((gm|g|grams|kg|kilograms)\)$/)})).filter(v=>v.m);
  if(weights.length!==1) throw Error('Commercial invoice: an explicit, unambiguous weight unit is required.');
  const weight=weights[0], declaredKg=/^(kg|kilograms)$/.test(weight.m[1]);
  const metadata=label=>{
    const values=[];
    for(const row of rows.slice(0,index)) row.forEach((v,i)=>{if(label.test(text(v))) {const next=row.slice(i+1).find(v=>text(v)!=='');if(next!=null) values.push(text(next));}});
    const unique=[...new Set(values)]; if(unique.length>1) throw Error('Commercial invoice: conflicting metadata.'); return unique[0]||'';
  };
  const invoice=metadata(/^commercial invoice\s*[:#]?\s*$/i),hawb=metadata(/^hawb\s*[:#]?\s*$/i);
  if(!invoice) throw Error('Commercial invoice: invoice number is missing.');
  const fileHash=await digest(bytes), approved=new Set(corrections.get(fileHash)||[]), table=[headers],evidence=[],totals=[];
  let qtySum=0,valueSum=0;
  const at=(row,h)=>row[cols.indexOf(h)];
  for(let i=index+1;i<rows.length;i++) {
    const row=rows[i]; if(row.every(v=>text(v)===''))continue;
    if(row.some(v=>/^total\s*:?$/i.test(text(v)))) {
      if(text(at(row,'sku'))) throw Error('Commercial invoice: total row contains an item identity.');
      totals.push([numeric(at(row,'quantity'),'total quantity'),numeric(at(row,'extended cost (usd)'),'total amount')]);continue;
    }
    if(totals.length) throw Error('Commercial invoice: unexpected content after totals.');
    const sku=text(at(row,'sku')),desc=text(at(row,'description')),origin=text(at(row,'origin')).toUpperCase(),hts=text(at(row,'hts'));
    if(!sku || !desc || !origin || !hts)throw Error('Commercial invoice: incomplete item row.');
    const qty=numeric(at(row,'quantity'),'quantity'),price=numeric(at(row,'unit cost (usd)'),'unit cost'),extended=numeric(at(row,'extended cost (usd)'),'extended cost'),rawWeight=numeric(row[weight.i],'unit weight');
    if(qty<=0 || rawWeight<=0)throw Error('Commercial invoice: quantity and weight must be positive.');
    if(Math.abs(Math.round(qty*price*100)/100-extended)>.005)throw Error('Commercial invoice: printed item cost does not reconcile.');
    const fingerprint=await rowDigest(name,i+1,row), corrected=approved.has(fingerprint),kg=declaredKg||corrected;
    const product=desc.match(/^(Key|Brooch|Earrings|Ring|Bracelet|Necklace|Pendant)\s*[-:]/i)?.[1];
    const category=preserveKeyCategory(desc,product?product[0].toUpperCase()+product.slice(1).toLowerCase():'');
    table.push(['',invoice,'',sku,desc,'',category,qty,price,extended,0,0,extended,kg?rawWeight*1000:rawWeight,origin==='USA'?'US':origin,hts,hawb]);
    evidence.push([name,i+1,sku,weight.h,row[weight.i],kg?'kg':'g',corrected?'User-confirmed unit correction, exact file and row fingerprint':'Explicit source header',fileHash,fingerprint,'No freight shown; no additional charge added']);
    qtySum+=qty;valueSum+=extended;
  }
  if(table.length===1 || !totals.length)throw Error('Commercial invoice: item rows and printed totals are required.');
  if(totals.some(([qty,value])=>Math.abs(qty-qtySum)>1e-8||Math.abs(value-valueSum)>.005))throw Error('Commercial invoice: printed document totals do not reconcile.');
  if(approved.size && evidence.filter(r=>r[6].startsWith('User-confirmed')).length!==approved.size)throw Error('Commercial invoice: confirmed weight rows do not match.');
  const photoSkus=await productPhotoSkus(bytes,workbook,xlsx,invoice,new Set(table.slice(1).map(row=>row[3])));
  const normalized=xlsx.utils.book_new();xlsx.utils.book_append_sheet(normalized,xlsx.utils.aoa_to_sheet(table),'Commercial invoice');
  return {bytes:xlsx.write(normalized,{type:'array',bookType:'xlsx'}),evidence,photoSkus:[...photoSkus],sheet:name,headerRow:index+1};
}
