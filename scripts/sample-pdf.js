// Generates a sample invoice matching the original template, for visual checking.
// Run: npx electron scripts/sample-pdf.js [outputPath]
const electron = require('electron');
const app = electron.app;
const path = require('path');
const { generateInvoicePdf } = require('../src/pdf');

if (!app) {
  console.error('scripts/sample-pdf.js must be executed with electron (e.g. npx electron scripts/sample-pdf.js)');
  process.exit(1);
}

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const out = process.argv[2] && !process.argv[2].startsWith('-') ? process.argv[2] : path.join(__dirname, '..', 'sample-invoice.pdf');
  const invoice = {
    number: '2007333',
    date: '2025-09-26',
    customer: { name: 'ICECREAM WALA', email: 'customer@example.com', phone: '07000 000000' },
    vehicle: { make: 'MERCEDES BENZ', model: 'SPRINTER', reg: 'YA67VCT', mileage: '' },
    labour: [{ description: 'REPLACE ALTERNATOR', amount: 250 }],
    parts: [{ description: 'ALTERNATOR(FIAZ)', qty: 1, partNumber: 'MERCEDES BENZ', price: 200 }],
  };
  await generateInvoicePdf(invoice, { vatNumber: '228706791' }, out);
  console.log('WROTE', out);
  app.quit();
});
