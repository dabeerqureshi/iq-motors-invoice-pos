const { BrowserWindow } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { renderInvoiceHtml } = require('./invoiceTemplate');

// Renders the invoice HTML in a hidden window and prints it to an A4 PDF.
async function generateInvoicePdf(invoice, settings, outPath) {
  const html = renderInvoiceHtml(invoice, settings);
  const tmp = path.join(os.tmpdir(), `iqm-invoice-${Date.now()}.html`);
  fs.writeFileSync(tmp, html, 'utf8');
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: false } });
  try {
    await win.loadFile(tmp);
    const buf = await win.webContents.printToPDF({
      pageSize: 'A4',
      printBackground: true,
      margins: { marginType: 'none' },
    });
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, buf);
    return outPath;
  } finally {
    win.destroy();
    fs.unlink(tmp, () => {});
  }
}

module.exports = { generateInvoicePdf };
