/* Restaurant Billing - Vanilla JS (localStorage) */

const STORAGE_KEYS = {
  menu: "rb.menu.v1",
  cart: "rb.cart.v1",
  sales: "rb.sales.v1",
  settings: "rb.settings.v1",
};

const DEFAULT_MENU_NAMES = new Set(
  ["Idly", "Puttu", "Poori", "Dosai", "Vada", "Pazhampori"].map((x) =>
    x.toLowerCase()
  )
);
const DEFAULT_MENU = [
  {
    id: cryptoRandomId(),
    name: "Idly",
    price: 30,
    category: "Breakfast",
    imageUrl: "./image/idly.jpg",
  },
  {
    id: cryptoRandomId(),
    name: "Puttu",
    price: 50,
    category: "Breakfast",
    imageUrl: "./image/puttu.jpg",
  },
  {
    id: cryptoRandomId(),
    name: "Poori",
    price: 45,
    category: "Breakfast",
    imageUrl: "./image/poori.jpg",
  },
  {
    id: cryptoRandomId(),
    name: "Dosai",
    price: 60,
    category: "Breakfast",
    imageUrl: "./image/dosa.jpg",
  },
  {
    id: cryptoRandomId(),
    name: "Vada",
    price: 15,
    category: "Snacks",
    imageUrl: "./image/vada.jpg",
  },
  {
    id: cryptoRandomId(),
    name: "Pazhampori",
    price: 20,
    category: "Snacks",
    imageUrl: "./image/palazhpori.jpg",
  },
];

const DEFAULT_SETTINGS = {
  discountAmount: 0,
  restaurantName: "My Restaurant",
  upiId: "myrestaurant@upi",
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

let state = {
  menu: [],
  cart: {}, // { [menuId]: qty }
  sales: [], // [{id, ts, items:[{id,name,qty,price}], totals:{subtotal,discount,total}}]
  settings: { ...DEFAULT_SETTINGS },
  ui: {
    activeTab: "pos",
    menuSearch: "",
    menuSort: "name",
  },
};

boot();

function boot() {
  loadAll();
  migrateAndPrefetchImages();
  wireTabs();
  wirePOS();
  wireManageMenu();
  wireReports();

  renderAll();
}

function loadAll() {
  state.menu = loadJson(STORAGE_KEYS.menu, null) ?? structuredClone(DEFAULT_MENU);
  state.cart = loadJson(STORAGE_KEYS.cart, {}) ?? {};
  state.sales = loadJson(STORAGE_KEYS.sales, []) ?? [];
  state.settings =
    loadJson(STORAGE_KEYS.settings, null) ?? structuredClone(DEFAULT_SETTINGS);
}

function persistAll() {
  saveJson(STORAGE_KEYS.menu, state.menu);
  saveJson(STORAGE_KEYS.cart, state.cart);
  saveJson(STORAGE_KEYS.sales, state.sales);
  saveJson(STORAGE_KEYS.settings, state.settings);
}

function wireTabs() {
  $$(".tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;
      state.ui.activeTab = tab;
      $$(".tab").forEach((b) => b.classList.toggle("is-active", b === btn));
      $$(".view").forEach((v) => v.classList.remove("is-active"));
      $(`#view-${tab}`).classList.add("is-active");

      if (tab === "reports") {
        renderReports();
      }
    });
  });
}

