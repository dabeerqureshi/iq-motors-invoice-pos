const electron = require('electron');
const BrowserWindow = electron && electron.BrowserWindow;
const session = electron && electron.session;
const clipboard = electron && electron.clipboard;
const store = require('./store');

const MERCEDES_CATALOG_URL = 'https://b2bconnect.mercedes-benz.com/gb/catalog';
const PARTITION = 'persist:mercedes';

let portalWindow = null;
let mainAppWindow = null;

function setMainWindow(win) {
  mainAppWindow = win;
}

// Opens the visible Mercedes portal window for manual inspection or first-time login
function openMercedesPortal(customUrl) {
  const targetUrl = customUrl || MERCEDES_CATALOG_URL;

  if (portalWindow && !portalWindow.isDestroyed()) {
    portalWindow.show();
    portalWindow.focus();
    if (customUrl && portalWindow.webContents.getURL() !== targetUrl) {
      portalWindow.loadURL(targetUrl);
    }
    return portalWindow;
  }

  if (!BrowserWindow) return null;

  portalWindow = new BrowserWindow({
    width: 1300,
    height: 900,
    title: 'Mercedes-Benz B2B Connect',
    webPreferences: {
      partition: PARTITION,
      nodeIntegration: false,
      contextIsolation: false,
    },
  });

  portalWindow.loadURL(targetUrl);

  portalWindow.on('closed', () => {
    portalWindow = null;
  });

  return portalWindow;
}

async function getMercedesSessionStatus() {
  if (!session) return { active: false, cookiesCount: 0 };
  const mbSession = session.fromPartition(PARTITION);
  try {
    const cookies = await mbSession.cookies.get({ domain: 'mercedes-benz.com' });
    const hasCookies = Boolean(cookies && cookies.length > 0);
    return { active: hasCookies, cookiesCount: cookies ? cookies.length : 0 };
  } catch (err) {
    return { active: false, error: err.message };
  }
}

