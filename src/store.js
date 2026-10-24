const electron = require('electron');
const app = electron && electron.app;
const safeStorage = electron && electron.safeStorage;
const fs = require('fs');
const path = require('path');
const os = require('os');

const dir = () => {
  if (app && typeof app.getPath === 'function') {
    try {
      return app.getPath('userData');
    } catch (_) {}
  }
  return path.join(__dirname, '..', '.data');
};
const file = (n) => path.join(dir(), n);

function readJson(name, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file(name), 'utf8'));
  } catch {
    return fallback;
  }
}
function writeJson(name, data) {
  fs.mkdirSync(dir(), { recursive: true });
  fs.writeFileSync(file(name), JSON.stringify(data, null, 2), 'utf8');
}

// ---- secrets (Gmail app password, Mercedes password) are encrypted with the OS keychain ----
function setSecret(key, value) {
  const all = readJson('secrets.json', {});
  if (!value) delete all[key];
  else if (safeStorage && safeStorage.isEncryptionAvailable && safeStorage.isEncryptionAvailable()) {
    all[key] = { enc: safeStorage.encryptString(value).toString('base64') };
  } else {
    all[key] = { plain: Buffer.from(value, 'utf8').toString('base64') };
  }
  writeJson('secrets.json', all);
}
function getSecret(key) {
  const e = readJson('secrets.json', {})[key];
  if (!e) return '';
  if (e.enc && safeStorage && safeStorage.decryptString) {
    return safeStorage.decryptString(Buffer.from(e.enc, 'base64'));
  }
  return Buffer.from(e.plain || '', 'base64').toString('utf8');
}
function hasSecret(key) {
  return !!readJson('secrets.json', {})[key];
}

// ---- settings ----
const DEFAULT_SETTINGS = {
  businessName: 'IQ Motors',
  vatNumber: '228706791',
  gmailAddress: '',
  emailSubject: 'Your invoice {{number}} from IQ Motors',
  emailBody:
    'Dear {{name}},\n\nPlease find attached invoice {{number}} for {{reg}}.\n\nTotal due: {{total}}\n\nKind regards,\nIQ Motors\nTel: 020 8579 9955',
  nextInvoiceNumber: 2007334,
  saveFolder: '',
};
const getSettings = () => ({ ...DEFAULT_SETTINGS, ...readJson('settings.json', {}) });
const saveSettings = (s) => {
  writeJson('settings.json', { ...getSettings(), ...s });
  return getSettings();
};

// ---- customers ----
const getCustomers = () => readJson('customers.json', []);
function upsertCustomer(c) {
  if (!c || !c.name) return;
  const list = getCustomers();
  const i = list.findIndex((x) => x.name.toLowerCase() === c.name.toLowerCase());
  const rec = { name: c.name, email: c.email || '', phone: c.phone || '' };
  if (i >= 0) list[i] = rec;
  else list.push(rec);
  writeJson('customers.json', list);
}

// ---- invoices ----
const getInvoices = () => readJson('invoices.json', []);
function saveInvoice(inv) {
  const list = getInvoices();
  const i = list.findIndex((x) => x.number === inv.number);
  if (i >= 0) list[i] = inv;
  else list.unshift(inv);
  writeJson('invoices.json', list);

  // Auto-cache valid parts from saved invoice
  if (Array.isArray(inv.parts)) {
    inv.parts.forEach((p) => {
      if (p.partNumber && p.price && Number(p.price) > 0) {
        setCachedPart(p.partNumber, { name: p.description || '', price: Number(p.price) });
      }
    });
  }
}
function takeNextInvoiceNumber() {
  const s = getSettings();
  return String(s.nextInvoiceNumber);
}
function bumpInvoiceNumber(used) {
  const s = getSettings();
  const n = Number(used);
  if (Number.isFinite(n) && n >= s.nextInvoiceNumber) saveSettings({ nextInvoiceNumber: n + 1 });
}

// ---- parts cache ----
const getPartsCache = () => readJson('parts-cache.json', {});
function getCachedPart(pn) {
  if (!pn) return null;
  const key = String(pn).replace(/\s+/g, '').toUpperCase();
  const cache = getPartsCache();
  const item = cache[key];
  if (!item) return null;

  // Purge invalid entries (e.g. no price or scraped landing text like "Welcome!")
  const price = Number(item.price);
  const isInvalidName = !item.name || /welcome|login|sign in|b2b connect|cookie/i.test(item.name);
  if (!price || price <= 0 || isInvalidName) {
    delete cache[key];
    writeJson('parts-cache.json', cache);
    return null;
  }
  // Fix temporary minor-unit (pence) cached entry for A0008280388
  if (key === 'A0008280388' && price === 810) {
    item.price = 8.10;
    cache[key].price = 8.10;
    writeJson('parts-cache.json', cache);
  }
  return item;
}
function setCachedPart(pn, data) {
  if (!pn || !data) return;
  const numPrice = Number(data.price);
  if (!numPrice || numPrice <= 0) return; // Never cache without a valid positive price

  const rawName = String(data.name || '').trim();
  if (/welcome|login|sign in|b2b connect|cookie/i.test(rawName)) return;

  const cache = getPartsCache();
  const key = String(pn).replace(/\s+/g, '').toUpperCase();
  cache[key] = {
    name: rawName,
    price: Math.round((numPrice + Number.EPSILON) * 100) / 100,
    updatedAt: new Date().toISOString()
  };
  writeJson('parts-cache.json', cache);
}

module.exports = {
  getSettings, saveSettings, setSecret, getSecret, hasSecret,
  getCustomers, upsertCustomer, getInvoices, saveInvoice, takeNextInvoiceNumber, bumpInvoiceNumber,
  getPartsCache, getCachedPart, setCachedPart,
};
