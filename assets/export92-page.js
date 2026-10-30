import XLSX from './export92-xlsx.js';
import {readExport92,writeExport92} from './export92-v1.js';
import {mountExport92,installExport92Lifecycle} from './export92-ui.js?v=r17';
const app=mountExport92(document.getElementById('export92-root'),{XLSX,readExport92,writeExport92});
installExport92Lifecycle(app);
