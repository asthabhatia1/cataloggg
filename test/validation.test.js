const test = require("node:test");
const assert = require("node:assert/strict");
const {
  cleanText,
  validateImageUrl,
  validateImages,
  validateCategoryId,
  validateOrder,
} = require("../lib/validation");
const { createSignedUpload, localUploadKey, storageConfig } = require("../lib/storage");

test("validates and trims bounded catalog text", () => {
  assert.equal(cleanText("  Salon capes ", "Name", 20, { required: true }), "Salon capes");
  assert.throws(() => cleanText(" ", "Name", 20, { required: true }), { status: 400 });
  assert.throws(() => cleanText("a".repeat(21), "Name", 20), { status: 400 });
});

test("allows only web or root-relative image URLs", () => {
  assert.equal(validateImageUrl("https://cdn.example/image.png"), "https://cdn.example/image.png");
  assert.equal(validateImageUrl("/images/item.png"), "/images/item.png");
  for (const value of ["javascript:alert(1)", "data:image/png;base64,abc", "//cdn.example/image.png", "file:///etc/passwd"]) {
    assert.throws(() => validateImageUrl(value), { status: 400 });
  }
});

test("limits the number and validates each product image", () => {
  assert.deepEqual(validateImages(["https://cdn.example/a.png"]), ["https://cdn.example/a.png"]);
  assert.throws(() => validateImages(Array(13).fill("/image.png")), { status: 400 });
  assert.throws(() => validateImages(["javascript:alert(1)"]), { status: 400 });
  assert.throws(() => validateImages("https://cdn.example/a.png"), { status: 400 });
});

test("requires product categories to exist", () => {
  const categories = [{ id: "cat-1" }];
  assert.equal(validateCategoryId(categories, "cat-1"), "cat-1");
  assert.throws(() => validateCategoryId(categories, "missing"), { status: 400 });
});

test("accepts only non-negative integer category order", () => {
  assert.equal(validateOrder(0), 0);
  assert.equal(validateOrder(3), 3);
  for (const value of [-1, 1.5, "2", NaN]) {
    assert.throws(() => validateOrder(value), { status: 400 });
  }
});

test("extracts safe local upload names", () => {
  assert.equal(localUploadKey("/uploads/item.png"), "item.png");
  assert.equal(localUploadKey("https://cdn.example/item.png"), null);
  assert.throws(() => localUploadKey("/uploads/../private.png"));
});

test("requires HTTPS Supabase project origins outside local development", (t) => {
  const oldUrl = process.env.SUPABASE_URL;
  const oldKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const oldBucket = process.env.SUPABASE_STORAGE_BUCKET;
  const oldEnvironment = process.env.NODE_ENV;
  t.after(() => {
    if (oldUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = oldKey;
    if (oldBucket === undefined) delete process.env.SUPABASE_STORAGE_BUCKET;
    else process.env.SUPABASE_STORAGE_BUCKET = oldBucket;
    if (oldEnvironment === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = oldEnvironment;
  });
  process.env.SUPABASE_SERVICE_ROLE_KEY = "server-only";
  process.env.SUPABASE_STORAGE_BUCKET = "catalog";
  process.env.NODE_ENV = "production";
  process.env.SUPABASE_URL = "http://example.com";
  assert.throws(() => storageConfig(), /HTTPS project origin/);
  process.env.SUPABASE_URL = "https://project.example";
  assert.equal(storageConfig().baseUrl, "https://project.example");
});

test("creates a signed upload and a public object URL", async (t) => {
  const oldUrl = process.env.SUPABASE_URL;
  const oldKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const oldBucket = process.env.SUPABASE_STORAGE_BUCKET;
  t.after(() => {
    if (oldUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = oldKey;
    if (oldBucket === undefined) delete process.env.SUPABASE_STORAGE_BUCKET;
    else process.env.SUPABASE_STORAGE_BUCKET = oldBucket;
  });
  process.env.SUPABASE_URL = "https://project.example";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "server-only-secret";
  process.env.SUPABASE_STORAGE_BUCKET = "catalog";
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, "https://project.example/storage/v1/object/upload/sign/catalog/image.png");
    assert.equal(options.headers.apikey, "server-only-secret");
    return new Response(JSON.stringify({ url: "/object/upload/sign/catalog/image.png?token=upload-token" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  const upload = await createSignedUpload("image.png");
  assert.equal(upload.uploadUrl, "https://project.example/storage/v1/object/upload/sign/catalog/image.png?token=upload-token");
  assert.equal(upload.url, "https://project.example/storage/v1/object/public/catalog/image.png");
});
