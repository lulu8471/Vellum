// R15 uses checked-in, version-isolated application modules. No vendor upgrade.
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
const root=new URL('../',import.meta.url);
const names=['index-VELLUM-BOUNDED15-20261029.js','pdf-BOUNDED15-20261029.js','ocr-BOUNDED15-20261029.js',...['runtime','classification','inline','pdf','downloads','zip'].map(name=>`invoice-${name}-v15.js`),'commercial-excel-v15.js','commercial-photo-v15.js'];
for(const name of names){const url=new URL('assets/'+name,root);execFileSync(process.execPath,['--check',url.pathname]);const code=fs.readFileSync(url,'utf8');if(/(?:invoice|commercial)-[a-z-]+-v14\.js|SAFARI14-20261029/.test(code))throw Error('Mixed release graph in '+name);}
const path=new URL('index.html',root),html=fs.readFileSync(path,'utf8').replaceAll('SAFARI14-20261029','BOUNDED15-20261029').replaceAll('safari-stream-20261029-r14','bounded-ocr-20261029-r15');
if(!html.includes('bounded-ocr-20261029-r15'))throw Error('Unexpected production entry point');fs.writeFileSync(path,html);console.log('R15 syntax and isolated graph verified; entry selected.');