function wirePOS() {
  $("#menuSearch").addEventListener("input", (e) => {
    state.ui.menuSearch = e.target.value ?? "";
    renderMenuGrid();
  });

  $("#menuSort").addEventListener("change", (e) => {
    state.ui.menuSort = e.target.value;
    renderMenuGrid();
  });

  $("#discountAmount").value = String(state.settings.discountAmount ?? 0);

  $("#discountAmount").addEventListener("input", () => {
    state.settings.discountAmount = Math.max(0, Number($("#discountAmount").value) || 0);
    persistAll();
    renderCart();
  });

  $("#clearCartBtn").addEventListener("click", () => {
    state.cart = {};
    persistAll();
    renderCart();
    toast("Cart cleared.");
  });

  $("#printBillBtn").addEventListener("click", () => {
    if (cartLineItems().length === 0) {
      toast("Cart is empty.");
      return;
    }
    buildReceiptPreview({ orderId: `Draft-${shortId()}` });
    window.print();
  });

  $("#payNowBtn").addEventListener("click", () => {
    if (cartLineItems().length === 0) {
      toast("Cart is empty.");
      return;
    }
    $("#payBox").hidden = false;
    $("#payeeName").value = state.settings.restaurantName || "My Restaurant";
    $("#staticUpiId").textContent = state.settings.upiId || "";
    refreshQr();
  });

  $("#closePayBoxBtn").addEventListener("click", () => {
    $("#payBox").hidden = true;
  });

  $("#refreshQrBtn").addEventListener("click", refreshQr);

  $("#completeSaleBtn").addEventListener("click", () => {
    const items = cartLineItems();
    if (items.length === 0) {
      toast("Cart is empty.");
      return;
    }

    const totals = calcTotals();
    const sale = {
      id: `ORD-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${shortId()}`,
      ts: Date.now(),
      items,
      totals,
    };

    state.sales.unshift(sale);
    state.cart = {};
    persistAll();

    buildReceiptPreview({ orderId: sale.id, ts: sale.ts });
    toast(`Sale saved: ${sale.id}`);
    renderCart();

    // If user is already on report tab, update it
    if ($("#view-reports").classList.contains("is-active")) renderReports();
  });

  $("#payeeName").addEventListener("input", () => {
    state.settings.restaurantName = $("#payeeName").value.trim() || "My Restaurant";
    persistAll();
  });
}

