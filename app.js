const TYPE_LABELS = {
  "3in1": "3in1",
  "plug_integrated": "ケーブル・プラグ一体型",
  "apple_watch": "Apple Watch専用",
  "magsafe": "MagSafe対応",
  "connector_integrated": "端子一体型",
  "cable_built_in": "ケーブル内蔵型",
  "standard": "標準タイプ"
};

const TYPE_ICONS = {
  "3in1": "✨",
  "plug_integrated": "🔌",
  "apple_watch": "⌚",
  "magsafe": "🧲",
  "connector_integrated": "📎",
  "cable_built_in": "➰",
  "standard": "🔋"
};

function iconFor(product) {
  const t = (product.types || [])[0];
  return TYPE_ICONS[t] || "🔋";
}

const DESIGN_LABELS = {
  "kawaii": "可愛い系",
  "simple": "シンプル系",
  "mecha": "メカメカ系"
};

const PAGE_SIZE = 12;
let visibleCount = PAGE_SIZE;
let currentMatched = [];

let PRODUCTS = [];

const form = document.getElementById("filter-form");
const resultList = document.getElementById("result-list");
const resultCount = document.getElementById("result-count");
const sortSelect = document.getElementById("sort-select");
const advancedDetails = document.getElementById("advanced-details");
const presetGrid = document.getElementById("preset-grid");
const activeConditionsEl = document.getElementById("active-conditions");
const liveCountHint = document.getElementById("live-count-hint");
const colorFieldset = document.getElementById("color-fieldset");
const colorGroup = document.getElementById("color-group");

const PRESETS = {
  light: (f) => { f.weight_max.value = "150"; },
  bigCapacity: (f) => { f.capacity_min.value = "20000"; },
  laptop: (f) => {
    f.output_min.value = "45";
    setChecked(f, "fast_charge", "PD", true);
  },
  magsafe: (f) => setChecked(f, "type", "magsafe", true),
  appleWatch: (f) => setChecked(f, "type", "apple_watch", true),
  noCableNeeded: (f) => {
    setChecked(f, "type", "plug_integrated", true);
    setChecked(f, "type", "cable_built_in", true);
    setChecked(f, "type", "connector_integrated", true);
  },
  cheap: (f) => { f.price_max.value = "5000"; },
  multiCharge: (f) => { f.simultaneous_min.value = "3"; },
  kawaii: (f) => setChecked(f, "design_style", "kawaii", true),
  simpleDesign: (f) => setChecked(f, "design_style", "simple", true),
  mecha: (f) => setChecked(f, "design_style", "mecha", true),
  reset: () => {}
};

function setChecked(f, name, value, checked) {
  const input = [...f.elements[name]].find(el => el.value === value);
  if (input) input.checked = checked;
}

async function loadData() {
  try {
    const res = await fetch("data.json", { cache: "no-store" });
    PRODUCTS = await res.json();
  } catch (e) {
    console.error("データの読み込みに失敗しました", e);
    PRODUCTS = [];
  }
  populateColorOptions();
  applyFiltersAndRender();
  updateLiveCount();
}

function populateColorOptions() {
  const colors = new Set();
  PRODUCTS.forEach(p => (p.colors || []).forEach(c => colors.add(c)));
  if (colors.size === 0) {
    colorFieldset.hidden = true;
    return;
  }
  colorFieldset.hidden = false;
  colorGroup.innerHTML = [...colors].sort().map(c => `
    <label class="chip"><input type="checkbox" name="color" value="${c}"><span>${c}</span></label>
  `).join("");
}

function getFilters() {
  const formData = new FormData(form);
  return {
    types: formData.getAll("type"),
    capacityMin: Number(formData.get("capacity_min") || 0),
    weightMax: Number(formData.get("weight_max") || 0),
    thicknessMax: Number(formData.get("thickness_max") || 0),
    outputMin: Number(formData.get("output_min") || 0),
    fastCharge: formData.getAll("fast_charge"),
    portsMin: Number(formData.get("ports_min") || 0),
    simultaneousMin: Number(formData.get("simultaneous_min") || 0),
    priceMax: Number(formData.get("price_max") || 0),
    pseRequired: formData.get("pse_required") === "on",
    designStyle: formData.getAll("design_style"),
    colors: formData.getAll("color")
  };
}

