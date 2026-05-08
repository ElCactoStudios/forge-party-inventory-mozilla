// popup.js - Party Inventory popup logic

let lastItems = [];

const output = document.getElementById('output');
const statsBar = document.getElementById('statsBar');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const csvBtn = document.getElementById('csvBtn');
const timestamp = document.getElementById('timestamp');

// ── Status check on open ──────────────────────────────────────────────────────
async function checkStatus() {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    const url = new URL(tab.url);

    if (!url.hostname.endsWith('forge-vtt.com')) {
      setStatus('error', 'Not on forge-vtt.com');
      document.getElementById('readBtn').disabled = true;
      return;
    }

    const res = await browser.tabs.sendMessage(tab.id, { action: 'checkStatus' });
    if (!res.found) {
      setStatus('warn', 'Party sheet not open');
    } else if (!res.visible) {
      setStatus('found', 'Party sheet found — open Stash tab to scan');
    } else {
      setStatus('visible', 'Party inventory ready');
    }
  } catch (e) {
    setStatus('error', 'Cannot reach page content');
    document.getElementById('readBtn').disabled = true;
  }
}

function setStatus(state, msg) {
  statusDot.className = 'status-dot ' + (state === 'visible' ? 'visible' : state === 'found' ? 'found' : 'error');
  statusText.className = 'status-text ' + (state === 'visible' ? 'ok' : state === 'found' ? 'warn' : 'err');
  statusText.textContent = msg;
}

// ── Read inventory ────────────────────────────────────────────────────────────
document.getElementById('readBtn').addEventListener('click', async () => {
  output.innerHTML = `<div class="loading">Scanning inventory…</div>`;
  csvBtn.style.display = 'none';
  statsBar.classList.remove('visible');

  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    const res = await browser.tabs.sendMessage(tab.id, { action: 'getInventory' });

    if (res.error) {
      output.replaceChildren();
      const loadingDiv = document.createElement('div');
      loadingDiv.className = 'loading';
      loadingDiv.textContent = 'Scanning inventory…';
      output.appendChild(loadingDiv)
      setStatus('error', res.error);
      return;
    }

    lastItems = res.items;
    renderInventory(res.items);
    updateStats(res.items, res.timestamp);
    setStatus('visible', `${res.items.length} items parsed`);

    if (res.items.length > 0) csvBtn.style.display = 'block';

    const t = new Date(res.timestamp);
    timestamp.textContent = t.toLocaleTimeString();

  } catch (e) {
    output.replaceChildren();
    const errDiv = document.createElement('div');
    errDiv.className = 'error-msg';
    errDiv.textContent = `⚠ ${res.error}`;
    output.appendChild(errDiv);
    setStatus('error', 'Scan failed');
  }
});

// ── Clear ─────────────────────────────────────────────────────────────────────
document.getElementById('clearBtn').addEventListener('click', () => {
  lastItems = [];
  statsBar.classList.remove('visible');
  csvBtn.style.display = 'none';
  timestamp.textContent = 'forge-vtt.com';
  output.innerHTML = `
    <div class="placeholder">
      <div class="icon">⚔</div>
      Open the <strong style="color:#a78bfa">Party Sheet</strong> Stash tab<br>
      then click <strong style="color:#a78bfa">Scan Inventory</strong>
    </div>`;
  checkStatus();
});

// ── CSV download ──────────────────────────────────────────────────────────────
csvBtn.addEventListener('click', () => {
  if (!lastItems.length) return;

  const headers = ['Type', 'Name', 'Price', 'Quantity', 'Bulk', 'Item ID', 'UUID'];
  const rows = lastItems.map(item => [
    csvEsc(item.type),
    csvEsc(item.name),
    csvEsc(item.price),
    csvEsc(item.quantity),
    csvEsc(item.bulk),
    csvEsc(item.itemId),
    csvEsc(item.uuid)
  ]);

  const csv = [headers, ...rows].map(r => r.join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  const dateStr = new Date().toISOString().slice(0, 10);
  a.download = `party-inventory-${dateStr}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});

function csvEsc(val) {
  const s = String(val ?? '').replace(/"/g, '""');
  return /[",\r\n]/.test(s) ? `"${s}"` : s;
}

// ── Render ────────────────────────────────────────────────────────────────────
function renderInventory(items) {
  output.replaceChildren();

  if (!items.length) {
    const p = document.createElement('div');
    p.className = 'placeholder';
    p.textContent = 'No items found in the party stash.';
    output.appendChild(p);
    return;
  }

  const grouped = new Map();
  for (const item of items) {
    if (!grouped.has(item.type)) grouped.set(item.type, []);
    grouped.get(item.type).push(item);
  }

  for (const [type, typeItems] of grouped) {
    const section = document.createElement('div');
    section.className = 'type-section';

    const typeHeader = document.createElement('div');
    typeHeader.className = 'type-header';
    const h3 = document.createElement('h3');
    h3.textContent = type;
    const badge = document.createElement('span');
    badge.className = 'type-count';
    badge.textContent = typeItems.length;
    typeHeader.append(h3, badge);
    section.appendChild(typeHeader);

    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    ['Name', 'Price', 'Qty', 'Bulk'].forEach(label => {
      const th = document.createElement('th');
      th.textContent = label;
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (const item of typeItems) {
      const tr = document.createElement('tr');
      const cells = [
        { text: item.name,     cls: 'name-cell'  },
        { text: item.price,    cls: 'price-cell' },
        { text: item.quantity, cls: 'qty-cell'   },
        { text: item.bulk,     cls: ''           },
      ];
      cells.forEach(({ text, cls }) => {
        const td = document.createElement('td');
        if (cls) td.className = cls;
        td.textContent = text;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    section.appendChild(table);
    output.appendChild(section);
  }
}

function updateStats(items, ts) {
  const types = new Set(items.map(i => i.type)).size;
  document.getElementById('statItems').textContent = items.length;
  document.getElementById('statCats').textContent = types;
  document.getElementById('statTime').textContent = new Date(ts).toLocaleTimeString();
  statsBar.classList.add('visible');
}

// Run status check when popup opens
checkStatus();
