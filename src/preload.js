const { contextBridge, ipcRenderer } = require('electron');

const call = (ch) => (...a) => ipcRenderer.invoke(ch, ...a);

contextBridge.exposeInMainWorld('api', {
  getSettings: call('settings:get'),
  saveSettings: call('settings:save'),
  setSecret: call('secret:set'),
  hasSecret: call('secret:has'),
  testEmail: call('email:test'),
  chooseFolder: call('folder:choose'),
  getCustomers: call('customers:get'),
  getInvoices: call('invoices:get'),
  nextNumber: call('invoice:next-number'),
  savePdf: call('invoice:save-pdf'),
  saveAndSend: call('invoice:save-send'),
  openFile: call('file:open'),
  lookupPart: call('part:lookup'),
  openMercedes: call('mercedes:open'),
  getMercedesStatus: call('mercedes:status'),
  onInsertPart: (cb) => ipcRenderer.on('part:insert', (_e, data) => cb(data)),
});