function wireManageMenu() {
  $("#menuForm").addEventListener("submit", async (e) => {
    e.preventDefault();

    const id = ($("#menuId").value || "").trim();
    const name = ($("#menuName").value || "").trim();
    const price = Math.max(0, Number($("#menuPrice").value) || 0);
    const category = ($("#menuCategory").value || "").trim();
    const url = ($("#menuImageUrl").value || "").trim();
    const file = $("#menuImageFile").files?.[0] ?? null;
    const storeUrlLocally = Boolean($("#storeUrlImageLocally")?.checked);

    if (!name) {
      toast("Item name is required.");
      return;
    }

    let imageUrl = url;
    if (file) {
      imageUrl = await fileToDataUrl(file);
    } else if (url && storeUrlLocally) {
      try {
        const resolved = await resolveToImageUrl(url);
        imageUrl = await urlToDataUrl(resolved);
      } catch (err) {
        imageUrl = url;
        toast(
          "Couldn’t save that image locally (site may block downloads). Using the URL directly."
        );
      }
    }

    if (id) {
      const idx = state.menu.findIndex((m) => m.id === id);
      if (idx === -1) {
        toast("Item not found to update.");
        resetMenuForm();
        return;
      }
      state.menu[idx] = {
        ...state.menu[idx],
        name,
        price,
        category,
        imageUrl: imageUrl || state.menu[idx].imageUrl || "",
      };
      toast("Menu item updated.");
    } else {
      state.menu.unshift({
        id: cryptoRandomId(),
        name,
        price,
        category,
        imageUrl: imageUrl || "",
      });
      toast("Menu item added.");
    }

    persistAll();
    resetMenuForm();
    renderMenuGrid();
    renderMenuTable();
  });

  $("#cancelEditBtn").addEventListener("click", () => resetMenuForm());

  $("#resetMenuBtn").addEventListener("click", () => {
    if (!confirm("Reset menu to default items?")) return;
    state.menu = structuredClone(DEFAULT_MENU);
    persistAll();
    resetMenuForm();
    renderMenuGrid();
    renderMenuTable();
    toast("Menu reset.");
  });

  $("#exportMenuBtn").addEventListener("click", () => {
    downloadText(
      `menu-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(state.menu, null, 2),
      "application/json"
    );
  });

  $("#importMenuInput").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const txt = await file.text();
      const parsed = JSON.parse(txt);
      if (!Array.isArray(parsed)) throw new Error("Invalid JSON: expected an array");
      state.menu = parsed
        .map(normalizeMenuItem)
        .filter((x) => x && x.id && x.name);
      persistAll();
      resetMenuForm();
      renderMenuGrid();
      renderMenuTable();
      toast("Menu imported.");
    } catch (err) {
      toast(`Import failed: ${String(err?.message || err)}`);
    } finally {
      e.target.value = "";
    }
  });
}

function wireReports() {
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  $("#reportMonth").value = ym;

  $("#reportMonth").addEventListener("change", () => renderReports());

  $("#exportSalesBtn").addEventListener("click", () => {
    const rows = filteredSalesForSelectedMonth().map((s) => ({
      order_id: s.id,
      datetime: new Date(s.ts).toLocaleString(),
      subtotal: s.totals.subtotal,
      discount: s.totals.discount,
      total: s.totals.total,
      items: s.items.map((i) => `${i.name} x${i.qty}`).join(" | "),
    }));
    const csv = toCsv(rows);
    downloadText(
      `sales-${$("#reportMonth").value || "all"}.csv`,
      csv,
      "text/csv"
    );
  });

  $("#clearSalesBtn").addEventListener("click", () => {
    if (!confirm("Clear ALL sales data? This cannot be undone.")) return;
    state.sales = [];
    persistAll();
    renderReports();
    toast("Sales cleared.");
  });
}

function renderAll() {
  renderMenuGrid();
  renderCart();
  renderMenuTable();
  renderReports();
}

function renderMenuGrid() {
  const grid = $("#menuGrid");
  grid.innerHTML = "";

  const q = (state.ui.menuSearch || "").trim().toLowerCase();
  let items = state.menu.slice();

  if (q) {
    items = items.filter((m) =>
      `${m.name} ${m.category || ""}`.toLowerCase().includes(q)
    );
  }

  items.sort((a, b) => {
    const mode = state.ui.menuSort;
    if (mode === "priceAsc") return (a.price ?? 0) - (b.price ?? 0);
    if (mode === "priceDesc") return (b.price ?? 0) - (a.price ?? 0);
    return String(a.name || "").localeCompare(String(b.name || ""));
  });

  if (items.length === 0) {
    grid.innerHTML =
      '<div class="empty">No menu items match your search.</div>';
    return;
  }

  for (const m of items) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "menu-item";
    card.title = "Click to add to cart";
    card.addEventListener("click", () => addToCart(m.id));

    const imgWrap = document.createElement("div");
    imgWrap.className = "menu-item__img";
    imgWrap.appendChild(buildSafeImage(m.imageUrl, m.name));

    const body = document.createElement("div");
    body.className = "menu-item__body";
    const stars = renderStars(4);
    body.innerHTML = `
      <div class="product-title">${escapeHtml(m.name)}</div>
      <div class="product-stars" aria-label="Rating">${stars}</div>
      <div class="product-price">${fmtINR(m.price)}</div>
    `;

    card.appendChild(imgWrap);
    card.appendChild(body);

    grid.appendChild(card);
  }
}

function renderCart() {
  const itemsWrap = $("#cartItems");
  const empty = $("#cartEmpty");
  const items = cartLineItems();

  empty.hidden = items.length > 0;
  itemsWrap.innerHTML = "";

  for (const it of items) {
    const menuItem = state.menu.find((m) => m.id === it.id);
    const row = document.createElement("div");
    row.className = "cart-item";
    row.innerHTML = `
      <div class="cart-item__main">
        <div class="cart-item__thumb-wrap"></div>
        <div class="cart-item__text">
          <div class="cart-item__name">${escapeHtml(it.name)}</div>
          <div class="cart-item__sub">${fmtINR(it.price)} each</div>
        </div>
      </div>
      <div class="qty">
        <button class="qty__btn" type="button" data-act="dec" aria-label="Decrease">−</button>
        <div class="qty__val">${it.qty}</div>
        <button class="qty__btn" type="button" data-act="inc" aria-label="Increase">+</button>
        <div class="qty__price">${fmtINR(it.qty * it.price)}</div>
        <button class="qty__btn qty__remove" type="button" data-act="rm" aria-label="Remove">×</button>
      </div>
    `;

    const thumbWrap = row.querySelector(".cart-item__thumb-wrap");
    const img = buildSafeImage(menuItem?.imageUrl || "", it.name, {
      className: "cart-item__thumb",
    });
    thumbWrap.appendChild(img);

    row.querySelectorAll("button").forEach((b) => {
      b.addEventListener("click", () => {
        const act = b.dataset.act;
        if (act === "inc") addToCart(it.id, 1);
        if (act === "dec") addToCart(it.id, -1);
        if (act === "rm") removeFromCart(it.id);
      });
    });

    itemsWrap.appendChild(row);
  }

  const totals = calcTotals();
  $("#subtotal").textContent = fmtINR(totals.subtotal);
  $("#total").textContent = fmtINR(totals.total);

  // keep settings inputs in sync if changed elsewhere
  $("#discountAmount").value = String(state.settings.discountAmount ?? 0);
}

async function migrateAndPrefetchImages() {
  // If user already has menu stored, it may be missing images or using older URLs.
  // This migration:
  // - ensures default items have image URLs (by name match)
  // - updates default item image URLs to match the code (so they always show)
  // - optionally downloads those images into localStorage (data URLs) for reliable display

  const byNameDefault = new Map(
    DEFAULT_MENU.map((m) => [String(m.name || "").trim().toLowerCase(), m])
  );

  let changed = false;
  // Ensure default items exist and always have default (embedded) images.
  const existingByName = new Map(
    state.menu.map((m) => [String(m.name || "").trim().toLowerCase(), m])
  );

  for (const defName of DEFAULT_MENU_NAMES) {
    const def = byNameDefault.get(defName);
    if (!def) continue;
    const existing = existingByName.get(defName);
    if (!existing) {
      state.menu.unshift(structuredClone(def));
      changed = true;
      continue;
    }
    // Always force image to the default embedded image for these core items.
    if (def.imageUrl && existing.imageUrl !== def.imageUrl) {
      existing.imageUrl = def.imageUrl;
      changed = true;
    }
    // If name differs in case/spacing, normalize softly (keep user's casing if they changed it).
    if (!existing.name || String(existing.name).trim().toLowerCase() !== defName) {
      // keep as-is
    }
  }

  // For any other items, if image is missing but default exists, fill it.
  for (const m of state.menu) {
    const key = String(m.name || "").trim().toLowerCase();
    const def = byNameDefault.get(key);
    if (!def) continue;
    if (!m.imageUrl || !String(m.imageUrl).trim()) {
      m.imageUrl = def.imageUrl;
      changed = true;
    }
  }

  if (changed) {
    persistAll();
    renderMenuGrid();
    renderMenuTable();
  }

  // Prefetch default item images into data URLs (only if they are not already data URLs).
  // This is best-effort; failures are ignored.
  const targets = state.menu.filter((m) => {
    const key = String(m.name || "").trim().toLowerCase();
    return (
      byNameDefault.has(key) &&
      m.imageUrl &&
      !String(m.imageUrl).startsWith("data:image/")
    );
  });

  if (targets.length === 0) return;

  // Do a small batch to avoid freezing UI.
  setTimeout(async () => {
    let any = false;
    for (const m of targets) {
      try {
        const dataUrl = await urlToDataUrl(m.imageUrl);
        // data URLs can be large; only save if it's reasonable
        if (typeof dataUrl === "string" && dataUrl.startsWith("data:image/")) {
          m.imageUrl = dataUrl;
          any = true;
        }
      } catch {
        // ignore
      }
    }
    if (any) {
      persistAll();
      renderMenuGrid();
      renderMenuTable();
      renderCart();
      toast("Menu images updated.");
    }
  }, 50);
}

function renderMenuTable() {
  const body = $("#menuTableBody");
  body.innerHTML = "";

  const sorted = state.menu
    .slice()
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));

  for (const m of sorted) {
    const tr = document.createElement("tr");
    const imgEl = buildSafeImage(m.imageUrl, m.name, { className: "thumb" });

    tr.innerHTML = `
      <td><strong>${escapeHtml(m.name)}</strong><div class="small-muted">ID: ${escapeHtml(m.id)}</div></td>
      <td class="right">${fmtINR(m.price)}</td>
      <td>${escapeHtml(m.category || "")}</td>
      <td></td>
      <td class="right">
        <div class="actions-inline">
          <button class="btn btn--ghost" type="button" data-act="edit">Edit</button>
          <button class="btn btn--danger" type="button" data-act="del">Delete</button>
        </div>
      </td>
    `;
    tr.children[3].appendChild(imgEl);

    tr.querySelector('[data-act="edit"]').addEventListener("click", () => {
      fillMenuForm(m);
    });
    tr.querySelector('[data-act="del"]').addEventListener("click", () => {
      if (!confirm(`Delete "${m.name}"?`)) return;
      state.menu = state.menu.filter((x) => x.id !== m.id);
      delete state.cart[m.id];
      persistAll();
      renderMenuGrid();
      renderCart();
      renderMenuTable();
      toast("Menu item deleted.");
    });

    body.appendChild(tr);
  }
}

function renderReports() {
  const sales = filteredSalesForSelectedMonth();
  const orders = sales.length;
  const gross = sales.reduce((sum, s) => sum + (s.totals?.total ?? 0), 0);
  const avg = orders ? gross / orders : 0;

  $("#reportOrders").textContent = String(orders);
  $("#reportGross").textContent = fmtINR(gross);
  $("#reportAvg").textContent = fmtINR(avg);

  const tbody = $("#salesTableBody");
  tbody.innerHTML = "";

  for (const s of sales) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(new Date(s.ts).toLocaleString())}<div class="small-muted">${escapeHtml(
      s.id
    )}</div></td>
      <td>${escapeHtml(s.items.map((i) => `${i.name} x${i.qty}`).join(", "))}</td>
      <td class="right">${fmtINR(s.totals.total)}</td>
    `;
    tbody.appendChild(tr);
  }
}

function addToCart(menuId, delta = 1) {
  const m = state.menu.find((x) => x.id === menuId);
  if (!m) {
    toast("Item not found.");
    return;
  }
  const cur = Number(state.cart[menuId] || 0);
  const next = cur + delta;
  if (next <= 0) {
    delete state.cart[menuId];
  } else {
    state.cart[menuId] = next;
  }
  persistAll();
  renderCart();
}

function removeFromCart(menuId) {
  delete state.cart[menuId];
  persistAll();
  renderCart();
}

function cartLineItems() {
  const out = [];
  for (const [id, qtyRaw] of Object.entries(state.cart)) {
    const qty = Number(qtyRaw || 0);
    if (qty <= 0) continue;
    const m = state.menu.find((x) => x.id === id);
    if (!m) continue;
    out.push({
      id: m.id,
      name: m.name,
      price: Number(m.price || 0),
      qty,
    });
  }
  // stable by name for readability
  out.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  return out;
}

function calcTotals() {
  const items = cartLineItems();
  const subtotal = items.reduce((sum, i) => sum + i.price * i.qty, 0);
  const discount = Math.max(0, Number(state.settings.discountAmount) || 0);
  const total = Math.max(0, round2(subtotal - discount));
  return { subtotal: round2(subtotal), discount: round2(discount), total };
}

function fillMenuForm(m) {
  $("#menuId").value = m.id;
  $("#menuName").value = m.name || "";
  $("#menuPrice").value = String(m.price ?? 0);
  $("#menuCategory").value = m.category || "";
  $("#menuImageUrl").value = m.imageUrl || "";
  $("#menuImageFile").value = "";
  $("#cancelEditBtn").hidden = false;
  $("#saveMenuBtn").textContent = "Update item";
}

function resetMenuForm() {
  $("#menuId").value = "";
  $("#menuName").value = "";
  $("#menuPrice").value = "0";
  $("#menuCategory").value = "";
  $("#menuImageUrl").value = "";
  $("#menuImageFile").value = "";
  if ($("#storeUrlImageLocally")) $("#storeUrlImageLocally").checked = true;
  $("#cancelEditBtn").hidden = true;
  $("#saveMenuBtn").textContent = "Save item";
}

function buildReceiptPreview({ orderId, ts = Date.now() }) {
  const items = cartLineItems();
  const totals = calcTotals();

  $("#receiptRestaurant").textContent = state.settings.restaurantName || "My Restaurant";
  $("#receiptDate").textContent = new Date(ts).toLocaleString();
  $("#receiptOrderId").textContent = `Order: ${orderId}`;

  const tbody = $("#receiptItems");
  tbody.innerHTML = "";
  for (const it of items) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(it.name)}</td>
      <td class="right">${it.qty}</td>
      <td class="right">${fmtINR(it.qty * it.price)}</td>
    `;
    tbody.appendChild(tr);
  }

  $("#receiptSubtotal").textContent = fmtINR(totals.subtotal);
  $("#receiptDiscount").textContent = `- ${fmtINR(totals.discount)}`;
  $("#receiptTotal").textContent = fmtINR(totals.total);
}

function refreshQr() {
  const totals = calcTotals();
  const amount = totals.total;

  const payeeName = ($("#payeeName").value || "My Restaurant").trim() || "My Restaurant";
  const upi = String(state.settings.upiId || "").trim();
  const note = ($("#payNote").value || "").trim();

  // UPI deep link format:
  // upi://pay?pa=upiId&pn=PayeeName&am=10.00&cu=INR&tn=Note
  // If upi id not provided, still generate a QR with a simple "Pay ₹X to <name>"
  const data = `upi://pay?pa=${encodeURIComponent(upi)}&pn=${encodeURIComponent(
    payeeName
  )}&am=${encodeURIComponent(amount.toFixed(2))}&cu=INR${
    note ? `&tn=${encodeURIComponent(note)}` : ""
  }`;

  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(
    data
  )}`;

  const img = $("#qrImg");
  const fallback = $("#qrFallback");
  fallback.hidden = true;
  img.alt = `Payment QR code for ${fmtINR(amount)}`;
  img.src = qrUrl;
  img.onerror = () => {
    fallback.hidden = false;
  };
}

