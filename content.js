// content.js - Forge VTT Party Inventory Parser
// Only active on forge-vtt.com (enforced by manifest matches)

/**
 * Finds the correct party div: must have "party" in its class list
 * AND contain a section.inventory somewhere below it.
 */
function findPartyInventoryDiv() {
  const candidates = Array.from(document.querySelectorAll('div[class*="party"]'));
  for (const div of candidates) {
    if (div.querySelector('section.inventory')) {
      return div;
    }
  }
  return null;
}

/**
 * Checks if the party div is visible and the inventory tab is active.
 */
function isInventoryVisible(partyDiv) {
  if (!partyDiv) return false;

  const style = window.getComputedStyle(partyDiv);
  if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) === 0) {
    return false;
  }

  const inventoryTab = partyDiv.querySelector('div.tab.inventory');
  if (!inventoryTab) return false;

  const inventorySection = inventoryTab.querySelector('section.inventory');
  if (!inventorySection) return false;

  const sectionStyle = window.getComputedStyle(inventorySection);
  if (sectionStyle.display === 'none' || sectionStyle.visibility === 'hidden') return false;

  return true;
}

/**
 * Parses all inventory items grouped by type from section.inventory-list
 */
function parseInventory(partyDiv) {
  const inventoryList = partyDiv.querySelector('section.inventory-list');
  if (!inventoryList) return [];

  const items = [];

  // Each category: <header><h3 class="item-name">TypeName</h3>...</header> then sibling <ul class="items">
  const headers = inventoryList.querySelectorAll('header');
  headers.forEach(header => {
    const h3 = header.querySelector('h3.item-name');
    if (!h3) return;

    const typeName = h3.textContent.trim();
    const ul = header.nextElementSibling;
    if (!ul || !ul.classList.contains('items')) return;

    const itemEls = ul.querySelectorAll('li[data-item-id]');
    itemEls.forEach(li => {
      const nameEl = li.querySelector('.item-name h4.name a[data-action="toggle-summary"]');
      const priceEl = li.querySelector('.price span[data-visibility]');
      const quantityEl = li.querySelector('.quantity span');
      const bulkEl = li.querySelector('span.bulk');

      const name = nameEl ? nameEl.textContent.trim() : '(unknown)';
      const price = priceEl ? priceEl.textContent.trim() : '—';
      const quantity = quantityEl ? quantityEl.textContent.trim() : '—';
      const bulk = bulkEl ? bulkEl.textContent.trim() : '—';
      const itemId = li.getAttribute('data-item-id') || '';
      const uuid = li.getAttribute('data-uuid') || '';

      items.push({ type: typeName, name, price, quantity, bulk, itemId, uuid });
    });
  });

  return items;
}

// Listen for messages from the popup
browser.runtime.onMessage.addListener((message) => {
  if (message.action === 'checkStatus') {
    const partyDiv = findPartyInventoryDiv();
    const visible = isInventoryVisible(partyDiv);
    return Promise.resolve({ found: !!partyDiv, visible });
  }

  if (message.action === 'getInventory') {
    const partyDiv = findPartyInventoryDiv();
    if (!partyDiv) {
      return Promise.resolve({ error: 'No party inventory section found.' });
    }
    if (!isInventoryVisible(partyDiv)) {
      return Promise.resolve({ error: 'Party inventory panel is not currently visible. Open the Party sheet and click the Stash tab.' });
    }
    const items = parseInventory(partyDiv);
    return Promise.resolve({ items, timestamp: new Date().toISOString() });
  }
});
