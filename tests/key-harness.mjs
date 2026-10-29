// Synthetic integration harness for the exact R13 application bundle.
// Only browser mounting is removed; parsing and XLSX writing remain unchanged.
import {webcrypto} from 'node:crypto';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {adaptCommercialWorkbook} from '../assets/commercial-excel-v13.js';
import {appendInvoiceEvidence,withoutDescriptionNotices,applySourceDescriptionPolicy} from '../assets/invoice-inline-v13.js';
import {mergeShipmentModel,appendMergeSources} from '../assets/shipment-merge-v4.js';
import {classifyInvoiceItem,reviewInvoiceDescriptions,reviewInvoiceProducts} from '../assets/invoice-classification-v13.js';
export function bundle() {
  let code=fs.readFileSync(new URL('../assets/index-VELLUM-KEY13-20261029.js',import.meta.url),'utf8');
  code=code.replace(/^(?:import[^\n]+\n)+/,'').replace(/^document.documentElement.dataset.vellumBuild=[^;]+;/,'');
  code=code.replace(/\(function\(\)\{let e=document\.createElement\(`link`\)[\s\S]*?\}\)\(\);var p=/,'var p=');
  const mount=code.lastIndexOf('(0,T.createRoot)');
  assert.ok(mount>0,'Bundle bootstrap seam changed; review test adapter');
  code=code.slice(0,mount)+';globalThis.api={parse:xe,parsePdf:be,write:Ee,xlsx:E.default};';
  const context={crypto:webcrypto,adaptCommercialWorkbook,applySourceDescriptionPolicy,withoutDescriptionNotices,appendInvoiceEvidence,mergeShipmentModel,appendMergeSources,classifyInvoiceItem,reviewInvoiceDescriptions,reviewInvoiceProducts,console,Uint8Array,ArrayBuffer,TextEncoder,TextDecoder,File,Blob,URL,setTimeout,clearTimeout,fetch:async()=>new Response(fs.readFileSync(new URL('../templates/invoice-standard.xlsx',import.meta.url)))};
  vm.createContext(context);vm.runInContext(code,context);return context.api;
}