function filteredSalesForSelectedMonth() {
  const ym = ($("#reportMonth").value || "").trim();
  if (!ym) return state.sales.slice();
  const [yStr, mStr] = ym.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  if (!y || !m) return state.sales.slice();
  const start = new Date(y, m - 1, 1, 0, 0, 0, 0).getTime();
  const end = new Date(y, m, 1, 0, 0, 0, 0).getTime();
  return state.sales.filter((s) => s.ts >= start && s.ts < end);
}

function normalizeMenuItem(x) {
  const id = (x?.id || "").trim() || cryptoRandomId();
  const name = String(x?.name || "").trim();
  const price = Math.max(0, Number(x?.price) || 0);
  const category = String(x?.category || "").trim();
  const imageUrl = String(x?.imageUrl || x?.image || "").trim();
  return { id, name, price, category, imageUrl };
}

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function saveJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore quota errors
  }
}

function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.hidden = false;
  el.classList.remove("toast--hide");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => {
    el.hidden = true;
  }, 2200);
}

function fmtINR(n) {
  const x = Number(n || 0);
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 2,
    }).format(x);
  } catch {
    return `₹${x.toFixed(2)}`;
  }
}

function round2(n) {
  return Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;
}

function clampNum(n, min, max) {
  const v = Number(n);
  if (Number.isNaN(v)) return min;
  return Math.min(max, Math.max(min, v));
}