// 100% Background search on https://b2bconnect.mercedes-benz.com/gb/catalog
async function lookupPart(rawPartNumber) {
  if (!rawPartNumber) {
    return { ok: false, error: 'Enter a part number.' };
  }

  const cleanPn = String(rawPartNumber).trim().replace(/\s+/g, '').toUpperCase();

  // 1. Check local cache first for instant retrieval
  const cached = store.getCachedPart(cleanPn);
  if (cached && typeof cached.price === 'number' && cached.price > 0) {
    return { ok: true, name: cached.name || `MERCEDES BENZ (${cleanPn})`, price: cached.price, source: 'cache' };
  }

  // 2. If user already has portal window open, check if the search result is already on screen
  if (portalWindow && !portalWindow.isDestroyed()) {
    try {
      const activeScan = await portalWindow.webContents.executeJavaScript(`
        (() => {
          const body = document.body ? document.body.innerText : '';
          const lines = body.split('\\n').map(l => l.trim()).filter(Boolean);

          let price = null;
          const lpIndex = lines.findIndex(l => /^LP[:\\s]*$/i.test(l) || /^LP:/i.test(l) || l.includes('LP:'));
          if (lpIndex >= 0) {
            for (let i = lpIndex; i <= Math.min(lpIndex + 3, lines.length - 1); i++) {
              const m = lines[i].match(/([0-9]+\\.[0-9]{2})/);
              if (m) { price = parseFloat(m[1]); break; }
            }
          }
          if (!price) {
            const m = body.match(/LP[:\\s\\n]+([0-9]+(?:\\.[0-9]{2}))/i);
            if (m) price = parseFloat(m[1]);
          }

          let name = '';
          const npIndex = lines.findIndex(l => /^NP[:\\s]*$/i.test(l) || /^NP:/i.test(l) || l.includes('NP:'));
          const targetIdx = npIndex > 0 ? npIndex : lpIndex;
          if (targetIdx > 0) {
            for (let i = targetIdx - 1; i >= Math.max(0, targetIdx - 3); i--) {
              const candidate = lines[i];
              if (candidate && !/part number|model|vin|recent|search|basket|options/i.test(candidate)) {
                name = candidate;
                break;
              }
            }
          }

          if (price !== null && price > 0) {
            return { name: name || 'MERCEDES BENZ (${cleanPn})', price: price };
          }
          return null;
        })()
      `);

      if (activeScan && typeof activeScan.price === 'number' && activeScan.price > 0) {
        store.setCachedPart(cleanPn, { name: activeScan.name, price: activeScan.price });
        return { ok: true, name: activeScan.name, price: activeScan.price, source: 'mercedes-active-view' };
      }
    } catch (_) {}
  }

  if (!BrowserWindow) {
    return { ok: false, error: 'BrowserWindow unavailable.' };
  }

  // 2. Launch background search window
  return new Promise((resolve) => {
    const bgWin = new BrowserWindow({
      width: 1400,
      height: 900,
      show: false, // 100% silent background window
      webPreferences: {
        partition: PARTITION,
        nodeIntegration: false,
        contextIsolation: false,
      },
    });

    let finished = false;
    const finish = (res) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeoutId);
      if (bgWin && !bgWin.isDestroyed()) {
        bgWin.destroy();
      }
      resolve(res);
    };

    // 30-second timeout
    const timeoutId = setTimeout(() => {
      finish({
        ok: false,
        error: `Background search timed out for "${cleanPn}". Open Mercedes B2B to verify connection or login.`,
        canOpenPortal: true,
      });
    }, 30000);

    bgWin.webContents.on('console-message', (_e, _level, message) => {
      if (message && message.startsWith('[Mercedes')) {
        console.log(message);
      }
    });

    bgWin.webContents.on('did-finish-load', async () => {
      try {
        const currentUrl = bgWin.webContents.getURL();

        // Check if redirected to login
        const isAuth = /login|signin|ciam|auth|sso/i.test(currentUrl);
        if (isAuth) {
          openMercedesPortal(MERCEDES_CATALOG_URL);
          finish({
            ok: false,
            error: 'Mercedes login required. Please sign in to Mercedes B2B in the opened window.',
            needsLogin: true,
          });
          return;
        }

        // Wait 2s for Angular catalog to mount
        await new Promise((r) => setTimeout(r, 2000));
        if (bgWin.isDestroyed()) return;

        // Inject API interception & trigger search in the "Part number or name" field
        const setupResult = await bgWin.webContents.executeJavaScript(`
          (() => {
            const targetPn = "${cleanPn}";

            // 1. Setup API / fetch interception to catch catalog JSON responses
            if (!window.__mb_intercepted) {
              window.__mb_intercepted = true;
              window.__mb_responses = [];

              const origFetch = window.fetch;
              window.fetch = async (...args) => {
                const res = await origFetch(...args);
                try {
                  const clone = res.clone();
                  const data = await clone.json();
                  if (data) window.__mb_responses.push(data);
                } catch (_) {}
                return res;
              };

              const origOpen = XMLHttpRequest.prototype.open;
              const origSend = XMLHttpRequest.prototype.send;
              XMLHttpRequest.prototype.open = function(...args) {
                this._url = args[1];
                return origOpen.apply(this, args);
              };
              XMLHttpRequest.prototype.send = function(...args) {
                this.addEventListener('load', function() {
                  try {
                    const data = JSON.parse(this.responseText);
                    if (data) window.__mb_responses.push(data);
                  } catch (_) {}
                });
                return origSend.apply(this, args);
              };
            }

            // 2. Check for login
            const bodyText = document.body ? document.body.innerText : '';
            if (bodyText.includes('Log in') && !bodyText.includes('Log out')) {
              return { isLogin: true };
            }

            // 3. Find input for "Part number or name"
            // Note: In hidden windows, never use offsetParent === null
            const allInputs = Array.from(document.querySelectorAll('input')).filter(el => {
              return el.type !== 'hidden' && el.type !== 'checkbox' && el.type !== 'radio';
            });

            let partInput = allInputs.find(el => {
              const ph = (el.placeholder || '').toLowerCase();
              const name = (el.name || '').toLowerCase();
              const aria = (el.getAttribute('aria-label') || '').toLowerCase();
              return ph.includes('part number') || ph.includes('part') || aria.includes('part number') || name.includes('part');
            });

            // As shown in https://b2bconnect.mercedes-benz.com/gb/catalog screenshot:
            // Input 0: "Model or VIN", Input 1: "Part number or name"
            if (!partInput && allInputs.length >= 2) {
              partInput = allInputs[1];
            } else if (!partInput && allInputs.length === 1) {
              partInput = allInputs[0];
            }

            if (!partInput) {
              return { error: 'Could not locate Part Number search input on catalog page.' };
            }

            // 4. Fill in part number using framework-compatible setter (Angular / React)
            partInput.focus();
            const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
            if (nativeSetter) {
              nativeSetter.call(partInput, targetPn);
            } else {
              partInput.value = targetPn;
            }

            partInput.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
            partInput.dispatchEvent(new Event('change', { bubbles: true, composed: true }));

            // 5. Find and click the blue "Search" button
            const buttons = Array.from(document.querySelectorAll('button'));
            const searchBtn = buttons.find(b => {
              const t = (b.innerText || b.textContent || '').trim().toLowerCase();
              return t === 'search' || t.startsWith('search');
            }) || document.querySelector('button[type="submit"], button.search-button, button.mat-raised-button');

            if (searchBtn) {
              searchBtn.removeAttribute('disabled');
              searchBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
              searchBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
              searchBtn.click();
            }

            // Also send Enter key on input to guarantee form submission
            partInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
            partInput.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));

            return { triggered: true };
          })()
        `);

        if (setupResult && setupResult.isLogin) {
          openMercedesPortal(MERCEDES_CATALOG_URL);
          finish({
            ok: false,
            error: 'Mercedes login required. Please sign in to Mercedes B2B in the opened window.',
            needsLogin: true,
          });
          return;
        }

        // Poll for search results in the background DOM or intercepted network responses
        const maxPolls = 25; // 25 * 600ms = 15 seconds
        for (let p = 0; p < maxPolls; p++) {
          await new Promise((r) => setTimeout(r, 600));
          if (bgWin.isDestroyed()) return;

          const extraction = await bgWin.webContents.executeJavaScript(`
            (() => {
              const clean = "${cleanPn}";
              const regex = new RegExp(clean.split('').join('\\\\s*'), 'i');

              // Prioritize rendered DOM using exact Mercedes B2B layout
              const body = document.body ? document.body.innerText : '';
              const lines = body.split('\\n').map(l => l.trim()).filter(Boolean);

              // 1. Locate LP: (List Price)
              let price = null;
              const lpIndex = lines.findIndex(l => /^LP[:\\s]*$/i.test(l) || /^LP:/i.test(l) || l === 'LP');
              if (lpIndex >= 0) {
                for (let i = lpIndex; i <= Math.min(lpIndex + 3, lines.length - 1); i++) {
                  const m = lines[i].match(/([0-9]+\\.[0-9]{2})/);
                  if (m) { price = parseFloat(m[1]); break; }
                }
              }

              if (!price) {
                const lpMatch = body.match(/LP[:\\s\\n]+([0-9]+(?:\\.[0-9]{2}))/i) ||
                                body.match(/([0-9]+\\.[0-9]{2})\\s*£/);
                if (lpMatch) price = parseFloat(lpMatch[1]);
              }

              // 2. Locate Part Name (directly precedes NP: or LP:)
              let name = '';
              const npIndex = lines.findIndex(l => /^NP[:\\s]*$/i.test(l) || /^NP:/i.test(l) || l === 'NP');
              const targetIdx = npIndex > 0 ? npIndex : lpIndex;

              if (targetIdx > 0) {
                for (let i = targetIdx - 1; i >= Math.max(0, targetIdx - 4); i--) {
                  const candidate = lines[i];
                  if (candidate && !/part number|model|vin|recent|search|basket|options|cruickshank|london|navigation/i.test(candidate)) {
                    name = candidate;
                    break;
                  }
                }
              }

              // 3. Fallback: check intercepted API responses ONLY if they contain explicit decimals
              if (!price && window.__mb_responses && window.__mb_responses.length > 0) {
                for (const resp of window.__mb_responses) {
                  const raw = JSON.stringify(resp);
                  if (regex.test(raw)) {
                    const priceM = raw.match(/"(?:listPrice|price|lp|retailPrice|amount)":\\s*([0-9]+\\.[0-9]{2})/i) ||
                                   raw.match(/LP[:\\s]*[£€$]?\\s*([0-9]+\\.[0-9]{2})/i);
                    const nameM = raw.match(/"(?:description|partName|designation|name)":\\s*"([^"]+)"/i);
                    if (priceM) {
                      price = parseFloat(priceM[1]);
                      if (!name && nameM) name = nameM[1];
                    }
                  }
                }
              }

              if (price !== null && price > 0) {
                return {
                  name: name || 'MERCEDES BENZ (' + clean + ')',
                  price: price,
                  partNumber: clean
                };
              }

              return null;
            })()
          `);

          if (extraction && typeof extraction.price === 'number' && extraction.price > 0) {
            const finalName = extraction.name || `MERCEDES BENZ (${cleanPn})`;
            store.setCachedPart(cleanPn, { name: finalName, price: extraction.price });
            finish({
              ok: true,
              name: finalName,
              price: extraction.price,
              source: 'mercedes-catalog-bg',
            });
            return;
          }
        }

        finish({
          ok: false,
          error: `Part "${cleanPn}" not found on Mercedes catalog or price unavailable.`,
          canOpenPortal: true,
        });
      } catch (err) {
        finish({ ok: false, error: 'Background search failed: ' + err.message, canOpenPortal: true });
      }
    });

    bgWin.webContents.on('did-fail-load', (_e, code, desc) => {
      finish({ ok: false, error: `Failed to load Mercedes catalog: ${desc} (${code})`, canOpenPortal: true });
    });

    bgWin.loadURL(MERCEDES_CATALOG_URL).catch((err) => {
      finish({ ok: false, error: err.message, canOpenPortal: true });
    });
  });
}

module.exports = {
  openMercedesPortal,
  getMercedesSessionStatus,
  lookupPart,
  setMainWindow,
  MERCEDES_CATALOG_URL,
};
