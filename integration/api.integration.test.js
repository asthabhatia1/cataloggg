const test = require("node:test");
const assert = require("node:assert/strict");

const baseUrl = process.env.TEST_BASE_URL?.replace(/\/+$/, "");
const password = process.env.TEST_ADMIN_PASSWORD;

if (!baseUrl || !password) {
  throw new Error("Set TEST_BASE_URL and TEST_ADMIN_PASSWORD to run API integration tests against a staging deployment.");
}

test("admin authentication and catalog CRUD work end to end", async () => {
  let cookie = "";
  let categoryId = "";
  let productId = "";
  let cascadeProductId = "";

  async function request(route, { method = "GET", body, authenticated = true } = {}) {
    const headers = { origin: baseUrl };
    if (cookie && authenticated) headers.cookie = cookie;
    if (body !== undefined) headers["content-type"] = "application/json";
    return fetch(`${baseUrl}${route}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  try {
    const denied = await request("/api/login", { method: "POST", body: { password: "wrong-password" }, authenticated: false });
    assert.equal(denied.status, 401);

    const login = await request("/api/login", { method: "POST", body: { password }, authenticated: false });
    assert.equal(login.status, 200);
    cookie = login.headers.get("set-cookie")?.split(";")[0] || "";
    assert.match(cookie, /^catalog\.sid=/);
    const me = await request("/api/me");
    assert.equal((await me.json()).admin, true);

    const categoryResponse = await request("/api/categories", {
      method: "POST",
      body: { name: `Integration ${Date.now()}`, subtitle: "Temporary test category" },
    });
    assert.equal(categoryResponse.status, 200);
    categoryId = (await categoryResponse.json()).id;

    const categoryUpdate = await request(`/api/categories/${encodeURIComponent(categoryId)}`, {
      method: "PUT",
      body: { name: "Updated integration category", subtitle: "Updated subtitle" },
    });
    assert.equal(categoryUpdate.status, 200);
    assert.equal((await categoryUpdate.json()).name, "Updated integration category");

    const productResponse = await request("/api/products", {
      method: "POST",
      body: { categoryId, name: "Integration product", images: ["https://example.com/image.png"] },
    });
    assert.equal(productResponse.status, 200);
    productId = (await productResponse.json()).id;

    const updateResponse = await request(`/api/products/${encodeURIComponent(productId)}`, {
      method: "PUT",
      body: { name: "Updated integration product" },
    });
    assert.equal(updateResponse.status, 200);
    assert.equal((await updateResponse.json()).name, "Updated integration product");

    const catalogResponse = await request("/api/catalog");
    const catalog = await catalogResponse.json();
    assert.ok(catalog.categories.some((category) => category.id === categoryId));
    assert.ok(catalog.products.some((product) => product.id === productId));

    const deleteProduct = await request(`/api/products/${encodeURIComponent(productId)}`, { method: "DELETE" });
    assert.equal(deleteProduct.status, 200);
    const deletedProductId = productId;
    productId = "";
    const afterProductDelete = await (await request("/api/catalog")).json();
    assert.ok(!afterProductDelete.products.some((product) => product.id === deletedProductId));

    const cascadeProductResponse = await request("/api/products", {
      method: "POST",
      body: { categoryId, name: "Cascade test product" },
    });
    assert.equal(cascadeProductResponse.status, 200);
    cascadeProductId = (await cascadeProductResponse.json()).id;

    const deleteCategory = await request(`/api/categories/${encodeURIComponent(categoryId)}`, { method: "DELETE" });
    assert.equal(deleteCategory.status, 200);
    const deletedCategoryId = categoryId;
    const deletedCascadeProductId = cascadeProductId;
    categoryId = "";
    cascadeProductId = "";

    const afterDelete = await (await request("/api/catalog")).json();
    assert.ok(!afterDelete.categories.some((category) => category.id === deletedCategoryId));
    assert.ok(!afterDelete.products.some((product) => product.id === deletedCascadeProductId));

    const logout = await request("/api/logout", { method: "POST" });
    assert.equal(logout.status, 200);
    cookie = "";
    const unauthorized = await request("/api/products/not-a-real-product", { method: "DELETE" });
    assert.equal(unauthorized.status, 401);
  } finally {
    if (productId) await request(`/api/products/${encodeURIComponent(productId)}`, { method: "DELETE" });
    if (cascadeProductId) await request(`/api/products/${encodeURIComponent(cascadeProductId)}`, { method: "DELETE" });
    if (categoryId) await request(`/api/categories/${encodeURIComponent(categoryId)}`, { method: "DELETE" });
  }
});
