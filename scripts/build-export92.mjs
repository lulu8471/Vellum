// Deterministically isolate the exact existing XLSX vendor; never import or alter the normal app.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root=new URL('../',import.meta.url),read=p=>fs.readFileSync(new URL(p,root),'utf8'),write=(p,s)=>fs.writeFileSync(new URL(p,root),s);
const s=read('assets/index-VELLUM-BOUNDED15-20261029.js');
const gitHash=value=>createHash('sha1').update('blob '+Buffer.byteLength(value)+'\0').update(value).digest('hex');
if(gitHash(s)!=='06b2ad31cc4afeea3751daf657811a3f8fcc6ba5')throw Error('Original R15 app changed; inspect vendor extraction before rebuilding.');
const a=s.indexOf('var e=Object.create'),b=s.indexOf('(function(){let e=document.createElement',a),c=s.indexOf('x=s((('),d=s.indexOf(',w=u(m(),1),T=b(),E=u(C(),1),D=',c);
if(!(a>0&&b>a&&c>b&&d>c))throw Error('Vendor boundaries changed');
const header='// Copyright (C) 2012-present SheetJS LLC. Apache-2.0; see ../licenses/LICENSE-xlsx-js-style.txt.\n// Standalone packaging extracted from the existing Vellum vendor; algorithms unchanged.\n// Exact xlsx-js-style 1.2.0 / SheetJS 0.18.5 vendor from existing Vellum. No application mount, category data or OCR.\n';
write('assets/export92-xlsx.js',header+s.slice(a,b)+'var '+s.slice(c,d)+';\nconst XLSX=C(); export default XLSX;\n');
for(const p of ['assets/export92-xlsx.js','assets/export92-v1.js','assets/export92-ui.js','assets/export92-page.js'])execFileSync(process.execPath,['--check',new URL(p,root).pathname]);
let html=read('index.html');
if(!html.includes('mode-navigation.css'))html=html.replace('</head>','  <link rel="stylesheet" href="./assets/mode-navigation.css">\n  </head>');
if(!html.includes('class="vellum-mode-navigation"'))html=html.replace('<body>','<body>\n    <nav class="vellum-mode-navigation" aria-label="整理模式"><a href="./" aria-current="page">一般發票整理</a><a href="./export-92.html">Export Excel → 92 報單</a></nav>');
write('index.html',html);console.log('Independent Export92 entry prepared; original R15 app bytes unchanged.');
