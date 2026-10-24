const nodemailer = require('nodemailer');
const path = require('path');

function transport(address, appPassword) {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user: address, pass: appPassword.replace(/\s+/g, '') },
  });
}

const fill = (tpl, vars) => String(tpl || '').replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '');

async function verifyEmail(address, appPassword) {
  await transport(address, appPassword).verify();
  return true;
}

async function sendInvoiceEmail({ address, appPassword, to, subject, body, pdfPath, vars }) {
  const info = await transport(address, appPassword).sendMail({
    from: `"IQ Motors" <${address}>`,
    to,
    subject: fill(subject, vars),
    text: fill(body, vars),
    attachments: [{ filename: path.basename(pdfPath), path: pdfPath }],
  });
  return info.messageId;
}

module.exports = { verifyEmail, sendInvoiceEmail };
