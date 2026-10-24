# IQ Motors POS

A desktop Point of Sale (POS) and invoicing application tailored for automotive workshops. Built with Electron, it features automatic VAT calculations, PDF generation, direct Gmail customer invoicing, and silent background Mercedes-Benz genuine parts & List Price (LP) lookup.

---

## Features

- **Automated Invoicing & VAT Calculations**:
  - Automatically calculates **20% VAT on parts only** (labour is VAT-free).
  - Real-time subtotal and total calculations.
- **Mercedes-Benz B2B Catalog Integration**:
  - Automatically searches `https://b2bconnect.mercedes-benz.com/gb/catalog` in the background.
  - Fetches the real part name and exact List Price (LP).
  - Caches previously looked-up parts for instant offline retrieval.
- **Invoice PDF Generation**:
  - Generates high-quality branded garage invoices.
  - Automatically saves PDFs to `Documents/IQ Motors Invoices/`.
- **Customer Email Dispatch**:
  - Secure Gmail SMTP integration with OS keychain secret storage.
  - One-click "Save PDF & email to customer".
- **Customer Auto-complete & Invoice History**:
  - Tracks previous customers and vehicle registrations for instant autofill.
  - Searchable invoice history with one-click PDF viewing.

---

## Project Structure

```text
├── assets/                  # Brand assets (logo, footer graphics)
├── build/                   # App icons for Windows (.ico) & Mac (.icns)
├── src/
│   ├── main.js              # Electron main process & IPC handlers
│   ├── preload.js           # Context isolation bridge
│   ├── calc.js              # VAT (20% on parts) calculation engine
│   ├── store.js             # Local JSON store & safeStorage keychain
│   ├── mercedes.js          # Mercedes B2B Connect background search & parser
│   ├── pdf.js               # PDF generator
│   ├── mailer.js            # Nodemailer Gmail transport
│   ├── invoiceTemplate.js   # HTML invoice print layout
│   └── renderer/            # Frontend UI (HTML, CSS, JS)
├── scripts/
│   ├── test-all.js          # Automated verification test suite
│   └── sample-pdf.js        # Standalone PDF generation test
├── .github/workflows/       # GitHub Actions CI for cross-platform installers
├── CLIENT_README.txt        # End-user quick start guide for clients
└── package.json
```

---

## Development & Testing

### 1. Install Dependencies
```bash
npm install
```

### 2. Run Test Suite
```bash
npm test
```

### 3. Start Development Desktop App
```bash
npm start
```

---

## Building Installers

### Automated Cloud Build (Windows & Mac)
Push your code to the `main` branch on GitHub. The GitHub Actions workflow in `.github/workflows/build.yml` will automatically build and publish:
- `IQ-Motors-POS-Setup-1.0.0.exe` (Windows NSIS Installer)
- `IQ-Motors-POS-Setup-1.0.0.dmg` (macOS Universal Disk Image)

### Local Build (macOS)
```bash
npm run dist:mac
```

---

## Client Distribution

Refer to [`CLIENT_README.txt`](./CLIENT_README.txt) for instructions to send to your end-user client.