function matchesFilters(product, f) {
  if (f.types.length > 0) {
    const productTypes = product.types || [];
    const hasType = f.types.some(t => productTypes.includes(t));
    if (!hasType) return false;
  }
  if (f.capacityMin > 0) {
    if (!product.capacity_mah || product.capacity_mah < f.capacityMin) return false;
  }
  if (f.weightMax > 0) {
    if (product.weight_g == null || product.weight_g > f.weightMax) return false;
  }
  if (f.thicknessMax > 0) {
    if (product.thickness_mm == null || product.thickness_mm > f.thicknessMax) return false;
  }
  if (f.colors.length > 0) {
    const pc = product.colors || [];
    const hasColor = f.colors.some(c => pc.includes(c));
    if (!hasColor) return false;
  }
  if (f.outputMin > 0) {
    if (!product.output_w || product.output_w < f.outputMin) return false;
  }
  if (f.fastCharge.length > 0) {
    const fc = product.fast_charge || [];
    const hasAll = f.fastCharge.every(v => fc.includes(v));
    if (!hasAll) return false;
  }
  if (f.portsMin > 0) {
    if (!product.ports || product.ports < f.portsMin) return false;
  }
  if (f.simultaneousMin > 0) {
    if (!product.simultaneous_charge || product.simultaneous_charge < f.simultaneousMin) return false;
  }
  if (f.priceMax > 0) {
    if (product.price_jpy == null || product.price_jpy > f.priceMax) return false;
  }
  if (f.pseRequired) {
    if (product.pse_mark !== true) return false;
  }
  if (f.designStyle.length > 0) {
    const ds = product.design_style || [];
    const hasDesign = f.designStyle.some(d => ds.includes(d));
    if (!hasDesign) return false;
  }
  return true;
}

function sortProducts(products, sortKey) {
  const sorted = [...products];
  switch (sortKey) {
    case "price_asc":
      sorted.sort((a, b) => (a.price_jpy ?? Infinity) - (b.price_jpy ?? Infinity));
      break;
    case "price_desc":
      sorted.sort((a, b) => (b.price_jpy ?? -Infinity) - (a.price_jpy ?? -Infinity));
      break;
    case "capacity_desc":
      sorted.sort((a, b) => (b.capacity_mah ?? 0) - (a.capacity_mah ?? 0));
      break;
    case "weight_asc":
      sorted.sort((a, b) => (a.weight_g ?? Infinity) - (b.weight_g ?? Infinity));
      break;
  }
  return sorted;
}

function fmt(value, unit) {
  return value == null ? "不明" : `${value.toLocaleString()}${unit}`;
}

function cardHtml(p) {
  const types = (p.types || []).map(t => `<span class="type-badge">${TYPE_LABELS[t] || t}</span>`).join("");
  const fastCharge = (p.fast_charge || []).join(" / ") || "-";
  const priceText = p.price_jpy != null ? `¥${p.price_jpy.toLocaleString()}` : "価格不明";
  const buyLink = p.purchase_url
    ? `<a class="buy-link" href="${p.purchase_url}" target="_blank" rel="noopener noreferrer">購入ページを見る →</a>`
    : `<span class="buy-link" style="color:var(--muted)">購入リンク未登録</span>`;

  return `
    <article class="result-card">
      <div class="result-photo" aria-hidden="true">${iconFor(p)}</div>
      <div class="result-body">
      <div class="result-card-top">
        <div>
          <div class="result-name">${p.name}</div>
          <div class="result-maker">${p.maker || ""}</div>
        </div>
        <div class="result-price">${priceText}</div>
      </div>
      <div class="result-types">${types}</div>
      <div class="spec-grid">
        <div><span>容量: </span>${fmt(p.capacity_mah, "mAh")}</div>
        <div><span>重さ: </span>${fmt(p.weight_g, "g")}</div>
        <div><span>出力: </span>${fmt(p.output_w, "W")}</div>
        <div><span>急速充電: </span>${fastCharge}</div>
        <div><span>ポート数: </span>${fmt(p.ports, "")}</div>
        <div><span>同時充電: </span>${fmt(p.simultaneous_charge, "台")}</div>
      </div>
      ${p.notes ? `<div class="result-notes">${p.notes}</div>` : ""}
      <div class="result-footer">
        <span class="pse-badge">${p.pse_mark === true ? "PSEマーク対応" : p.pse_mark === false ? "PSEマーク記載なし" : ""}</span>
        ${buyLink}
      </div>
      </div>
    </article>
  `;
}

function renderResults(products) {
  currentMatched = sortProducts(products, sortSelect.value);
  resultCount.textContent = `${currentMatched.length}件 見つかりました`;
  visibleCount = PAGE_SIZE;
  renderVisiblePage();
}

function renderVisiblePage() {
  if (currentMatched.length === 0) {
    resultList.innerHTML = `<div class="empty-state">条件に合う製品が見つかりませんでした。条件を減らして再検索してください。</div>`;
    return;
  }

  const visible = currentMatched.slice(0, visibleCount);
  resultList.innerHTML = visible.map(cardHtml).join("");

  if (visibleCount < currentMatched.length) {
    const remaining = currentMatched.length - visibleCount;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn-load-more";
    btn.textContent = `もっと見る(残り${remaining}件)`;
    btn.addEventListener("click", () => {
      visibleCount += PAGE_SIZE;
      renderVisiblePage();
    });
    resultList.appendChild(btn);
  }
}

