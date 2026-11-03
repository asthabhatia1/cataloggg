const CART_KEY = "catalog-cart-v1";
const app = document.getElementById("app");
const pageTitle = document.getElementById("pageTitle");
const backBtn = document.getElementById("backBtn");
const cartBtn = document.getElementById("cartBtn");
const shareBtn = document.getElementById("shareBtn");
const cartCount = document.getElementById("cartCount");
const toastEl = document.getElementById("toast");
const cartSheetRoot = document.getElementById("cartSheetRoot");
const sheetImg = document.getElementById("sheetImg");
const sheetName = document.getElementById("sheetName");
const sheetMeta = document.getElementById("sheetMeta");
const sheetSub = document.getElementById("sheetSub");

let catalog = { settings: {}, categories: [], products: [] };

function waLink(text) {
  const num = catalog.settings.whatsapp || "918920821103";
  const msg = encodeURIComponent(text || "Hi, I want to enquire about your catalog.");
  return `https://wa.me/${num}?text=${msg}`;
}

function imgSrc(src) {
  return src || "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=800&q=60";
}

function getCart() {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY) || "[]");
  } catch {
    return [];
  }
}

function setCart(items) {
  localStorage.setItem(CART_KEY, JSON.stringify(items));
  updateCartBadge();
}

function updateCartBadge() {
  const n = getCart().reduce((s, i) => s + i.qty, 0);
  cartCount.textContent = n;
  cartCount.classList.toggle("show", n > 0);
}

function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  setTimeout(() => toastEl.classList.remove("show"), 1800);
}

function closeCartSheet() {
  cartSheetRoot.classList.remove("open");
  cartSheetRoot.setAttribute("aria-hidden", "true");
}

function openCartSheet(product, qty) {
  const image = (product.images && product.images[0]) || "";
  sheetImg.src = imgSrc(image);
  sheetName.textContent = product.name;
  sheetMeta.textContent = [product.subtitle, `${qty} in cart`].filter(Boolean).join(" · ");
  sheetSub.textContent = qty > 1 ? "Quantity updated in your cart." : "This item is in your cart.";
  cartSheetRoot.classList.add("open");
  cartSheetRoot.setAttribute("aria-hidden", "false");
  cartCount.classList.remove("pop");
  void cartCount.offsetWidth;
  cartCount.classList.add("pop");
}

function addToCart(product, qty = 1) {
  const cart = getCart();
  const found = cart.find((i) => i.id === product.id);
  if (found) found.qty += qty;
  else {
    cart.push({
      id: product.id,
      name: product.name,
      subtitle: product.subtitle,
      image: (product.images && product.images[0]) || "",
      qty,
    });
  }
  setCart(cart);
  const item = getCart().find((i) => i.id === product.id);
  openCartSheet(product, item ? item.qty : qty);
}

function parseRoute() {
  const path = location.pathname.replace(/\/+$/, "") || "/";
  const parts = path.split("/").filter(Boolean);
  if (parts[0] === "cart") return { name: "cart" };
  if (parts[0] === "category" && parts[1]) return { name: "category", id: decodeURIComponent(parts[1]) };
  if (parts[0] === "product" && parts[1]) return { name: "product", id: decodeURIComponent(parts[1]) };
  return { name: "home" };
}

function go(path) {
  closeCartSheet();
  history.pushState({}, "", path);
  render();
}

function productById(id) {
  return catalog.products.find((p) => p.id === id);
}

function productsIn(catId) {
  return catalog.products.filter((p) => p.categoryId === catId);
}

function renderHome() {
  pageTitle.textContent = "Catalog";
  backBtn.classList.add("hidden");
  const s = catalog.settings;
  const cats = catalog.categories;
  app.innerHTML = `
    <section class="hero">
      <img src="${imgSrc(s.banner)}" alt="" />
      <div class="hero-copy">
        <a class="hero-phone" href="${waLink("Hi, I saw your catalog.")}">${s.phoneDisplay || "+91 89208 21103"}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
        </a>
        <p class="hero-tag">${s.tagline || ""}</p>
      </div>
    </section>
    ${cats
      .map((c) => {
        const items = productsIn(c.id);
        if (!items.length) return "";
        return `
          <div class="cat-head">
            <h2>${c.name}${c.subtitle ? `<span class="sub">${c.subtitle}</span>` : ""}</h2>
            <button class="see-all" data-cat="${c.id}">See all</button>
          </div>
          <div class="desktop-grid">
            ${items
              .slice(0, 6)
              .map(
                (p) => `
              <div class="product-row" data-open="${p.id}">
                <img class="thumb" src="${imgSrc(p.images && p.images[0])}" alt="" />
                <div class="meta">
                  <h3>${p.name}</h3>
                  <div class="muted">${p.subtitle || ""}</div>
                </div>
                <button class="add-btn" data-add="${p.id}" aria-label="Add">${plusSvg()}</button>
              </div>`
              )
              .join("")}
          </div>`;
      })
      .join("") || `<p class="empty">No products yet. Check back soon.</p>`}
  `;
  bindCatalogClicks();
}

