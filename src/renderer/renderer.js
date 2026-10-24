const $ = (id) => document.getElementById(id);
const money = (n) => '£' + (Number(n) || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// ---------- tabs ----------
document.querySelectorAll('nav button').forEach((b) =>
  b.addEventListener('click', () => {
    document.querySelectorAll('nav button').forEach((x) => x.classList.toggle('active', x === b));
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.id === 'tab-' + b.dataset.tab));
    if (b.dataset.tab === 'history') loadHistory();
    if (b.dataset.tab === 'settings') loadSettings();
  })
);

// ---------- line rows ----------
function addLabour(desc = '', amount = '') {
  const tr = document.createElement('tr');
  tr.innerHTML = `<td><input class="l-desc"></td><td><input class="l-amt num" type="number" step="0.01" min="0"></td><td><button class="x" title="Remove">×</button></td>`;
  tr.querySelector('.l-desc').value = desc;
  tr.querySelector('.l-amt').value = amount;
  tr.querySelector('.x').onclick = () => { tr.remove(); recalc(); };
  tr.addEventListener('input', recalc);
  $('labour-table').tBodies[0].appendChild(tr);
}
function addPart(name = '', pn = '', qty = 1, price = '') {
  const tr = document.createElement('tr');
  tr.innerHTML = `<td><input class="p-desc"></td><td><input class="p-pn"></td><td><input class="p-qty num" type="number" min="1" step="1"></td><td><input class="p-price num" type="number" step="0.01" min="0"></td><td><button class="x" title="Remove">×</button></td>`;
  tr.querySelector('.p-desc').value = name;
  tr.querySelector('.p-pn').value = pn;
  tr.querySelector('.p-qty').value = qty;
  const numPrice = Number(price);
  tr.querySelector('.p-price').value = (price !== '' && !isNaN(numPrice)) ? numPrice.toFixed(2) : price;
  tr.querySelector('.x').onclick = () => { tr.remove(); recalc(); };
  tr.addEventListener('input', recalc);
  $('parts-table').tBodies[0].appendChild(tr);
}
$('add-labour').onclick = () => addLabour();
$('add-part').onclick = () => addPart();

// ---------- collect / totals ----------
function collect() {
  return {
    number: $('i-number').value.trim(),
    date: $('i-date').value,
    customer: { name: $('c-name').value.trim(), email: $('c-email').value.trim(), phone: $('c-phone').value.trim() },
    vehicle: { make: $('v-make').value.trim(), model: $('v-model').value.trim(), reg: $('v-reg').value.trim().toUpperCase(), mileage: $('v-mileage').value.trim() },
    labour: [...document.querySelectorAll('#labour-table tbody tr')].map((tr) => ({
      description: tr.querySelector('.l-desc').value.trim(),
      amount: tr.querySelector('.l-amt').value,
    })),
    parts: [...document.querySelectorAll('#parts-table tbody tr')].map((tr) => ({
      description: tr.querySelector('.p-desc').value.trim(),
      partNumber: tr.querySelector('.p-pn').value.trim(),
      qty: tr.querySelector('.p-qty').value,
      price: tr.querySelector('.p-price').value,
    })),
  };
}
function recalc() {
  const inv = collect();
  const labour = inv.labour.reduce((s, l) => s + (Number(l.amount) || 0), 0);
  const parts = inv.parts.reduce((s, p) => s + (Number(p.qty) || 0) * (Number(p.price) || 0), 0);
  const vat = r2(parts * 0.2);
  const sub = r2(labour + parts);
  $('t-labour').textContent = money(labour);
  $('t-parts').textContent = money(parts);
  $('t-sub').textContent = money(sub);
  $('t-vat').textContent = money(vat);
  $('t-total').textContent = money(sub + vat);
}
['c-name','c-email','c-phone','v-make','v-model','v-reg','v-mileage'].forEach((id) => $(id).addEventListener('input', () => {}));

// ---------- customers autofill ----------
let customers = [];
async function loadCustomers() {
  customers = await api.getCustomers();
  $('customer-list').innerHTML = customers.map((c) => `<option value="${c.name.replace(/"/g, '&quot;')}">`).join('');
}
$('c-name').addEventListener('change', () => {
  const c = customers.find((x) => x.name.toLowerCase() === $('c-name').value.trim().toLowerCase());
  if (c) { $('c-email').value = c.email; $('c-phone').value = c.phone; }
});

