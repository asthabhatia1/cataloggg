const path = require("path");
const crypto = require("crypto");
const express = require("express");
const session = require("express-session");
const helmet = require("helmet");
const { Pool } = require("pg");
const PgSession = require("connect-pg-simple")(session);
const { storageConfig, createSignedUpload } = require("./lib/storage");
const { cleanText, validateImageUrl, validateImages, validateCategoryId, validateOrder } = require("./lib/validation");

const PORT = Number(process.env.PORT || 3000);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const SESSION_SECRET = process.env.SESSION_SECRET || "";
const DATABASE_URL = process.env.DATABASE_URL || "";
const IS_PRODUCTION = process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);
const ROOT = __dirname;

if (ADMIN_PASSWORD.length < 12) {
  throw new Error("ADMIN_PASSWORD must be set to at least 12 characters.");
}
if (SESSION_SECRET.length < 32) {
  throw new Error("SESSION_SECRET must be set to at least 32 characters.");
}
if (!DATABASE_URL) {
  throw new Error("DATABASE_URL must be set to a Supabase Postgres connection string.");
}
if (IS_PRODUCTION) {
  let databaseUrl;
  try {
    databaseUrl = new URL(DATABASE_URL);
  } catch {
    throw new Error("DATABASE_URL must be a valid Postgres connection string.");
  }
  if (
    !["postgres:", "postgresql:"].includes(databaseUrl.protocol)
    || !["require", "verify-ca", "verify-full"].includes(databaseUrl.searchParams.get("sslmode"))
  ) {
    throw new Error("Production DATABASE_URL must use Postgres with sslmode=require or stronger.");
  }
}
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured for image storage.");
}
const STORAGE_ORIGIN = storageConfig().baseUrl;

const pool = new Pool({
  connectionString: DATABASE_URL,
  max: 5,
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
});
pool.on("error", (error) => {
  console.error(JSON.stringify({ level: "error", event: "database.pool_error", message: error.message }));
});

const app = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        connectSrc: ["'self'", STORAGE_ORIGIN],
        frameAncestors: ["'none'"],
        imgSrc: ["'self'", "data:", "https:"],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        upgradeInsecureRequests: null,
      },
    },
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(
  session({
    name: "catalog.sid",
    secret: SESSION_SECRET,
    store: new PgSession({
      pool,
      tableName: "user_sessions",
      createTableIfMissing: true,
      pruneSessionInterval: 60,
    }),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: IS_PRODUCTION,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  })
);
app.use(express.static(path.join(ROOT, "public")));

const IMAGE_TYPES = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
  ["image/gif", ".gif"],
  ["image/avif", ".avif"],
  ["image/heic", ".heic"],
  ["image/heif", ".heif"],
  ["image/bmp", ".bmp"],
]);
function requireAdmin(req, res, next) {
  if (!req.session || !req.session.admin) return res.status(401).json({ error: "Unauthorized" });
  const origin = req.get("origin");
  if (!origin || origin !== `${req.protocol}://${req.get("host")}`) {
    return res.status(403).json({ error: "Request origin not allowed." });
  }
  return next();
}

function clientKey(req) {
  return crypto.createHash("sha256").update(String(req.ip || "unknown")).digest("hex");
}

async function loginRateLimit(req, res, next) {
  try {
    const result = await pool.query(
      `INSERT INTO auth_login_attempts (key, window_started_at, attempts)
       VALUES ($1, now(), 1)
       ON CONFLICT (key) DO UPDATE SET
         window_started_at = CASE
           WHEN auth_login_attempts.window_started_at < now() - interval '15 minutes' THEN now()
           ELSE auth_login_attempts.window_started_at
         END,
         attempts = CASE
           WHEN auth_login_attempts.window_started_at < now() - interval '15 minutes' THEN 1
           ELSE auth_login_attempts.attempts + 1
         END
       RETURNING attempts`,
      [clientKey(req)]
    );
    if (result.rows[0].attempts > 10) {
      return res.status(429).json({ error: "Too many sign-in attempts. Try again in 15 minutes." });
    }
    return next();
  } catch (error) {
    return next(error);
  }
}

