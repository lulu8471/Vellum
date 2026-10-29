/** Only locally embedded, decoded colour pictures anchored to matching product rows qualify. */
const decode=value=>value.replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
const attrs=tag=>Object.fromEntries([...tag.matchAll(/([\w:.-]+)\s*=\s*["']([^"']*)["']/g)].map(m=>[m[1],decode(m[2])]));
const tags=(xml,name)=>[...xml.matchAll(new RegExp('<(?:[\\w]+:)?'+name+'\\b[^>]*>','g'))].map(m=>attrs(m[0]));
const resolve=(part,target)=>{if(!target||/^[a-z]+:|^\/|\\/i.test(target))return '';const p=part.split('/').slice(0,-1);for(const s of target.split('/')){if(s==='..'){if(!p.length)return '';p.pop();}else if(s&&s!=='.')p.push(s);}return p.join('/');};
const relPath=part=>part.replace(/([^/]+)$/,'_rels/$1.rels');
export function hasColourPixels(data,width,height) {
  if(width<32||height<32)return false;
  let opaque=0,colour=0;
  for(let i=0;i<data.length;i+=4){if(data[i+3]<128)continue;opaque++;if(Math.max(data[i],data[i+1],data[i+2])-Math.min(data[i],data[i+1],data[i+2])>5)colour++;}
  return opaque>=1024 && colour>=20 && colour/opaque>=.001;
}
export async function decodeColourImage(bytes) {
  // No remote image source, SVG, external relationship, or network request.
  const png=bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71;
  const jpeg=bytes[0]===255&&bytes[1]===216;
  if(!png&&!jpeg)return false;
  const bitmap=await createImageBitmap(new Blob([bytes],{type:png?'image/png':'image/jpeg'}));
  try{
    if(bitmap.width*bitmap.height>16_000_000)return false;
    const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
    const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(bitmap,0,0);
    return hasColourPixels(context.getImageData(0,0,canvas.width,canvas.height).data,canvas.width,canvas.height);
  }finally{bitmap.close();}
}
export async function productPhotoSkus(bytes,workbook,xlsx,invoice,allowedSkus,readColour=decodeColourImage) {
  const result=new Set();
  try {
    const archive=xlsx.CFB.read(new Uint8Array(bytes),{type:'array'}),files=new Map();let expanded=0;
    archive.FullPaths.forEach((path,i)=>{const entry=archive.FileIndex[i];if(entry.content?.length){expanded+=entry.content.length;files.set(path.replace(/^[^/]+\//,''),entry.content);}});
    if(expanded>30_000_000||files.size>1000)return result;
    const xml=path=>files.has(path)?new TextDecoder().decode(files.get(path)):'';
    const relationships=part=>new Map(tags(xml(relPath(part)),'Relationship').filter(r=>r.TargetMode!=='External').map(r=>[r.Id,{path:resolve(part,r.Target),type:r.Type}]));
    const bookRels=relationships('xl/workbook.xml');
    for(const sheet of tags(xml('xl/workbook.xml'),'sheet')){
      const ws=workbook.Sheets[sheet.name],part=bookRels.get(sheet['r:id']);if(!ws||!part?.type?.endsWith('/worksheet'))continue;
      const rows=xlsx.utils.sheet_to_json(ws,{header:1,raw:true,defval:null,range:{s:{r:0,c:0},e:xlsx.utils.decode_range(ws['!ref']||'A1').e}});
      const header=rows.findIndex(r=>r.some(v=>String(v).toLowerCase()==='sku')&&r.some(v=>String(v).toLowerCase()==='photo'));
      if(header<0)continue;
      const meta=rows.slice(0,header).flatMap(r=>r.flatMap((v,i)=>/^commercial invoice\s*[:#]?\s*$/i.test(String(v??'').trim())?[String(r.slice(i+1).find(x=>x!=null&&String(x).trim())??'').trim()]:[]));
      if(meta.length!==1||meta[0]!==invoice)continue;
      const skuCol=rows[header].findIndex(v=>String(v).toLowerCase()==='sku'),photoCol=rows[header].findIndex(v=>String(v).toLowerCase()==='photo');
      const sheetRels=relationships(part.path);
      for(const drawing of tags(xml(part.path),'drawing')){
        const target=sheetRels.get(drawing['r:id']);if(!target?.type?.endsWith('/drawing'))continue;
        const drawingRels=relationships(target.path),source=xml(target.path);
        for(const anchor of source.matchAll(/<(?:\w+:)?(?:twoCellAnchor|oneCellAnchor)\b[^>]*>([\s\S]*?)<\/(?:\w+:)?(?:twoCellAnchor|oneCellAnchor)>/g)){
          const from=anchor[1].match(/<(?:\w+:)?from>([\s\S]*?)<\/(?:\w+:)?from>/)?.[1]||'';
          const row=Number(from.match(/<(?:\w+:)?row>(\d+)</)?.[1]),col=Number(from.match(/<(?:\w+:)?col>(\d+)</)?.[1]);
          if(!Number.isInteger(row)||row<=header||col!==photoCol)continue;
          const sku=String(rows[row]?.[skuCol]??'').trim();if(!allowedSkus.has(sku))continue;
          const pictures=[...anchor[1].matchAll(/<(?:\w+:)?pic\b[^>]*>([\s\S]*?)<\/(?:\w+:)?pic>/g)];if(pictures.length!==1)continue;
          const blips=tags(pictures[0][1],'blip');if(blips.length!==1||blips[0]['r:link'])continue;
          const image=drawingRels.get(blips[0]['r:embed']);if(!image?.type?.endsWith('/image')||!/^xl\/media\//.test(image.path))continue;
          const content=files.get(image.path);if(!content||content.length>5_000_000)continue;
          try{if(await readColour(new Uint8Array(content)))result.add(sku);}catch{/* Unreadable or ambiguous images retain the original code. */}
        }
      }
    }
  }catch{/* Invalid/unsupported drawing packages never authorize an exception. */}
  return result;
}
