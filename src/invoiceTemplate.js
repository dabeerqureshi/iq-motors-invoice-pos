const fs = require('fs');
const path = require('path');
const { computeTotals } = require('./calc');

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const money = (n) =>
  '£' + Number(n || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const asset = (name) => {
  const p = path.join(__dirname, '..', 'assets', name);
  return 'data:image/png;base64,' + fs.readFileSync(p).toString('base64');
};

function fmtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function renderInvoiceHtml(inv, settings = {}) {
  const t = computeTotals(inv);
  const labourRows = (inv.labour || [])
    .filter((l) => l.description || l.amount)
    .map(
      (l) => `<tr><td class="desc">${esc(l.description)}</td><td></td><td></td><td class="amt">${
        l.amount !== '' && l.amount != null ? money(l.amount) : ''
      }</td></tr>`
    )
    .join('');
  const partRows = (inv.parts || [])
    .filter((p) => p.description || p.price)
    .map((p) => {
      const line = (Number(p.qty) || 0) * (Number(p.price) || 0);
      return `<tr><td class="desc">${esc(p.description)}</td><td class="qty">${esc(p.qty)}</td><td class="pn">${esc(
        p.partNumber
      )}</td><td class="amt">${money(line)}</td></tr>`;
    })
    .join('');

  const vatReg = settings.vatNumber || '228706791';
  const veh = inv.vehicle || {};
  const cust = inv.customer || {};

  return `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; font-size: 10pt; color: #000; }
  .page { width: 210mm; height: 297mm; padding: 14mm 14mm 10mm 14mm; position: relative; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; }
  .head img { height: 22mm; }
  .head h1 { margin: 6mm 0 0; font-size: 26pt; letter-spacing: 1px; }
  .boxes { display: flex; justify-content: space-between; align-items: flex-start; margin-top: 22mm; }
  .box { border: 1.5px solid #000; width: 82mm; font-size: 9pt; }
  .box .title { font-weight: bold; padding: 1px 3px; }
  .box .row { display: flex; border-top: 1px solid #000; padding: 1px 3px; }
  .box .row span:first-child { width: 24mm; }
  .box .name { font-weight: bold; padding: 0 3px 2px; min-height: 9mm; }
  .box .small { padding: 0 3px; font-size: 8pt; }
  h4 { font-size: 9pt; text-decoration: underline; margin: 0; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 9pt; text-decoration: underline; padding: 0 0 4px; }
  th.r, td.amt { text-align: right; }
  td { padding: 2px 0; font-size: 9pt; vertical-align: top; }
  td.qty, th.c { text-align: center; }
  .labour { margin-top: 12mm; height: 78mm; overflow: hidden; }
  .parts { height: 78mm; overflow: hidden; }
  .labour col.a, .parts col.a { width: 48%; }
  .totals { position: absolute; right: 14mm; top: 218mm; width: 80mm; font-size: 9pt; }
  .totals .line { display: flex; justify-content: space-between; padding: 1.5px 0; }
  .totals .line span:first-child { width: 36mm; }
  .totals .sub { border-top: 1px solid #000; margin-top: 2px; padding-top: 3px; }
  .totals .tot { border-top: 1px solid #000; border-bottom: 1px solid #000; font-weight: bold; margin-top: 2px; padding: 3px 0; }
  .foot { position: absolute; left: 14mm; right: 14mm; bottom: 10mm; display: flex; align-items: flex-end; justify-content: space-between; }
  .foot img { height: 17mm; }
  .foot .vat { font-size: 10pt; text-decoration: underline; align-self: center; margin-bottom: 4mm; }
  .foot .sb { text-align: right; font-size: 10pt; line-height: 1.25; }
  </style></head><body><div class="page">
  <div class="head"><img src="${asset('logo.png')}"><h1>INVOICE</h1></div>
  <div class="boxes">
    <div class="box">
      <div class="title">CUSTOMER DETIALS</div>
      <div class="name">${esc(cust.name)}</div>
      <div class="small">${esc(cust.phone)}</div>
      <div class="small">${esc(cust.email)}</div>
      <div class="row" style="margin-top:2px"><span>DATE:</span><span>${esc(fmtDate(inv.date))}</span></div>
      <div class="row"><span>INVOICE NO:</span><span>${esc(inv.number)}</span></div>
    </div>
    <div class="box">
      <div class="title">VEHICLE DETAILS</div>
      <div class="row"><span>MAKE</span><span>${esc(veh.make)}</span></div>
      <div class="row"><span>MODEL</span><span>${esc(veh.model)}</span></div>
      <div class="row"><span><b>REG</b></span><span>${esc(veh.reg)}</span></div>
      <div class="row"><span>MILEAGE</span><span>${esc(veh.mileage)}</span></div>
    </div>
  </div>
  <div class="labour"><table>
    <colgroup><col class="a"><col style="width:16%"><col style="width:12%"><col></colgroup>
    <tr><th>DESCRIPTION OF WORK</th><th>OPER.No</th><th>Time</th><th class="r">LABOUR COST</th></tr>
    ${labourRows}
  </table></div>
  <div class="parts"><table>
    <colgroup><col class="a"><col style="width:12%"><col style="width:16%"><col></colgroup>
    <tr><th>PARTS DESCRIPTION</th><th class="c">QUANTITY</th><th>PART NUMBER</th><th class="r">PARTS COST</th></tr>
    ${partRows}
  </table></div>
  <div class="totals">
    <div class="line sub"><span>SUBTOTAL</span><span>${money(t.subtotal)}</span></div>
    <div class="line"><span>VAT @ 20%</span><span>${money(t.vat)}</span></div>
    <div class="line tot"><span>TOTAL</span><span>${money(t.total)}</span></div>
  </div>
  <div class="foot">
    <img src="${asset('footer.png')}">
    <div class="vat">V.A.T Reg NO: ${esc(vatReg)}</div>
    <div class="sb">We can update your<br>DIGITAL SERVICE BOOK<br>on Mercedes Benz System<br>(for Service History)</div>
  </div>
  </div></body></html>`;
}

module.exports = { renderInvoiceHtml };
