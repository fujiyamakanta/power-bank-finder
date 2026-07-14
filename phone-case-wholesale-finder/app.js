const CASE_TYPE_ICONS = {
  "手帳型": "📔",
  "クリア": "🔍",
  "耐衝撃": "🛡️",
  "シンプル": "⬜",
  "ショルダー型": "🎒",
  "バンド一体型": "⌚",
  "スリーブ型": "💻",
  "ハードケース": "🖥️"
};

function iconFor(product) {
  const t = (product.case_type || [])[0];
  return CASE_TYPE_ICONS[t] || "📱";
}

const BRAND_DEVICE_MAP = {
  "Apple": ["iPhone", "iPad", "Apple Watch", "MacBook"],
  "Android": ["Galaxy", "OPPO", "Xperia", "Google Pixel", "AQUOS", "京セラ", "Xiaomi", "ARROWS"]
};

const PAGE_SIZE = 12;
let visibleCount = PAGE_SIZE;
let currentMatched = [];

let PRODUCTS = [];
let MODEL_CATALOG = {};

const resultList = document.getElementById("result-list");
const resultCount = document.getElementById("result-count");
const sortSelect = document.getElementById("sort-select");
const activeConditionsEl = document.getElementById("active-conditions");
const liveCountHint = document.getElementById("live-count-hint");
const navTree = document.getElementById("nav-tree");
const materialGroup = document.getElementById("material-group");
const casetypeGroup = document.getElementById("casetype-group");
const colorGroup = document.getElementById("color-group");
const featureGroup = document.getElementById("feature-group");
const priceMaxSelect = document.getElementById("price_max");
const moqMaxSelect = document.getElementById("moq_max");
const resetBtn = document.getElementById("reset-btn");

async function loadData() {
  try {
    const res = await fetch("data.json", { cache: "no-store" });
    PRODUCTS = await res.json();
  } catch (e) {
    console.error("データの読み込みに失敗しました", e);
    PRODUCTS = [];
  }
  try {
    const catalogRes = await fetch("model-catalog.json", { cache: "no-store" });
    MODEL_CATALOG = await catalogRes.json();
  } catch (e) {
    console.error("機種カタログの読み込みに失敗しました", e);
    MODEL_CATALOG = {};
  }
  buildNavTree();
  populateChipOptions(materialGroup, "material", collectValues("material"));
  populateChipOptions(casetypeGroup, "case_type", collectValues("case_type"));
  populateChipOptions(colorGroup, "color", collectValues("colors"));
  populateChipOptions(featureGroup, "feature", collectValues("features"));
  applyFiltersAndRender();
  updateLiveCount();
}

function collectValues(field) {
  const values = new Set();
  PRODUCTS.forEach(p => (p[field] || []).forEach(v => values.add(v)));
  return [...values].sort();
}

function buildNavTree() {
  navTree.innerHTML = "";
  Object.entries(BRAND_DEVICE_MAP).forEach(([brand, deviceTypes]) => {
    const relevantTypes = deviceTypes.filter(dt =>
      PRODUCTS.some(p => p.device_type === dt) || (MODEL_CATALOG[dt] || []).length > 0
    );
    if (relevantTypes.length === 0) return;

    const brandEl = document.createElement("details");
    brandEl.className = "nav-brand";
    const brandSummary = document.createElement("summary");
    brandSummary.textContent = brand;
    brandEl.appendChild(brandSummary);

    const devicesWrap = document.createElement("div");
    devicesWrap.className = "nav-devices";

    relevantTypes.forEach(dt => {
      const productModels = new Set(
        PRODUCTS.filter(p => p.device_type === dt).flatMap(p => p.compatible_models || [])
      );
      const catalogModels = MODEL_CATALOG[dt] || [];
      const models = catalogModels.length > 0 ? catalogModels : [...productModels].sort();

      const deviceEl = document.createElement("details");
      deviceEl.className = "nav-device";
      const deviceSummary = document.createElement("summary");
      deviceSummary.textContent = dt;
      deviceEl.appendChild(deviceSummary);

      const modelsWrap = document.createElement("div");
      modelsWrap.className = "chip-group nav-models";
      modelsWrap.innerHTML = models.map(m => {
        const hasProduct = productModels.has(m);
        const label = hasProduct ? m : `${m} (Amazon検索)`;
        return `<label class="chip${hasProduct ? "" : " chip-empty"}"><input type="checkbox" name="model" value="${m}"><span>${label}</span></label>`;
      }).join("");
      deviceEl.appendChild(modelsWrap);

      devicesWrap.appendChild(deviceEl);
    });

    brandEl.appendChild(devicesWrap);
    navTree.appendChild(brandEl);
  });
}

