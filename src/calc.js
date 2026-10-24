// Billing rules: VAT (20%) applies to PARTS only. Labour is added without VAT.
const VAT_RATE = 0.2;

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

function computeTotals(invoice) {
  const labour = (invoice.labour || []).reduce((s, l) => s + (Number(l.amount) || 0), 0);
  const parts = (invoice.parts || []).reduce(
    (s, p) => s + (Number(p.qty) || 0) * (Number(p.price) || 0),
    0
  );
  const vat = round2(parts * VAT_RATE);
  const subtotal = round2(labour + parts);
  const total = round2(subtotal + vat);
  return { labour: round2(labour), parts: round2(parts), subtotal, vat, total };
}

module.exports = { VAT_RATE, round2, computeTotals };
