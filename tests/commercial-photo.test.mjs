import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bundle} from './commercial-harness.mjs';
import {productPhotoSkus,hasColourPixels} from '../assets/commercial-photo-v12.js';
const api=bundle(),x=api.xlsx;
function source({anchorRow=3,anchorCol=2,sku='12345678',photo=true,external=false,invoice='123456',media=true,orphan=false,description='Brooch-TEST product'}={}){
 const w=x.utils.book_new();x.utils.book_append_sheet(w,x.utils.aoa_to_sheet([['HAWB :','6543210'],['Commercial Invoice:','123456'],['#','HTS','SKU','Description','Origin','Unit Weight (gm)','Quantity','Unit Cost (USD)','Extended Cost (USD)'],[1,'7113.19.0000','12345678',description,'US',2,1,100,100],['','','','','Total :','',1,'',100]]),'Data');
 x.utils.book_append_sheet(w,x.utils.aoa_to_sheet([['Commercial Invoice:',invoice],[],['#','SKU',photo?'Photo':'Logo'],[1,sku],[2]]),'Pictures');
 let bytes=x.write(w,{type:'array',bookType:'xlsx'}),a=x.CFB.read(new Uint8Array(bytes),{type:'array'});
 const get=path=>a.FileIndex[a.FullPaths.indexOf('Root Entry/'+path)].content;
 const add=(path,s)=>x.CFB.utils.cfb_add(a,path,new TextEncoder().encode(s));
 const rel=(id,type,target,mode='')=>`<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${target}" ${mode}/>`;
 const wrap=r=>`<Relationships>${r}</Relationships>`;
 add('xl/worksheets/sheet2.xml',new TextDecoder().decode(get('xl/worksheets/sheet2.xml')).replace('</worksheet>','<drawing r:id="rDraw"/></worksheet>'));
 if(!orphan)add('xl/worksheets/_rels/sheet2.xml.rels',wrap(rel('rDraw','drawing','../drawings/drawing1.xml')));
 add('xl/drawings/drawing1.xml',`<xdr:wsDr><xdr:twoCellAnchor><xdr:from><xdr:col>${anchorCol}</xdr:col><xdr:row>${anchorRow}</xdr:row></xdr:from><xdr:pic><a:blip r:embed="rImg"/></xdr:pic></xdr:twoCellAnchor></xdr:wsDr>`);
 add('xl/drawings/_rels/drawing1.xml.rels',wrap(rel('rImg','image','../media/image1.png',external?'TargetMode="External"':'')));
 if(media)x.CFB.utils.cfb_add(a,'xl/media/image1.png',new Uint8Array([137,80,78,71,1]));
 bytes=x.CFB.write(a,{type:'array',fileType:'zip'});return {bytes,w};
}
async function detect(options={},colour=true){const s=source(options);return productPhotoSkus(s.bytes,s.w,x,'123456',new Set(['12345678']),async()=>colour);}
test('colour image relationship anchored to matching product Photo cell qualifies only that SKU',async()=>assert.deepEqual([...await detect()],['12345678']));
test('no image, orphan media, logo column, blank row, wrong SKU/invoice and external relationship do not qualify',async()=>{for(const options of [{media:false},{orphan:true},{photo:false},{anchorRow:4},{anchorRow:0},{anchorCol:0},{sku:'87654321'},{invoice:'654321'},{external:true}])assert.equal((await detect(options)).size,0,JSON.stringify(options));});
test('grayscale or failed decoder does not qualify product pictures',async()=>{assert.equal((await detect({},false)).size,0);const s=source();assert.equal((await productPhotoSkus(s.bytes,s.w,x,'123456',new Set(['12345678']),async()=>{throw Error('badimage')})).size,0);});
test('actual nontransparent colour pixels are required, not RGB encoding alone',()=>{const data=new Uint8ClampedArray(40*40*4);for(let i=0;i<data.length;i+=4){data[i]=data[i+1]=data[i+2]=120;data[i+3]=255;}assert.equal(hasColourPixels(data,40,40),false);for(let i=0;i<100;i++)data[i*4]=200;assert.equal(hasColourPixels(data,40,40),true);for(let i=0;i<data.length;i+=4)data[i+3]=0;assert.equal(hasColourPixels(data,40,40),false);});
test('integrated adapter and writer apply38 only to original50 with matching colour product evidence',async()=>{
 const oldBitmap=globalThis.createImageBitmap,oldDocument=globalThis.document;
 // Browser decoder/canvas seam, synthetic opaque colour pixels; relationship data is real ZIP XML.
 const pixels=new Uint8ClampedArray(40*40*4);for(let i=0;i<pixels.length;i+=4){pixels[i]=200;pixels[i+1]=50;pixels[i+2]=50;pixels[i+3]=255;}
 globalThis.createImageBitmap=async()=>({width:40,height:40,close(){}});
 globalThis.document={createElement:()=>({getContext:()=>({drawImage(){},getImageData:()=>({data:pixels})})})};
 try{for(const [options,expected]of [[{},38],[{media:false},50],[{description:'Brooch-TEST platter'},31]]){
   const s=source(options),m=await api.parse(new File([s.bytes],'synthetic.xlsx'));assert.equal(m.rows[0].code,expected);
   const w=x.read(await(await api.write(m)).arrayBuffer(),{type:'array'}),sheet=w.Sheets[w.SheetNames[0]];assert.equal(sheet.S1.v,'欄3');assert.equal(sheet.S2.v,expected);assert.equal(sheet.C2.v,'');
 }}finally{globalThis.createImageBitmap=oldBitmap;globalThis.document=oldDocument;}
});
