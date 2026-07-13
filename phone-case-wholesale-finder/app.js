const PAGE_SIZE = 12;
let visibleCount = PAGE_SIZE;
let currentMatched = [];

let PRODUCTS = [];

const form = document.getElementById("filter-form");
const resultList = document.getElementById("result-list");
const resultCount = document.getElementById("result-count");
const sortSelect = document.getElementById("sort-select");
const activeConditionsEl = document.getElementById("active-conditions");
const liveCountHint = document.getElementById("live-count-hint");
const modelGroup = document.getElementById("model-group");
const materialGroup = document.getElementById("material-group");
const casetypeGroup = document.getElementById("casetype-group");
const colorGroup = document.getElementById("color-group");
const featureGroup = document.getElementById("feature-group");

async function loadData() {
  try {
    const res = await fetch("data.json", { cache: "no-store" });
    PRODUCTS = await res.json();
  } catch (e) {
    console.error("データの読み込みに失敗しました", e);
    PRODUCTS = [];
  }
  populateChipOptions(modelGroup, "model", collectValues("compatible_models"));
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

function populateChipOptions(container, name, values) {
  container.innerHTML = values.map(v => `
    <label class="chip"><input type="checkbox" name="${name}" value="${v}"><span>${v}</span></label>
  `).join("");
}

function setChecked(f, name, value, checked) {
  const input = [...f.elements[name]].find(el => el.value === value);
  if (input) input.checked = checked;
}

function getFilters() {
  const formData = new FormData(form);
  return {
    models: formData.getAll("model"),
    materials: formData.getAll("material"),
    caseTypes: formData.getAll("case_type"),
    colors: formData.getAll("color"),
    features: formData.getAll("feature"),
    priceMax: Number(formData.get("price_max") || 0),
    moqMax: Number(formData.get("moq_max") || 0)
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
  const models = (p.compatible_models || []).map(m => `<span class="type-badge">${m}</span>`).join("");
  const materials = (p.material || []).join(" / ") || "-";
  const caseTypes = (p.case_type || []).join(" / ") || "-";
  const colors = (p.colors || []).join(" / ") || "-";
  const features = (p.features || []).join(" / ") || "-";
  const priceText = p.price_jpy_ref != null ? `¥${p.price_jpy_ref.toLocaleString()}` : "単価不明";
  const moqText = p.moq_ref != null ? `${p.moq_ref.toLocaleString()}個〜` : "不明";
  const buyLink = p.amazon_url
    ? `<a class="buy-link" href="${p.amazon_url}" target="_blank" rel="noopener noreferrer">Amazon商品ページを見る →</a>`
    : `<span class="buy-link" style="color:var(--muted)">商品リンク未登録</span>`;

  return `
    <article class="result-card">
      <div class="result-photo" aria-hidden="true">📱</div>
      <div class="result-body">
      <div class="result-card-top">
        <div>
          <div class="result-name">${p.name}</div>
          <div class="result-maker">${p.brand || ""}</div>
        </div>
        <div class="result-price">${priceText}<br><span style="font-size:0.72rem;color:var(--muted);font-weight:600;">目安/個</span></div>
      </div>
      <div class="result-types">${models}</div>
      <div class="spec-grid">
        <div><span>素材: </span>${materials}</div>
        <div><span>タイプ: </span>${caseTypes}</div>
        <div><span>カラー: </span>${colors}</div>
        <div><span>機能: </span>${features}</div>
        <div><span>想定ロット: </span>${moqText}</div>
      </div>
      ${p.notes ? `<div class="result-notes">${p.notes}</div>` : ""}
      <div class="result-footer">
        <span class="pse-badge">単価・ロットは参考値です</span>
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
    resultList.innerHTML = `<div class="empty-state">条件に合うスマホケースが見つかりませんでした。条件を減らして再検索してください。</div>`;
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

  f.models.forEach(m => chips.push({ label: m, clear: () => setChecked(form, "model", m, false) }));
  f.materials.forEach(m => chips.push({ label: m, clear: () => setChecked(form, "material", m, false) }));
  f.caseTypes.forEach(t => chips.push({ label: t, clear: () => setChecked(form, "case_type", t, false) }));
  f.colors.forEach(c => chips.push({ label: `カラー: ${c}`, clear: () => setChecked(form, "color", c, false) }));
  f.features.forEach(v => chips.push({ label: v, clear: () => setChecked(form, "feature", v, false) }));
  if (f.priceMax > 0) chips.push({ label: `${f.priceMax.toLocaleString()}円以下`, clear: () => { form.price_max.value = "0"; } });
  if (f.moqMax > 0) chips.push({ label: `ロット${f.moqMax.toLocaleString()}個以下`, clear: () => { form.moq_max.value = "0"; } });

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
  renderResults(matched);
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  applyFiltersAndRender();
});

form.addEventListener("reset", () => {
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
    liveCountHint.textContent = `この内容で絞り込むと ${count}件 が見つかります(現在の全件数)`;
  } else if (count === 0) {
    liveCountHint.textContent = `この内容だと 0件 です。条件を減らしてみてください`;
  } else {
    liveCountHint.textContent = `この内容で絞り込むと ${count}件 が見つかります`;
  }
}

form.addEventListener("change", updateLiveCount);

loadData();
