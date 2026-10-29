// Synthetic CSV integration tests invoke the deployed bundle's spreadsheet parser
// and workbook writer. Browser mounting is removed solely for Node test execution.
import {webcrypto} from 'node:crypto';
import {adaptCommercialWorkbook,digest,rowDigest} from '../assets/commercial-excel-v12.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {appendInvoiceEvidence,withoutDescriptionNotices,applySourceDescriptionPolicy} from '../assets/invoice-inline-v11.js';
import {mergeShipmentModel,appendMergeSources} from '../assets/shipment-merge-v4.js';
export function bundle() {
 let code=fs.readFileSync(new URL('../assets/index-VELLUM-EXCEL12-20261021.js',import.meta.url),'utf8');
 code=code.replace(/^(?:import[^\n]+\n)+/,'').replace(/^document.documentElement.dataset.vellumBuild=[^;]+;/,'');
 code=code.replace(/\(function\(\)\{let e=document\.createElement\(`link`\)[\s\S]*?\}\)\(\);var p=/,'var p=');
 const mount=code.lastIndexOf('(0,T.createRoot)');assert.ok(mount>0,'Bundle bootstrap seam changed; review test adapter');
 code=code.slice(0,mount)+';globalThis.api={parse:xe,write:Ee,xlsx:E.default};';
 const context={crypto:webcrypto,adaptCommercialWorkbook,applySourceDescriptionPolicy,withoutDescriptionNotices,appendInvoiceEvidence,mergeShipmentModel,appendMergeSources,console,Uint8Array,ArrayBuffer,TextEncoder,TextDecoder,File,Blob,URL,setTimeout,clearTimeout,fetch:async()=>new Response(fs.readFileSync(new URL('../templates/invoice-standard.xlsx',import.meta.url)))};
 vm.createContext(context);vm.runInContext(code,context);return context.api;
}