function cryptoRandomId() {
  // Short + readable, safe for local IDs
  const a = new Uint32Array(2);
  crypto.getRandomValues(a);
  return `${a[0].toString(16)}${a[1].toString(16)}`;
}

function shortId() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function shorten(s, n) {
  const str = String(s || "");
  return str.length <= n ? str : str.slice(0, n);
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeHtmlAttr(s) {
  return escapeHtml(s).replaceAll("`", "&#96;");
}

function downloadText(filename, text, mime) {
  const blob = new Blob([text], { type: mime || "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function toCsv(rows) {
  if (!rows || rows.length === 0) {
    return "no_data\n";
  }
  const headers = Object.keys(rows[0]);
  const esc = (v) => {
    const s = String(v ?? "");
    if (/[,"\n]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
    return s;
  };
  const lines = [];
  lines.push(headers.join(","));
  for (const r of rows) {
    lines.push(headers.map((h) => esc(r[h])).join(","));
  }
  return lines.join("\n") + "\n";
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(file);
  });
}

function renderStars(ratingOutOf5) {
  const r = Math.max(0, Math.min(5, Number(ratingOutOf5) || 0));
  const full = "★".repeat(Math.floor(r));
  const empty = "☆".repeat(5 - Math.floor(r));
  return `${full}${empty}`;
}

function urlToDataUrl(url) {
  return new Promise(async (resolve, reject) => {
    try {
      const blob = await fetchImageBlob(url);
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Failed to convert image"));
      reader.onload = () => resolve(String(reader.result || ""));
      reader.readAsDataURL(blob);
    } catch (err) {
      reject(err);
    }
  });
}

async function resolveToImageUrl(inputUrl) {
  const url = String(inputUrl || "").trim();
  if (!url) throw new Error("Missing URL");

  // If it's already a direct image (or data URL), keep it.
  if (url.startsWith("data:image/")) return url;
  if (/\.(png|jpe?g|webp|gif|avif)(\?|#|$)/i.test(url)) return url;

  // Otherwise treat it as a webpage and try to extract og:image / twitter:image.
  const html = await fetchTextViaProxy(url);
  const doc = new DOMParser().parseFromString(html, "text/html");
  const pick =
    doc.querySelector('meta[property="og:image:secure_url"]')?.getAttribute("content") ||
    doc.querySelector('meta[property="og:image"]')?.getAttribute("content") ||
    doc.querySelector('meta[name="twitter:image"]')?.getAttribute("content") ||
    doc.querySelector('meta[name="twitter:image:src"]')?.getAttribute("content") ||
    doc.querySelector('link[rel="image_src"]')?.getAttribute("href") ||
    "";

  if (!pick) throw new Error("No og:image found on page");

  // Handle relative URLs
  try {
    return new URL(pick, url).toString();
  } catch {
    return pick;
  }
}

async function fetchTextViaProxy(url) {
  // We use a proxy to bypass CORS for HTML pages.
  const proxied = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
  const res = await fetch(proxied, { cache: "force-cache" });
  if (!res.ok) throw new Error(`Proxy HTTP ${res.status}`);
  return await res.text();
}

async function fetchImageBlob(url) {
  // Prefer proxy first so "any website" works more often.
  // Note: This still depends on the proxy being available and the origin allowing the proxy to fetch it.
  const proxied = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
  try {
    const resP = await fetch(proxied, { cache: "force-cache" });
    if (!resP.ok) throw new Error(`Proxy HTTP ${resP.status}`);
    return await resP.blob();
  } catch {
    // Fallback to direct fetch for CORS-friendly hosts and local URLs.
    const res = await fetch(url, { mode: "cors", cache: "force-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.blob();
  }
}

function buildSafeImage(src, alt, opts = {}) {
  const img = document.createElement("img");
  img.loading = "lazy";
  if (opts.className) img.className = opts.className;
  img.alt = alt || "Menu item";

  if (!src) {
    img.src = placeholderSvgDataUrl(alt || "No image");
    return img;
  }

  img.src = src;
  img.referrerPolicy = "no-referrer";
  img.onerror = () => {
    img.src = placeholderSvgDataUrl(alt || "Image blocked");
  };
  return img;
}

function placeholderSvgDataUrl(label) {
  const safe = String(label || "Image").slice(0, 24);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#0b1220"/>
        <stop offset="1" stop-color="#111c37"/>
      </linearGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
    <rect x="26" y="26" width="748" height="448" rx="28" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.12)"/>
    <g fill="rgba(232,238,252,0.88)" font-family="ui-sans-serif, system-ui, Segoe UI, Arial" text-anchor="middle">
      <text x="400" y="250" font-size="38" font-weight="800">${escapeXml(safe)}</text>
      <text x="400" y="300" font-size="20" opacity="0.75">image not available</text>
    </g>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function escapeXml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