// ---------- new / clear ----------
async function resetForm() {
  ['c-name','c-email','c-phone','v-model','v-reg','v-mileage'].forEach((id) => ($(id).value = ''));
  $('v-make').value = 'MERCEDES BENZ';
  $('i-date').value = new Date().toISOString().slice(0, 10);
  $('i-number').value = await api.nextNumber();
  $('labour-table').tBodies[0].innerHTML = '';
  $('parts-table').tBodies[0].innerHTML = '';
  addLabour(); addPart();
  $('status').textContent = '';
  recalc();
  loadCustomers();
}
$('btn-clear').onclick = resetForm;

// ---------- validate + actions ----------
function validate(needEmail) {
  const inv = collect();
  if (!inv.customer.name) return 'Enter the customer name.';
  if (needEmail && !/^\S+@\S+\.\S+$/.test(inv.customer.email)) return 'Enter a valid customer email.';
  if (!inv.vehicle.reg) return 'Enter the vehicle registration.';
  if (!inv.labour.some((l) => l.description || l.amount) && !inv.parts.some((p) => p.description || p.price))
    return 'Add at least one work or part line.';
  return '';
}
async function run(kind) {
  const err = validate(kind === 'send');
  if (err) { $('status').textContent = err; return; }
  $('status').textContent = kind === 'send' ? 'Creating PDF and sending…' : 'Creating PDF…';
  [$('btn-pdf'), $('btn-send')].forEach((b) => (b.disabled = true));
  const res = kind === 'send' ? await api.saveAndSend(collect()) : await api.savePdf(collect());
  [$('btn-pdf'), $('btn-send')].forEach((b) => (b.disabled = false));
  if (res.ok) {
    $('status').textContent = kind === 'send' ? 'Invoice emailed to ' + $('c-email').value + '.' : 'PDF saved.';
    if (kind !== 'send') api.openFile(res.path);
    setTimeout(resetForm, 1500);
  } else {
    $('status').textContent = res.error;
    if (res.path) api.openFile(res.path);
  }
}
$('btn-pdf').onclick = () => run('pdf');
$('btn-send').onclick = () => run('send');

// ---------- Mercedes lookup ----------
if ($('mb-portal-btn')) {
  $('mb-portal-btn').onclick = () => {
    const pn = $('lookup-pn').value.trim();
    api.openMercedes(pn || undefined);
  };
}

if (api.onInsertPart) {
  api.onInsertPart((part) => {
    if (!part || !part.partNumber) return;
    const targetPn = String(part.partNumber).replace(/\s+/g, '').toUpperCase();
    const rows = document.querySelectorAll('#parts-table tbody tr');
    let updated = false;

    for (const tr of rows) {
      const pnInput = tr.querySelector('.p-pn');
      const priceInput = tr.querySelector('.p-price');
      if (pnInput && pnInput.value.replace(/\s+/g, '').toUpperCase() === targetPn) {
        if (!priceInput.value || Number(priceInput.value) <= 0) {
          priceInput.value = part.price;
          if (part.name) tr.querySelector('.p-desc').value = part.name;
          updated = true;
          break;
        }
      }
    }

    if (!updated) {
      addPart(part.name || `MERCEDES BENZ (${part.partNumber})`, part.partNumber, 1, part.price);
    }
    recalc();
    $('lookup-msg').textContent = `✓ Inserted ${part.partNumber} (£${Number(part.price).toFixed(2)}) from B2B Portal`;
    setTimeout(() => { $('lookup-msg').textContent = ''; }, 4000);
  });
}

