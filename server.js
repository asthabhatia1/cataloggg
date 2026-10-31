const path = require("path");
const fs = require("fs");
const express = require("express");
const session = require("express-session");
const multer = require("multer");

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = "reet4444";
const ROOT = __dirname;
const IS_VERCEL = Boolean(process.env.VERCEL);
const BUNDLED_DATA = path.join(ROOT, "data", "store.json");
const DATA_FILE = IS_VERCEL ? path.join("/tmp", "store.json") : BUNDLED_DATA;
const UPLOAD_DIR = IS_VERCEL ? path.join("/tmp", "uploads") : path.join(ROOT, "uploads");

fs.mkdirSync(path.join(ROOT, "data"), { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (IS_VERCEL && !fs.existsSync(DATA_FILE) && fs.existsSync(BUNDLED_DATA)) {
  fs.copyFileSync(BUNDLED_DATA, DATA_FILE);
}

function toEnglishText(value) {
  return String(value || "")
    .replace(/[\u3000-\u303f\u3400-\u9fff\uf900-\ufaff]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeStore(store) {
  const s = store.settings || {};
  store.settings = {
    ...s,
    businessName: toEnglishText(s.businessName),
    tagline: toEnglishText(s.tagline),
    phoneDisplay: toEnglishText(s.phoneDisplay),
    whatsapp: String(s.whatsapp || "").replace(/\D/g, ""),
    about: toEnglishText(s.about),
    banner: String(s.banner || ""),
    avatar: String(s.avatar || ""),
  };
  store.categories = (store.categories || []).map((c) => ({
    ...c,
    name: toEnglishText(c.name),
    subtitle: toEnglishText(c.subtitle),
  }));
  store.products = (store.products || []).map((p) => ({
    ...p,
    name: toEnglishText(p.name),
    subtitle: toEnglishText(p.subtitle),
    description: toEnglishText(p.description),
    price: toEnglishText(p.price),
  }));
  return store;
}

function readStore() {
  return sanitizeStore(JSON.parse(fs.readFileSync(DATA_FILE, "utf8")));
}

function writeStore(data) {
  const clean = sanitizeStore(data);
  fs.writeFileSync(DATA_FILE, JSON.stringify(clean, null, 2));
}

function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.admin) return next();
  return res.status(401).json({ error: "Unauthorized" });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase() || ".jpg";
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 12 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files are allowed"));
    }
    cb(null, true);
  },
});

const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "2mb" }));
app.use(
  session({
    name: "catalog.sid",
    secret: "reet-catalog-secret-reet4444",
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: "lax", maxAge: 7 * 24 * 60 * 60 * 1000 },
  })
);

app.use("/uploads", express.static(UPLOAD_DIR));
app.use(express.static(path.join(ROOT, "public")));

app.get("/api/catalog", (_req, res) => {
  const store = readStore();
  const categories = [...store.categories].sort((a, b) => (a.order || 0) - (b.order || 0));
  res.json({ settings: store.settings, categories, products: store.products });
});

app.post("/api/login", (req, res) => {
  const password = String((req.body && req.body.password) || "");
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Wrong password" });
  }
  req.session.admin = true;
  res.json({ ok: true });
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get("/api/me", (req, res) => {
  res.json({ admin: Boolean(req.session && req.session.admin) });
});

app.put("/api/settings", requireAdmin, (req, res) => {
  const store = readStore();
  const next = req.body || {};
  store.settings = {
    ...store.settings,
    businessName: String(next.businessName || "").trim() || store.settings.businessName,
    tagline: String(next.tagline || ""),
    phoneDisplay: String(next.phoneDisplay || ""),
    whatsapp: String(next.whatsapp || "").replace(/\D/g, ""),
    about: String(next.about || ""),
    banner: String(next.banner || ""),
    avatar: String(next.avatar || ""),
  };
  writeStore(store);
  res.json(store.settings);
});

app.post("/api/categories", requireAdmin, (req, res) => {
  const store = readStore();
  const name = String((req.body && req.body.name) || "").trim();
  if (!name) return res.status(400).json({ error: "Name is required" });
  const category = {
    id: uid("cat"),
    name,
    subtitle: String((req.body && req.body.subtitle) || ""),
    order: store.categories.length,
  };
  store.categories.push(category);
  writeStore(store);
  res.json(category);
});

app.put("/api/categories/:id", requireAdmin, (req, res) => {
  const store = readStore();
  const category = store.categories.find((c) => c.id === req.params.id);
  if (!category) return res.status(404).json({ error: "Not found" });
  if (req.body.name != null) category.name = String(req.body.name).trim() || category.name;
  if (req.body.subtitle != null) category.subtitle = String(req.body.subtitle);
  if (req.body.order != null) category.order = Number(req.body.order) || 0;
  writeStore(store);
  res.json(category);
});

app.delete("/api/categories/:id", requireAdmin, (req, res) => {
  const store = readStore();
  store.categories = store.categories.filter((c) => c.id !== req.params.id);
  store.products = store.products.filter((p) => p.categoryId !== req.params.id);
  writeStore(store);
  res.json({ ok: true });
});

app.post("/api/products", requireAdmin, (req, res) => {
  const store = readStore();
  const body = req.body || {};
  const name = String(body.name || "").trim();
  const categoryId = String(body.categoryId || "");
  if (!name) return res.status(400).json({ error: "Name is required" });
  if (!store.categories.some((c) => c.id === categoryId)) {
    return res.status(400).json({ error: "Choose a category" });
  }
  const product = {
    id: uid("p"),
    categoryId,
    name,
    subtitle: String(body.subtitle || ""),
    description: String(body.description || ""),
    price: String(body.price || ""),
    images: Array.isArray(body.images) ? body.images.filter(Boolean) : [],
  };
  store.products.push(product);
  writeStore(store);
  res.json(product);
});

app.put("/api/products/:id", requireAdmin, (req, res) => {
  const store = readStore();
  const product = store.products.find((p) => p.id === req.params.id);
  if (!product) return res.status(404).json({ error: "Not found" });
  const body = req.body || {};
  if (body.name != null) product.name = String(body.name).trim() || product.name;
  if (body.subtitle != null) product.subtitle = String(body.subtitle);
  if (body.description != null) product.description = String(body.description);
  if (body.price != null) product.price = String(body.price);
  if (body.categoryId != null) product.categoryId = String(body.categoryId);
  if (Array.isArray(body.images)) product.images = body.images.filter(Boolean);
  writeStore(store);
  res.json(product);
});

app.delete("/api/products/:id", requireAdmin, (req, res) => {
  const store = readStore();
  store.products = store.products.filter((p) => p.id !== req.params.id);
  writeStore(store);
  res.json({ ok: true });
});

app.post("/api/upload", requireAdmin, upload.array("files", 12), (req, res) => {
  const urls = (req.files || []).map((f) => `/uploads/${f.filename}`);
  res.json({ urls });
});

app.get("/admin", (_req, res) => {
  res.sendFile(path.join(ROOT, "public", "admin.html"));
});

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api") || path.extname(req.path)) return next();
  res.sendFile(path.join(ROOT, "public", "index.html"));
});

app.use((err, _req, res, _next) => {
  res.status(400).json({ error: err.message || "Request failed" });
});

module.exports = app;

if (!IS_VERCEL) {
  app.listen(PORT, () => {
    console.log(`Catalog running at http://localhost:${PORT}`);
    console.log(`Admin: http://localhost:${PORT}/admin`);
  });
}