function renderActiveConditions(f) {
  const chips = [];

  f.types.forEach(t => chips.push({ label: TYPE_LABELS[t] || t, clear: () => setChecked(form, "type", t, false) }));
  if (f.capacityMin > 0) chips.push({ label: `${f.capacityMin.toLocaleString()}mAh以上`, clear: () => { form.capacity_min.value = "0"; } });
  if (f.weightMax > 0) chips.push({ label: `${f.weightMax}g以下`, clear: () => { form.weight_max.value = "0"; } });
  if (f.thicknessMax > 0) chips.push({ label: `厚さ${f.thicknessMax}mm以下`, clear: () => { form.thickness_max.value = "0"; } });
  f.colors.forEach(c => chips.push({ label: `カラー: ${c}`, clear: () => setChecked(form, "color", c, false) }));
  if (f.outputMin > 0) chips.push({ label: `${f.outputMin}W以上`, clear: () => { form.output_min.value = "0"; } });
  f.fastCharge.forEach(v => chips.push({ label: `急速充電: ${v}`, clear: () => setChecked(form, "fast_charge", v, false) }));
  if (f.portsMin > 0) chips.push({ label: `ポート${f.portsMin}以上`, clear: () => { form.ports_min.value = "0"; } });
  if (f.simultaneousMin > 0) chips.push({ label: `同時充電${f.simultaneousMin}台以上`, clear: () => { form.simultaneous_min.value = "0"; } });
  if (f.priceMax > 0) chips.push({ label: `${f.priceMax.toLocaleString()}円以下`, clear: () => { form.price_max.value = "0"; } });
  if (f.pseRequired) chips.push({ label: "PSEマーク対応のみ", clear: () => { form.pse_required.checked = false; } });
  f.designStyle.forEach(d => chips.push({ label: DESIGN_LABELS[d] || d, clear: () => setChecked(form, "design_style", d, false) }));

  if (chips.length === 0) {
    activeConditionsEl.innerHTML = `<span class="condition-chip none">条件は指定されていません(すべての製品を表示中)</span>`;
    return;
  }

  activeConditionsEl.innerHTML = "";
  chips.forEach((chip, i) => {
    const el = document.createElement("span");
    el.className = "condition-chip";
    el.innerHTML = `${chip.label} <button type="button" aria-label="${chip.label}の条件を外す">×</button>`;
    el.querySelector("button").addEventListener("click", () => {
      chip.clear();
      clearActivePresetHighlight();
      applyFiltersAndRender();
    });
    activeConditionsEl.appendChild(el);
  });
}

function applyFiltersAndRender() {
  const filters = getFilters();
  const matched = PRODUCTS.filter(p => matchesFilters(p, filters));
  renderActiveConditions(filters);
  renderResults(matched);
}

function clearActivePresetHighlight() {
  presetGrid.querySelectorAll(".preset-card").forEach(btn => btn.classList.remove("is-active"));
}

presetGrid.addEventListener("click", (e) => {
  const card = e.target.closest(".preset-card");
  if (!card) return;
  const presetKey = card.dataset.preset;
  form.reset();
  clearActivePresetHighlight();
  if (presetKey !== "reset") {
    PRESETS[presetKey](form);
    card.classList.add("is-active");
  }
  applyFiltersAndRender();
  updateLiveCount();
  document.querySelector(".results-panel").scrollIntoView({ behavior: "smooth", block: "start" });
});

form.addEventListener("submit", (e) => {
  e.preventDefault();
  clearActivePresetHighlight();
  applyFiltersAndRender();
});

form.addEventListener("reset", () => {
  clearActivePresetHighlight();
  setTimeout(() => {
    applyFiltersAndRender();
    updateLiveCount();
  }, 0);
});

sortSelect.addEventListener("change", () => {
  applyFiltersAndRender();
});

function updateLiveCount() {
  const filters = getFilters();
  const count = PRODUCTS.filter(p => matchesFilters(p, filters)).length;
  if (count === PRODUCTS.length) {
    liveCountHint.textContent = `この内容で提案すると ${count}件 が見つかります(現在の全件数)`;
  } else if (count === 0) {
    liveCountHint.textContent = `この内容だと 0件 です。条件を減らしてみてください`;
  } else {
    liveCountHint.textContent = `この内容で提案すると ${count}件 が見つかります`;
  }
}

form.addEventListener("change", updateLiveCount);

loadData();