$('lookup-btn').onclick = async () => {
  const pn = $('lookup-pn').value.trim();
  if (!pn) { $('lookup-msg').textContent = 'Enter a part number.'; return; }

  $('lookup-btn').disabled = true;
  $('lookup-msg').textContent = `Searching Mercedes catalog in background for "${pn}"…`;

  try {
    const r = await api.lookupPart(pn);
    $('lookup-btn').disabled = false;

    if (r.ok && r.price) {
      addPart(r.name || `MERCEDES BENZ (${pn.toUpperCase()})`, pn.toUpperCase(), 1, r.price);
      $('lookup-pn').value = '';
      $('lookup-msg').textContent = `✓ Added ${r.name || pn} — £${Number(r.price).toFixed(2)} (LP)`;
      setTimeout(() => { $('lookup-msg').textContent = ''; }, 6000);
      recalc();
    } else {
      $('lookup-msg').textContent = r.error || `Could not retrieve price for "${pn}".`;
      if (r.needsLogin || r.canOpenPortal) {
        const a = document.createElement('a');
        a.href = '#';
        a.textContent = r.needsLogin ? ' [Log in to Mercedes]' : ' [Open Portal]';
        a.style.color = '#007aff';
        a.style.fontWeight = '500';
        a.onclick = (e) => {
          e.preventDefault();
          api.openMercedes();
        };
        $('lookup-msg').appendChild(a);
      }
    }
  } catch (err) {
    $('lookup-btn').disabled = false;
    $('lookup-msg').textContent = 'Error: ' + err.message;
  }
};

// ---------- history ----------
async function loadHistory() {
  const list = await api.getInvoices();
  const tb = $('history-table').tBodies[0];
  tb.innerHTML = '';
  list.forEach((inv) => {
    const tr = document.createElement('tr');
    const d = inv.date ? inv.date.split('-').reverse().join('/') : '';
    tr.innerHTML = `<td></td><td>${d}</td><td></td><td></td><td class="num">${money(inv.totals && inv.totals.total)}</td><td>${inv.sentAt ? 'Yes' : ''}</td><td><button>Open PDF</button></td>`;
    tr.children[0].textContent = inv.number;
    tr.children[2].textContent = inv.customer.name;
    tr.children[3].textContent = inv.vehicle.reg;
    tr.querySelector('button').onclick = () => inv.pdfPath && api.openFile(inv.pdfPath);
    tb.appendChild(tr);
  });
}

async function updateMercedesStatus() {
  if (!$('s-mb-status')) return;
  const st = await api.getMercedesStatus();
  if (st && st.active) {
    $('s-mb-status').textContent = `✓ Logged in (active cookies: ${st.cookiesCount})`;
    $('s-mb-status').style.color = '#2e7d32';
  } else {
    $('s-mb-status').textContent = 'Not logged in yet';
    $('s-mb-status').style.color = '';
  }
}
if ($('s-mb-login')) {
  $('s-mb-login').onclick = () => {
    api.openMercedes();
    setTimeout(updateMercedesStatus, 3000);
  };
}

// ---------- settings ----------
async function loadSettings() {
  const s = await api.getSettings();
  $('s-vat').value = s.vatNumber;
  $('s-next').value = s.nextInvoiceNumber;
  $('s-folder').value = s.saveFolder;
  $('s-gmail').value = s.gmailAddress;
  $('s-subject').value = s.emailSubject;
  $('s-body').value = s.emailBody;
  $('s-apppass').value = '';
  $('s-apppass').placeholder = (await api.hasSecret('gmailAppPassword')) ? '•••• saved (type to replace)' : '16-character app password';
  updateMercedesStatus();
}
$('s-folder-btn').onclick = async () => { const f = await api.chooseFolder(); if (f) $('s-folder').value = f; };
async function saveSettingsForm() {
  await api.saveSettings({
    vatNumber: $('s-vat').value.trim(),
    nextInvoiceNumber: Number($('s-next').value) || 1,
    saveFolder: $('s-folder').value,
    gmailAddress: $('s-gmail').value.trim(),
    emailSubject: $('s-subject').value,
    emailBody: $('s-body').value,
  });
  if ($('s-apppass').value) await api.setSecret('gmailAppPassword', $('s-apppass').value);
}
$('s-save').onclick = async () => {
  await saveSettingsForm();
  $('s-msg').textContent = 'Saved.';
  loadSettings();
  resetForm();
};
$('s-test').onclick = async () => {
  await saveSettingsForm();
  $('s-test-msg').textContent = 'Testing…';
  const r = await api.testEmail();
  $('s-test-msg').textContent = r.ok ? 'Login works.' : 'Failed: ' + r.error;
};

resetForm();