function populateChipOptions(container, name, values) {
  container.innerHTML = values.map(v => `
    <label class="chip"><input type="checkbox" name="${name}" value="${v}"><span>${v}</span></label>
  `).join("");
}

function getCheckedValues(name) {
  return [...document.querySelectorAll(`input[name="${name}"]:checked`)].map(el => el.value);
}

function setChecked(name, value, checked) {
  const input = [...document.querySelectorAll(`input[name="${name}"]`)].find(el => el.value === value);
  if (input) input.checked = checked;
}

function getFilters() {
  return {
    models: getCheckedValues("model"),
    materials: getCheckedValues("material"),
    caseTypes: getCheckedValues("case_type"),
    colors: getCheckedValues("color"),
    features: getCheckedValues("feature"),
    priceMax: Number(priceMaxSelect.value || 0),
    moqMax: Number(moqMaxSelect.value || 0)
  };
}

function matchesFilters(product, f) {
  if (f.models.length > 0) {
    const pm = product.compatible_models || [];
    if (!f.models.some(m => pm.includes(m))) return false;
  }
  if (f.materials.length > 0) {
    const mat = product.material || [];
    if (!f.materials.some(m => mat.includes(m))) return false;
  }
  if (f.caseTypes.length > 0) {
    const ct = product.case_type || [];
    if (!f.caseTypes.some(t => ct.includes(t))) return false;
  }
  if (f.colors.length > 0) {
    const pc = product.colors || [];
    if (!f.colors.some(c => pc.includes(c))) return false;
  }
  if (f.features.length > 0) {
    const pf = product.features || [];
    if (!f.features.every(feat => pf.includes(feat))) return false;
  }
  if (f.priceMax > 0) {
    if (product.price_jpy_ref == null || product.price_jpy_ref > f.priceMax) return false;
  }
  if (f.moqMax > 0) {
    if (product.moq_ref == null || product.moq_ref > f.moqMax) return false;
  }
  return true;
}

function sortProducts(products, sortKey) {
  const sorted = [...products];
  switch (sortKey) {
    case "price_asc":
      sorted.sort((a, b) => (a.price_jpy_ref ?? Infinity) - (b.price_jpy_ref ?? Infinity));
      break;
    case "price_desc":
      sorted.sort((a, b) => (b.price_jpy_ref ?? -Infinity) - (a.price_jpy_ref ?? -Infinity));
      break;
    case "moq_asc":
      sorted.sort((a, b) => (a.moq_ref ?? Infinity) - (b.moq_ref ?? Infinity));
      break;
  }
  return sorted;
}

function cardHtml(p) {
  const allModels = p.compatible_models || [];
  const modelBadges = allModels.slice(0, 2).map(m => `<span class="type-badge">${m}</span>`).join("");
  const extraModels = allModels.length > 2 ? `<span class="type-badge">+${allModels.length - 2}</span>` : "";
  const materials = (p.material || []).join(" / ") || "-";
  const caseTypes = (p.case_type || []).join(" / ") || "-";
  const priceText = p.price_jpy_ref != null ? `¥${p.price_jpy_ref.toLocaleString()}` : "単価不明";
  const moqText = p.moq_ref != null ? `${p.moq_ref.toLocaleString()}個〜` : "不明";
  const buyLink = p.amazon_url
    ? `<a class="buy-link" href="${p.amazon_url}" target="_blank" rel="noopener noreferrer">Amazonで見る →</a>`
    : `<span class="buy-link" style="color:var(--muted)">商品リンク未登録</span>`;

  return `
    <article class="result-card">
      <div class="result-photo" aria-hidden="true">${iconFor(p)}</div>
      <div class="result-body">
      <div class="result-card-top">
        <div class="result-name">${p.name}</div>
        <div class="result-maker">${p.brand || ""}</div>
      </div>
      <div class="result-price">${priceText}<span class="price-unit">目安/個</span></div>
      <div class="result-types">${modelBadges}${extraModels}</div>
      <div class="spec-grid">
        <div><span>素材: </span>${materials}</div>
        <div><span>タイプ: </span>${caseTypes}</div>
        <div><span>ロット: </span>${moqText}</div>
      </div>
      <div class="result-footer">
        <span class="pse-badge">単価・ロットは参考値です</span>
        ${buyLink}
      </div>
      </div>
    </article>
  `;
}

