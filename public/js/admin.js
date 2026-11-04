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

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);
}

function safeImageUrl(value) {
  if (typeof value !== "string" || !value) return "";
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  try {
    const url = new URL(value, location.origin);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
  } catch {
    return "";
  }
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
  const res = await fetch("/api/upload", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ files: files.map((file) => ({ type: file.type })) }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Upload failed");
  const uploads = data.uploads || [];
  const results = await Promise.all(uploads.map(async (upload, index) => {
    const response = await fetch(upload.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": files[index].type, "x-upsert": "true" },
      body: files[index],
    });
    if (!response.ok) throw new Error(`Image upload failed (${response.status}).`);
    return upload.url;
  }));
  return results;
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
  const image = safeImageUrl(src);
  el.innerHTML = image ? `<img src="${escapeHtml(image)}" alt="" />` : "";
}

function renderProductThumbs() {
  productThumbs.innerHTML = productImages
    .map(
      (src, i) => `
      <div style="position:relative">
        <img src="${escapeHtml(safeImageUrl(src))}" alt="" />
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
    .map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`)
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
            <strong>${escapeHtml(c.name)}</strong>
            <div class="muted">${escapeHtml(c.subtitle || "")}</div>
            <div class="field" style="margin-top:8px">
              <input data-rename="${escapeHtml(c.id)}" value="${escapeHtml(c.name)}" />
            </div>
            <div class="field" style="margin-top:8px">
              <input data-subtitle="${escapeHtml(c.id)}" value="${escapeHtml(c.subtitle || "")}" placeholder="English subtitle" />
            </div>
          </div>
          <div style="display:flex;flex-direction:column;gap:8px">
            <button type="button" class="file-btn" data-save-cat="${escapeHtml(c.id)}" style="border:0">Save</button>
            <button class="danger" data-del-cat="${escapeHtml(c.id)}">Remove</button>
          </div>
        </div>
      </div>`
    )
    .join("") || `<p class="muted">No categories yet.</p>`;
  list.querySelectorAll("[data-save-cat]").forEach((b) => {
    b.addEventListener("click", async () => {
      const id = b.getAttribute("data-save-cat");
      const input = [...list.querySelectorAll("[data-rename]")].find((item) => item.dataset.rename === id);
      const subtitle = [...list.querySelectorAll("[data-subtitle]")].find((item) => item.dataset.subtitle === id);
      try {
        await api(`/api/categories/${encodeURIComponent(id)}`, {
          method: "PUT",
          body: JSON.stringify({ name: input.value, subtitle: subtitle ? subtitle.value : "" }),
        });
        await refresh();
        toast("Category updated");
      } catch (ex) {
        toast(ex.message);
      }
    });
  });
  list.querySelectorAll("[data-del-cat]").forEach((b) => {
    b.addEventListener("click", async () => {
      if (!confirm("Delete this category and its products?")) return;
      try {
        await api(`/api/categories/${encodeURIComponent(b.getAttribute("data-del-cat"))}`, { method: "DELETE" });
        await refresh();
        toast("Category removed");
      } catch (ex) {
        toast(ex.message);
      }
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
            <strong>${escapeHtml(p.name)}</strong>
            <div class="muted">${escapeHtml(byCat[p.categoryId] || "")} · ${escapeHtml(p.subtitle || "")}</div>
            <div class="thumbs">${(p.images || []).map((src) => `<img src="${escapeHtml(safeImageUrl(src))}" alt="" />`).join("")}</div>
          </div>
          <div style="display:flex;flex-direction:column;gap:8px">
            <button type="button" class="file-btn" data-edit="${escapeHtml(p.id)}" style="border:0">Edit</button>
            <button class="danger" data-del-p="${escapeHtml(p.id)}">Remove</button>
          </div>
        </div>
      </div>`
    )
    .join("") || `<p class="muted">No products yet.</p>`;
  list.querySelectorAll("[data-del-p]").forEach((b) => {
    b.addEventListener("click", async () => {
      if (!confirm("Remove this product?")) return;
      try {
        await api(`/api/products/${encodeURIComponent(b.getAttribute("data-del-p"))}`, { method: "DELETE" });
        await refresh();
        toast("Product removed");
      } catch (ex) {
        toast(ex.message);
      }
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
  try {
    await api("/api/logout", { method: "POST" });
    location.reload();
  } catch (ex) {
    toast(ex.message);
  }
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
  try {
    const body = Object.fromEntries(new FormData(settingsForm).entries());
    await api("/api/settings", { method: "PUT", body: JSON.stringify(body) });
    toast("Website saved");
    await refresh();
  } catch (ex) {
    toast(ex.message);
  }
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
  try {
    const body = Object.fromEntries(new FormData(catForm).entries());
    await api("/api/categories", { method: "POST", body: JSON.stringify(body) });
    catForm.reset();
    await refresh();
    toast("Category added");
  } catch (ex) {
    toast(ex.message);
  }
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
    toast("Could not check the admin session. Refresh and try again.");
  }
})();