async function readStore() {
  const [settingsResult, categoriesResult, productsResult] = await Promise.all([
    pool.query("SELECT business_name, tagline, phone_display, whatsapp, about, banner, avatar FROM catalog_settings WHERE id = 1"),
    pool.query("SELECT id, name, subtitle, sort_order AS \"order\" FROM categories ORDER BY sort_order, id"),
    pool.query("SELECT id, category_id AS \"categoryId\", name, subtitle, description, price, images FROM products ORDER BY created_at, id"),
  ]);
  const row = settingsResult.rows[0] || {};
  return {
    settings: {
      businessName: row.business_name || "",
      tagline: row.tagline || "",
      phoneDisplay: row.phone_display || "",
      whatsapp: row.whatsapp || "",
      about: row.about || "",
      banner: row.banner || "",
      avatar: row.avatar || "",
    },
    categories: categoriesResult.rows,
    products: productsResult.rows,
  };
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

app.get("/api/health", asyncRoute(async (_req, res) => {
  await pool.query("SELECT 1 FROM catalog_settings LIMIT 1");
  res.json({ ok: true });
}));

app.get("/api/catalog", asyncRoute(async (_req, res) => {
  res.json(await readStore());
}));

app.post("/api/login", loginRateLimit, asyncRoute(async (req, res) => {
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  const supplied = Buffer.from(password);
  const expected = Buffer.from(ADMIN_PASSWORD);
  const matches = supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
  if (!matches) return res.status(401).json({ error: "Wrong password" });
  await pool.query("DELETE FROM auth_login_attempts WHERE key = $1", [clientKey(req)]);
  req.session.regenerate((error) => {
    if (error) return res.status(500).json({ error: "Unable to start an admin session." });
    req.session.admin = true;
    req.session.save((saveError) => {
      if (saveError) return res.status(500).json({ error: "Unable to save the admin session." });
      return res.json({ ok: true });
    });
  });
}));

app.post("/api/logout", requireAdmin, (req, res, next) => {
  req.session.destroy((error) => {
    if (error) return next(error);
    res.clearCookie("catalog.sid", { httpOnly: true, sameSite: "lax", secure: IS_PRODUCTION });
    return res.json({ ok: true });
  });
});

app.get("/api/me", (req, res) => {
  res.json({ admin: Boolean(req.session && req.session.admin) });
});

app.put("/api/settings", requireAdmin, asyncRoute(async (req, res) => {
  const body = req.body || {};
  const settings = {
    businessName: cleanText(body.businessName, "Business name", 120, { required: true }),
    tagline: cleanText(body.tagline, "Tagline", 500),
    phoneDisplay: cleanText(body.phoneDisplay, "Phone number", 40),
    whatsapp: cleanText(body.whatsapp, "WhatsApp number", 20).replace(/\D/g, ""),
    about: cleanText(body.about, "About", 2000),
    banner: body.banner ? validateImageUrl(body.banner) : "",
    avatar: body.avatar ? validateImageUrl(body.avatar) : "",
  };
  await pool.query(
    `INSERT INTO catalog_settings (id, business_name, tagline, phone_display, whatsapp, about, banner, avatar)
     VALUES (1, $1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (id) DO UPDATE SET business_name = EXCLUDED.business_name, tagline = EXCLUDED.tagline,
       phone_display = EXCLUDED.phone_display, whatsapp = EXCLUDED.whatsapp, about = EXCLUDED.about,
       banner = EXCLUDED.banner, avatar = EXCLUDED.avatar`,
    [settings.businessName, settings.tagline, settings.phoneDisplay, settings.whatsapp, settings.about, settings.banner, settings.avatar]
  );
  res.json(settings);
}));

app.post("/api/categories", requireAdmin, asyncRoute(async (req, res) => {
  const name = cleanText(req.body?.name, "Category name", 120, { required: true });
  const subtitle = cleanText(req.body?.subtitle, "Category subtitle", 250);
  const id = `cat-${crypto.randomUUID()}`;
  const result = await pool.query(
    `INSERT INTO categories (id, name, subtitle, sort_order)
     VALUES ($1, $2, $3, (SELECT COALESCE(MAX(sort_order) + 1, 0) FROM categories))
     RETURNING id, name, subtitle, sort_order AS "order"`,
    [id, name, subtitle]
  );
  res.json(result.rows[0]);
}));

app.put("/api/categories/:id", requireAdmin, asyncRoute(async (req, res) => {
  const body = req.body || {};
  const result = await pool.query(
    `UPDATE categories SET name = COALESCE($2, name), subtitle = COALESCE($3, subtitle),
       sort_order = COALESCE($4, sort_order)
     WHERE id = $1
     RETURNING id, name, subtitle, sort_order AS "order"`,
    [
      req.params.id,
      body.name == null ? null : cleanText(body.name, "Category name", 120, { required: true }),
      body.subtitle == null ? null : cleanText(body.subtitle, "Category subtitle", 250),
      body.order == null ? null : validateOrder(body.order),
    ]
  );
  if (!result.rowCount) return res.status(404).json({ error: "Category not found." });
  res.json(result.rows[0]);
}));

app.delete("/api/categories/:id", requireAdmin, asyncRoute(async (req, res) => {
  const result = await pool.query("DELETE FROM categories WHERE id = $1", [req.params.id]);
  if (!result.rowCount) return res.status(404).json({ error: "Category not found." });
  res.json({ ok: true });
}));

app.post("/api/products", requireAdmin, asyncRoute(async (req, res) => {
  const store = await readStore();
  const body = req.body || {};
  const product = {
    id: `p-${crypto.randomUUID()}`,
    categoryId: validateCategoryId(store.categories, body.categoryId),
    name: cleanText(body.name, "Product name", 160, { required: true }),
    subtitle: cleanText(body.subtitle, "Product subtitle", 250),
    description: cleanText(body.description, "Product description", 4000),
    price: cleanText(body.price, "Product price", 120),
    images: validateImages(body.images),
  };
  const result = await pool.query(
    `INSERT INTO products (id, category_id, name, subtitle, description, price, images)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, category_id AS "categoryId", name, subtitle, description, price, images`,
    [product.id, product.categoryId, product.name, product.subtitle, product.description, product.price, product.images]
  );
  res.json(result.rows[0]);
}));

app.put("/api/products/:id", requireAdmin, asyncRoute(async (req, res) => {
  const body = req.body || {};
  const current = await pool.query("SELECT id, category_id FROM products WHERE id = $1", [req.params.id]);
  if (!current.rowCount) return res.status(404).json({ error: "Product not found." });
  const store = await readStore();
  const categoryId = body.categoryId == null ? current.rows[0].category_id : validateCategoryId(store.categories, body.categoryId);
  const result = await pool.query(
    `UPDATE products SET category_id = $2, name = COALESCE($3, name), subtitle = COALESCE($4, subtitle),
       description = COALESCE($5, description), price = COALESCE($6, price), images = COALESCE($7, images)
     WHERE id = $1
     RETURNING id, category_id AS "categoryId", name, subtitle, description, price, images`,
    [
      req.params.id,
      categoryId,
      body.name == null ? null : cleanText(body.name, "Product name", 160, { required: true }),
      body.subtitle == null ? null : cleanText(body.subtitle, "Product subtitle", 250),
      body.description == null ? null : cleanText(body.description, "Product description", 4000),
      body.price == null ? null : cleanText(body.price, "Product price", 120),
      body.images == null ? null : validateImages(body.images),
    ]
  );
  if (!result.rowCount) return res.status(404).json({ error: "Product not found." });
  res.json(result.rows[0]);
}));

app.delete("/api/products/:id", requireAdmin, asyncRoute(async (req, res) => {
  const result = await pool.query("DELETE FROM products WHERE id = $1", [req.params.id]);
  if (!result.rowCount) return res.status(404).json({ error: "Product not found." });
  res.json({ ok: true });
}));

app.post("/api/upload", requireAdmin, asyncRoute(async (req, res) => {
  const files = req.body?.files;
  if (!Array.isArray(files) || files.length < 1 || files.length > 12) {
    return res.status(400).json({ error: "Select between 1 and 12 images to upload." });
  }
  const uploads = await Promise.all(files.map(async (file) => {
    const type = typeof file?.type === "string" ? file.type.toLowerCase() : "";
    const ext = IMAGE_TYPES.get(type);
    if (!ext) {
      const error = new Error("Unsupported image type.");
      error.status = 400;
      throw error;
    }
    const key = `${crypto.randomUUID()}${ext}`;
    return { ...(await createSignedUpload(key)), type };
  }));
  res.json({ uploads });
}));

app.get("/admin", (_req, res) => {
  res.sendFile(path.join(ROOT, "public", "admin.html"));
});

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api") || path.extname(req.path)) return next();
  res.sendFile(path.join(ROOT, "public", "index.html"));
});

app.use((err, req, res, _next) => {
  const status = err.status || 500;
  console.error(JSON.stringify({
    level: "error",
    event: "http.request_failed",
    requestId: req.get("x-vercel-id") || req.get("x-request-id") || null,
    method: req.method,
    path: req.path,
    status,
    message: err.message || "Request failed",
  }));
  res.status(status).json({ error: status < 500 || err.status === 400 ? err.message : "Internal server error." });
});

module.exports = app;

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(JSON.stringify({ level: "info", event: "server.started", port: PORT }));
  });
}
