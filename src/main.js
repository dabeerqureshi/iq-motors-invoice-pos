const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const store = require('./store');
const { computeTotals } = require('./calc');
const { generateInvoicePdf } = require('./pdf');
const { verifyEmail, sendInvoiceEmail } = require('./mailer');
const { openMercedesPortal, getMercedesSessionStatus, lookupPart, setMainWindow } = require('./mercedes');

let mainWindow = null;

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 850,
    title: 'IQ Motors POS',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow = win;
  setMainWindow(win);
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

const pdfFolder = () => {
  const s = store.getSettings();
  const dir = s.saveFolder || path.join(app.getPath('documents'), 'IQ Motors Invoices');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
};
const safe = (s) => String(s || '').replace(/[^\w\-]+/g, '_');

async function buildPdf(invoice) {
  const settings = store.getSettings();
  const out = path.join(pdfFolder(), `Invoice_${safe(invoice.number)}_${safe(invoice.vehicle && invoice.vehicle.reg)}.pdf`);
  await generateInvoicePdf(invoice, settings, out);
  invoice.pdfPath = out;
  invoice.totals = computeTotals(invoice);
  invoice.savedAt = new Date().toISOString();
  store.saveInvoice(invoice);
  store.upsertCustomer(invoice.customer);
  store.bumpInvoiceNumber(invoice.number);
  return out;
}

ipcMain.handle('settings:get', () => store.getSettings());
ipcMain.handle('settings:save', (_e, s) => store.saveSettings(s));
ipcMain.handle('secret:set', (_e, key, value) => store.setSecret(key, value));
ipcMain.handle('secret:has', (_e, key) => store.hasSecret(key));
ipcMain.handle('customers:get', () => store.getCustomers());
ipcMain.handle('invoices:get', () => store.getInvoices());
ipcMain.handle('invoice:next-number', () => store.takeNextInvoiceNumber());
ipcMain.handle('file:open', (_e, p) => shell.openPath(p));

ipcMain.handle('folder:choose', async () => {
  const r = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] });
  return r.canceled ? '' : r.filePaths[0];
});

ipcMain.handle('email:test', async () => {
  const s = store.getSettings();
  try {
    await verifyEmail(s.gmailAddress, store.getSecret('gmailAppPassword'));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('invoice:save-pdf', async (_e, invoice) => {
  try {
    const p = await buildPdf(invoice);
    return { ok: true, path: p };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('invoice:save-send', async (_e, invoice) => {
  const s = store.getSettings();
  const to = invoice.customer && invoice.customer.email;
  if (!to) return { ok: false, error: 'Customer email is missing.' };
  if (!s.gmailAddress || !store.hasSecret('gmailAppPassword'))
    return { ok: false, error: 'Set your Gmail address and app password in Settings first.' };
  let pdf;
  try {
    pdf = await buildPdf(invoice);
  } catch (err) {
    return { ok: false, error: 'PDF failed: ' + err.message };
  }
  try {
    const t = computeTotals(invoice);
    await sendInvoiceEmail({
      address: s.gmailAddress,
      appPassword: store.getSecret('gmailAppPassword'),
      to,
      subject: s.emailSubject,
      body: s.emailBody,
      pdfPath: pdf,
      vars: {
        name: invoice.customer.name,
        number: invoice.number,
        reg: (invoice.vehicle && invoice.vehicle.reg) || '',
        total: '£' + t.total.toFixed(2),
      },
    });
    invoice.sentAt = new Date().toISOString();
    store.saveInvoice(invoice);
    return { ok: true, path: pdf, sent: true };
  } catch (err) {
    return { ok: false, path: pdf, error: 'PDF saved, but email failed: ' + err.message };
  }
});

// Mercedes B2B Connect integration
ipcMain.handle('mercedes:open', (_e, url) => {
  openMercedesPortal(url);
  return { ok: true };
});
ipcMain.handle('mercedes:status', async () => getMercedesSessionStatus());
ipcMain.handle('part:lookup', async (_e, pn) => lookupPart(pn));

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