function renderCategory(id) {
  const c = catalog.categories.find((x) => x.id === id);
  pageTitle.textContent = c ? c.name : "Category";
  backBtn.classList.remove("hidden");
  const items = productsIn(id);
  app.innerHTML = `
    <div class="product-grid">
      ${
        items
          .map(
            (p) => `
        <article class="card" data-open="${p.id}">
          <img class="cover" src="${imgSrc(p.images && p.images[0])}" alt="" />
          <div class="body">
            <div class="meta">
              <h3>${p.name}</h3>
              <div class="muted">${p.subtitle || ""}</div>
            </div>
            <button class="add-btn" data-add="${p.id}" aria-label="Add">${plusSvg()}</button>
          </div>
        </article>`
          )
          .join("") || `<p class="empty">No items in this category.</p>`
      }
    </div>
  `;
  bindCatalogClicks();
}

function renderProduct(id) {
  const p = productById(id);
  if (!p) {
    app.innerHTML = `<p class="empty">Product not found.</p>`;
    return;
  }
  pageTitle.textContent = "";
  backBtn.classList.remove("hidden");
  const s = catalog.settings;
  const images = p.images && p.images.length ? p.images : [imgSrc("")];
  const enquiry = `Hi, I want details for: ${p.name}${p.subtitle ? " (" + p.subtitle + ")" : ""}`;
  app.innerHTML = `
    <div class="product-detail">
      <div class="gallery">
        ${images.map((src) => `<img src="${imgSrc(src)}" alt="${p.name}" />`).join("")}
      </div>
      <div>
        <div class="p-title">
          <h1>${p.name}</h1>
          <div class="muted">${p.subtitle || ""}</div>
          ${p.price ? `<div style="margin-top:8px;font-weight:600">${p.price}</div>` : ""}
        </div>
        ${p.description ? `<p class="muted" style="margin:12px 0 0">${p.description}</p>` : ""}
        <a class="msg-biz" href="${waLink(enquiry)}">Message business</a>
        <div class="about">
          <img class="avatar" src="${imgSrc(s.avatar)}" alt="" />
          <div>
            <h3>About the business</h3>
            <strong>${s.phoneDisplay || ""}</strong>
            <p>${s.about || s.tagline || ""}</p>
          </div>
        </div>
        <button class="sticky-cart" data-add="${p.id}">Add to cart</button>
      </div>
    </div>
  `;
  bindCatalogClicks();
}

function renderCart() {
  pageTitle.textContent = "Cart";
  backBtn.classList.remove("hidden");
  const cart = getCart();
  if (!cart.length) {
    app.innerHTML = `<p class="empty">Your cart is empty.</p>`;
    return;
  }
  const lines = cart.map((i) => `${i.qty} x ${i.name}${i.subtitle ? " (" + i.subtitle + ")" : ""}`).join("\n");
  const orderText = `Order from catalog:\n${lines}\n\nPlease share availability and price.`;
  app.innerHTML = `
    ${cart
      .map(
        (i) => `
      <div class="cart-item">
        <img class="thumb" src="${imgSrc(i.image)}" alt="" />
        <div class="meta">
          <h3 style="margin:0;font-size:1rem">${i.name}</h3>
          <div class="muted">${i.subtitle || ""}</div>
        </div>
        <div class="qty">
          <button data-qty="${i.id}" data-d="-1">−</button>
          <span>${i.qty}</span>
          <button data-qty="${i.id}" data-d="1">+</button>
        </div>
      </div>`
      )
      .join("")}
    <a class="wa-order" href="${waLink(orderText)}">Order on WhatsApp</a>
  `;
  app.querySelectorAll("[data-qty]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-qty");
      const d = Number(btn.getAttribute("data-d"));
      const next = getCart()
        .map((i) => (i.id === id ? { ...i, qty: i.qty + d } : i))
        .filter((i) => i.qty > 0);
      setCart(next);
      renderCart();
    });
  });
}

function plusSvg() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>`;
}

function bindCatalogClicks() {
  app.querySelectorAll("[data-open]").forEach((el) => {
    el.addEventListener("click", (e) => {
      if (e.target.closest("[data-add]")) return;
      go(`/product/${el.getAttribute("data-open")}`);
    });
  });
  app.querySelectorAll("[data-add]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const p = productById(el.getAttribute("data-add"));
      if (p) addToCart(p);
    });
  });
  app.querySelectorAll("[data-cat]").forEach((el) => {
    el.addEventListener("click", () => go(`/category/${el.getAttribute("data-cat")}`));
  });
}

function render() {
  const route = parseRoute();
  if (route.name === "cart") renderCart();
  else if (route.name === "category") renderCategory(route.id);
  else if (route.name === "product") renderProduct(route.id);
  else renderHome();
}

backBtn.addEventListener("click", () => {
  if (history.length > 1) history.back();
  else go("/");
});
cartBtn.addEventListener("click", () => {
  closeCartSheet();
  go("/cart");
});
document.getElementById("sheetBackdrop").addEventListener("click", closeCartSheet);
document.getElementById("sheetContinue").addEventListener("click", closeCartSheet);
document.getElementById("sheetViewCart").addEventListener("click", () => {
  closeCartSheet();
  go("/cart");
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeCartSheet();
});
shareBtn.addEventListener("click", async () => {
  const url = location.origin + "/";
  try {
    if (navigator.share) await navigator.share({ title: catalog.settings.businessName || "Catalog", url });
    else {
      await navigator.clipboard.writeText(url);
      toast("Link copied");
    }
  } catch {
    /* cancelled */
  }
});
window.addEventListener("popstate", render);

async function init() {
  updateCartBadge();
  const res = await fetch("/api/catalog");
  catalog = await res.json();
  document.title = catalog.settings.businessName || "Catalog";
  render();
}

init();