let currentFilters = null;

function renderResults(products, filters) {
  currentFilters = filters;
  currentMatched = sortProducts(products, sortSelect.value);
  resultCount.textContent = `${currentMatched.length}件 見つかりました`;
  visibleCount = PAGE_SIZE;
  renderVisiblePage();
}

function amazonSearchUrl(keyword) {
  return `https://www.amazon.co.jp/s?k=${encodeURIComponent(keyword + " ケース")}`;
}

function emptyStateHtml() {
  const models = currentFilters ? currentFilters.models : [];
  if (models.length === 0) {
    return `<div class="empty-state">条件に合う商品が見つかりませんでした。条件を減らして再検索してください。</div>`;
  }
  const links = models.map(m => `
    <a class="amazon-search-link" href="${amazonSearchUrl(m)}" target="_blank" rel="noopener noreferrer">
      ${m} のケースをAmazonで検索する →
    </a>
  `).join("");
  return `
    <div class="empty-state">
      <p>この機種の商品データはまだ登録されていません。下のリンクからAmazonで直接検索できます。</p>
      <div class="amazon-search-links">${links}</div>
    </div>
  `;
}

function renderVisiblePage() {
  if (currentMatched.length === 0) {
    resultList.innerHTML = emptyStateHtml();
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

  f.models.forEach(m => chips.push({ label: m, clear: () => setChecked("model", m, false) }));
  f.materials.forEach(m => chips.push({ label: m, clear: () => setChecked("material", m, false) }));
  f.caseTypes.forEach(t => chips.push({ label: t, clear: () => setChecked("case_type", t, false) }));
  f.colors.forEach(c => chips.push({ label: `カラー: ${c}`, clear: () => setChecked("color", c, false) }));
  f.features.forEach(v => chips.push({ label: v, clear: () => setChecked("feature", v, false) }));
  if (f.priceMax > 0) chips.push({ label: `${f.priceMax.toLocaleString()}円以下`, clear: () => { priceMaxSelect.value = "0"; } });
  if (f.moqMax > 0) chips.push({ label: `ロット${f.moqMax.toLocaleString()}個以下`, clear: () => { moqMaxSelect.value = "0"; } });

  if (chips.length === 0) {
    activeConditionsEl.innerHTML = `<span class="condition-chip none">条件は指定されていません(すべての商品を表示中)</span>`;
    return;
  }

  activeConditionsEl.innerHTML = "";
  chips.forEach((chip) => {
    const el = document.createElement("span");
    el.className = "condition-chip";
    el.innerHTML = `${chip.label} <button type="button" aria-label="${chip.label}の条件を外す">×</button>`;
    el.querySelector("button").addEventListener("click", () => {
      chip.clear();
      applyFiltersAndRender();
      updateLiveCount();
    });
    activeConditionsEl.appendChild(el);
  });
}

function applyFiltersAndRender() {
  const filters = getFilters();
  const matched = PRODUCTS.filter(p => matchesFilters(p, filters));
  renderActiveConditions(filters);
  renderResults(matched, filters);
}

function updateLiveCount() {
  const filters = getFilters();
  const count = PRODUCTS.filter(p => matchesFilters(p, filters)).length;
  if (count === PRODUCTS.length) {
    liveCountHint.textContent = `この内容で絞り込むと ${count}件 が見つかります(現在の全件数)`;
  } else if (count === 0) {
    liveCountHint.textContent = `この内容だと 0件 です。条件を減らしてみてください`;
  } else {
    liveCountHint.textContent = `この内容で絞り込むと ${count}件 が見つかります`;
  }
}

function resetAllFilters() {
  document.querySelectorAll('input[type="checkbox"]').forEach(el => { el.checked = false; });
  priceMaxSelect.value = "0";
  moqMaxSelect.value = "0";
  document.querySelectorAll("details[open]").forEach(el => el.removeAttribute("open"));
}

document.addEventListener("change", (e) => {
  if (e.target.matches('input[type="checkbox"], select') && e.target.id !== "sort-select") {
    applyFiltersAndRender();
    updateLiveCount();
  }
});

sortSelect.addEventListener("change", () => {
  applyFiltersAndRender();
});

resetBtn.addEventListener("click", () => {
  resetAllFilters();
  applyFiltersAndRender();
  updateLiveCount();
});

loadData();
