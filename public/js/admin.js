const loginView = document.getElementById("loginView");
const adminView = document.getElementById("adminView");
const toastEl = document.getElementById("toast");
const settingsForm = document.getElementById("settingsForm");
const catForm = document.getElementById("catForm");
const productForm = document.getElementById("productForm");
const productThumbs = document.getElementById("productThumbs");

let catalog = { settings: {}, categories: [], products: [] };
let productImages = [];

function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  setTimeout(() => toastEl.classList.remove("show"), 1800);
}

async function api(url, opts = {}) {
  const res = await fetch(url, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

function setPhotoStatus(msg, isError = false) {
  const status = document.getElementById("photoStatus");
  const err = document.getElementById("photoError");
  if (status) status.textContent = isError ? "" : msg;
  if (err) err.textContent = isError ? msg : "";
}

async function uploadFiles(fileList) {
  const files = [...fileList];
  if (!files.length) return [];
  const body = new FormData();
  files.forEach((f) => body.append("files", f));
  const res = await fetch("/api/upload", { method: "POST", body, credentials: "include" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Upload failed");
  return data.urls || [];
}

async function pickAndUpload(input, { replace = false } = {}) {
  try {
    setPhotoStatus("Uploading photos…");
    const urls = await uploadFiles(input.files);
    if (!urls.length) throw new Error("No photos were uploaded");
    productImages = replace ? urls : productImages.concat(urls);
    renderProductThumbs();
    setPhotoStatus(`${urls.length} photo${urls.length > 1 ? "s" : ""} added. Save the product to keep them.`);
    toast("Photos added — click Add product to save");
  } catch (ex) {
    setPhotoStatus(ex.message, true);
    toast(ex.message);
  } finally {
    input.value = "";
  }
}

function preview(el, src) {
  el.innerHTML = src ? `<img src="${src}" alt="" />` : "";
}

function renderProductThumbs() {
  productThumbs.innerHTML = productImages
    .map(
      (src, i) => `
      <div style="position:relative">
        <img src="${src}" alt="" />
        <button type="button" data-rm="${i}" style="position:absolute;top:2px;right:2px;border:0;border-radius:6px;background:#111;color:#fff;width:22px;height:22px">×</button>
      </div>`
    )
    .join("");
  productThumbs.querySelectorAll("[data-rm]").forEach((b) => {
    b.addEventListener("click", () => {
      productImages.splice(Number(b.getAttribute("data-rm")), 1);
      renderProductThumbs();
    });
  });
}

function fillSettings() {
  const s = catalog.settings;
  settingsForm.businessName.value = s.businessName || "";
  settingsForm.phoneDisplay.value = s.phoneDisplay || "";
  settingsForm.whatsapp.value = s.whatsapp || "";
  settingsForm.tagline.value = s.tagline || "";
  settingsForm.about.value = s.about || "";
  settingsForm.banner.value = s.banner || "";
  settingsForm.avatar.value = s.avatar || "";
  preview(document.getElementById("bannerPreview"), s.banner);
  preview(document.getElementById("avatarPreview"), s.avatar);
}

function fillCategorySelect() {
  const sel = productForm.categoryId;
  sel.innerHTML = catalog.categories
    .map((c) => `<option value="${c.id}">${c.name}</option>`)
    .join("");
}

function renderCategories() {
  const list = document.getElementById("catList");
  list.innerHTML = catalog.categories
    .map(
      (c) => `
      <div class="row-card">
        <div class="row-between">
          <div style="flex:1">
            <strong>${c.name}</strong>
            <div class="muted">${c.subtitle || ""}</div>
            <div class="field" style="margin-top:8px">
              <input data-rename="${c.id}" value="${String(c.name).replace(/"/g, "&quot;")}" />
            </div>
            <div class="field" style="margin-top:8px">
              <input data-subtitle="${c.id}" value="${String(c.subtitle || "").replace(/"/g, "&quot;")}" placeholder="English subtitle" />
            </div>
          </div>
          <div style="display:flex;flex-direction:column;gap:8px">
            <button type="button" class="file-btn" data-save-cat="${c.id}" style="border:0">Save</button>
            <button class="danger" data-del-cat="${c.id}">Remove</button>
          </div>
        </div>
      </div>`
    )
    .join("") || `<p class="muted">No categories yet.</p>`;
  list.querySelectorAll("[data-save-cat]").forEach((b) => {
    b.addEventListener("click", async () => {
      const id = b.getAttribute("data-save-cat");
      const input = list.querySelector(`[data-rename="${id}"]`);
      const subtitle = list.querySelector(`[data-subtitle="${id}"]`);
      await api(`/api/categories/${id}`, {
        method: "PUT",
        body: JSON.stringify({ name: input.value, subtitle: subtitle ? subtitle.value : "" }),
      });
      await refresh();
      toast("Category updated");
    });
  });
  list.querySelectorAll("[data-del-cat]").forEach((b) => {
    b.addEventListener("click", async () => {
      if (!confirm("Delete this category and its products?")) return;
      await api(`/api/categories/${b.getAttribute("data-del-cat")}`, { method: "DELETE" });
      await refresh();
      toast("Category removed");
    });
  });
}

function renderProducts() {
  const list = document.getElementById("productList");
  const byCat = Object.fromEntries(catalog.categories.map((c) => [c.id, c.name]));
  list.innerHTML = catalog.products
    .map(
      (p) => `
      <div class="row-card">
        <div class="row-between">
          <div>
            <strong>${p.name}</strong>
            <div class="muted">${byCat[p.categoryId] || ""} · ${p.subtitle || ""}</div>
            <div class="thumbs">${(p.images || []).map((src) => `<img src="${src}" alt="" />`).join("")}</div>
          </div>
          <div style="display:flex;flex-direction:column;gap:8px">
            <button type="button" class="file-btn" data-edit="${p.id}" style="border:0">Edit</button>
            <button class="danger" data-del-p="${p.id}">Remove</button>
          </div>
        </div>
      </div>`
    )
    .join("") || `<p class="muted">No products yet.</p>`;
  list.querySelectorAll("[data-del-p]").forEach((b) => {
    b.addEventListener("click", async () => {
      if (!confirm("Remove this product?")) return;
      await api(`/api/products/${b.getAttribute("data-del-p")}`, { method: "DELETE" });
      await refresh();
      toast("Product removed");
    });
  });
  list.querySelectorAll("[data-edit]").forEach((b) => {
    b.addEventListener("click", () => startEdit(b.getAttribute("data-edit")));
  });
}

function startEdit(id) {
  const p = catalog.products.find((x) => x.id === id);
  if (!p) return;
  productForm.id.value = p.id;
  productForm.categoryId.value = p.categoryId;
  productForm.name.value = p.name;
  productForm.subtitle.value = p.subtitle || "";
  productForm.price.value = p.price || "";
  productForm.description.value = p.description || "";
  productImages = [...(p.images || [])];
  renderProductThumbs();
  document.getElementById("productSubmit").textContent = "Save product";
  document.getElementById("cancelEdit").classList.remove("hidden");
  document.querySelector('[data-tab="products"]').click();
  productForm.scrollIntoView({ behavior: "smooth" });
}

function resetProductForm() {
  productForm.reset();
  productForm.id.value = "";
  productImages = [];
  renderProductThumbs();
  setPhotoStatus("");
  document.getElementById("productSubmit").textContent = "Add product";
  document.getElementById("cancelEdit").classList.add("hidden");
  fillCategorySelect();
}

async function refresh() {
  catalog = await api("/api/catalog");
  fillSettings();
  fillCategorySelect();
  renderCategories();
  renderProducts();
}

function showAdmin() {
  loginView.classList.add("hidden");
  adminView.classList.remove("hidden");
}

document.getElementById("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = document.getElementById("loginError");
  err.textContent = "";
  try {
    await api("/api/login", {
      method: "POST",
      body: JSON.stringify({ password: document.getElementById("password").value }),
    });
    showAdmin();
    await refresh();
  } catch (ex) {
    err.textContent = ex.message;
  }
});

document.getElementById("logoutBtn").addEventListener("click", async () => {
  await api("/api/logout", { method: "POST" });
  location.reload();
});

document.querySelectorAll(".admin-nav [data-tab]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".admin-nav [data-tab]").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
    document.getElementById(`tab-${btn.getAttribute("data-tab")}`).classList.add("active");
  });
});

settingsForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const body = Object.fromEntries(new FormData(settingsForm).entries());
  await api("/api/settings", { method: "PUT", body: JSON.stringify(body) });
  toast("Website saved");
  await refresh();
});

document.getElementById("bannerPick").addEventListener("click", () => document.getElementById("bannerFile").click());
document.getElementById("avatarPick").addEventListener("click", () => document.getElementById("avatarFile").click());
document.getElementById("productPick").addEventListener("click", () => document.getElementById("productFiles").click());
document.getElementById("productReplace").addEventListener("click", () => {
  document.getElementById("productFiles").dataset.replace = "1";
  document.getElementById("productFiles").click();
});

document.getElementById("bannerFile").addEventListener("change", async (e) => {
  try {
    const urls = await uploadFiles(e.target.files);
    if (urls[0]) {
      settingsForm.banner.value = urls[0];
      preview(document.getElementById("bannerPreview"), urls[0]);
      toast("Banner uploaded — click Save website");
    }
  } catch (ex) {
    toast(ex.message);
  } finally {
    e.target.value = "";
  }
});

document.getElementById("avatarFile").addEventListener("change", async (e) => {
  try {
    const urls = await uploadFiles(e.target.files);
    if (urls[0]) {
      settingsForm.avatar.value = urls[0];
      preview(document.getElementById("avatarPreview"), urls[0]);
      toast("Avatar uploaded — click Save website");
    }
  } catch (ex) {
    toast(ex.message);
  } finally {
    e.target.value = "";
  }
});

catForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const body = Object.fromEntries(new FormData(catForm).entries());
  await api("/api/categories", { method: "POST", body: JSON.stringify(body) });
  catForm.reset();
  await refresh();
  toast("Category added");
});

productForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(productForm).entries());
  const payload = {
    categoryId: data.categoryId,
    name: data.name,
    subtitle: data.subtitle,
    price: data.price,
    description: data.description,
    images: productImages.filter(Boolean),
  };
  try {
    if (data.id) await api(`/api/products/${data.id}`, { method: "PUT", body: JSON.stringify(payload) });
    else await api("/api/products", { method: "POST", body: JSON.stringify(payload) });
    resetProductForm();
    await refresh();
    toast("Product saved");
  } catch (ex) {
    toast(ex.message);
  }
});

document.getElementById("productFiles").addEventListener("change", async (e) => {
  const replace = e.target.dataset.replace === "1";
  e.target.dataset.replace = "";
  if (!e.target.files.length) return;
  await pickAndUpload(e.target, { replace });
});

document.getElementById("productAddUrl").addEventListener("click", () => {
  const input = document.getElementById("productImageUrl");
  const url = String(input.value || "").trim();
  if (!url) {
    setPhotoStatus("Paste an image URL first", true);
    return;
  }
  productImages.push(url);
  renderProductThumbs();
  input.value = "";
  setPhotoStatus("Image URL added. Save the product to keep it.");
});

document.getElementById("cancelEdit").addEventListener("click", resetProductForm);

(async () => {
  try {
    const me = await api("/api/me");
    if (me.admin) {
      showAdmin();
      await refresh();
    }
  } catch {
    /* stay on login */
  }
})();
