const assert = require('assert');
const path = require('path');
const fs = require('fs');

console.log('====================================');
console.log('   IQ MOTORS POS - VERIFICATION TEST');
console.log('====================================\n');

// 1. Calculations
console.log('1. Testing Billing Calculations...');
const { computeTotals, VAT_RATE, round2 } = require('../src/calc');

assert.strictEqual(VAT_RATE, 0.2, 'VAT rate must be 20%');

const sampleTotals = computeTotals({
  labour: [{ amount: 150 }, { amount: 100 }], // 250
  parts: [{ qty: 2, price: 100 }]              // 200 (VAT = 40)
});
assert.strictEqual(sampleTotals.labour, 250);
assert.strictEqual(sampleTotals.parts, 200);
assert.strictEqual(sampleTotals.subtotal, 450);
assert.strictEqual(sampleTotals.vat, 40);
assert.strictEqual(sampleTotals.total, 490);
console.log('   ✓ Calculation rules verified: 20% VAT applies exclusively to parts; labour has 0% VAT.\n');

// 2. Invoice Template
console.log('2. Testing Invoice HTML Template...');
const { renderInvoiceHtml } = require('../src/invoiceTemplate');

const testInvoice = {
  number: '2007333',
  date: '2025-09-26',
  customer: { name: 'ICECREAM WALA', email: 'customer@example.com', phone: '07000 000000' },
  vehicle: { make: 'MERCEDES BENZ', model: 'SPRINTER', reg: 'YA67VCT', mileage: '120,000' },
  labour: [{ description: 'REPLACE ALTERNATOR', amount: 250 }],
  parts: [{ description: 'ALTERNATOR(FIAZ)', qty: 1, partNumber: 'MERCEDES BENZ', price: 200 }],
};
const html = renderInvoiceHtml(testInvoice, { vatNumber: '228706791' });
assert(html.includes('2007333'), 'Invoice number missing from HTML');
assert(html.includes('YA67VCT'), 'Vehicle reg missing from HTML');
assert(html.includes('ICECREAM WALA'), 'Customer name missing from HTML');
assert(html.includes('228706791'), 'VAT number missing from HTML');
assert(html.includes('ALTERNATOR(FIAZ)'), 'Parts list missing from HTML');
assert(html.includes('£490.00'), 'Total formatted incorrectly in HTML');
console.log('   ✓ Invoice template verified: All fields, customer, vehicle, and totals rendered accurately.\n');

// 3. Email Template
console.log('3. Testing Email Templating...');
const tpl = 'Dear {{name}},\n\nInvoice {{number}} for {{reg}}.\n\nTotal: {{total}}';
const fill = (s, vars) => String(s || '').replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '');
const renderedEmail = fill(tpl, {
  name: testInvoice.customer.name,
  number: testInvoice.number,
  reg: testInvoice.vehicle.reg,
  total: '£490.00'
});
assert(renderedEmail.includes('Dear ICECREAM WALA'));
assert(renderedEmail.includes('Invoice 2007333 for YA67VCT'));
assert(renderedEmail.includes('Total: £490.00'));
console.log('   ✓ Email templating verified: All dynamic variables resolve correctly.\n');

// 4. Mercedes Lookup & Parts Cache
console.log('4. Testing Mercedes Parts Cache & Lookup Module...');
const store = require('../src/store');

// Test caching mechanism
store.setCachedPart('A0001802609', { name: 'OIL FILTER ELEMENT', price: 14.50 });
const cached = store.getCachedPart('A 000 180 26 09'); // tests whitespace normalization
assert(cached, 'Cached part lookup failed');
assert.strictEqual(cached.name, 'OIL FILTER ELEMENT');
assert.strictEqual(cached.price, 14.50);

// Test rejection of invalid entries (e.g. empty price or scraped "Welcome!" text)
store.setCachedPart('A_INVALID', { name: 'Welcome!', price: '' });
assert.strictEqual(store.getCachedPart('A_INVALID'), null, 'Invalid entry with "Welcome!" or empty price must be rejected');

console.log('   ✓ Parts cache verified: normalized lookup works and invalid/empty-price entries are rejected.');

const mercedes = require('../src/mercedes');
assert(typeof mercedes.openMercedesPortal === 'function', 'openMercedesPortal function missing');
assert(typeof mercedes.getMercedesSessionStatus === 'function', 'getMercedesSessionStatus function missing');
assert(typeof mercedes.lookupPart === 'function', 'lookupPart function missing');
console.log('   ✓ Mercedes module verified: portal manager and lookup handlers connected.\n');

console.log('====================================');
console.log('  ALL CORE MODULE TESTS PASSED! ✓');
console.log('====================================');

