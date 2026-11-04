const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const { Pool } = require("pg");
const { uploadObject, uploadLocalFile, publicObjectUrl, localUploadKey } = require("../lib/storage");

const ROOT = path.join(__dirname, "..");
const MIME_TYPES = new Map([
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".webp", "image/webp"],
  [".gif", "image/gif"],
  [".avif", "image/avif"],
  [".heic", "image/heic"],
  [".heif", "image/heif"],
  [".bmp", "image/bmp"],
]);
const EXTENSIONS = new Map([...MIME_TYPES].map(([extension, mime]) => [mime, extension]));

async function migrateAsset(url) {
  if (typeof url === "string" && url.startsWith("data:")) {
    const match = /^data:(image\/(?:jpeg|png|webp|gif|avif|heic|heif|bmp));base64,([A-Za-z0-9+/]*={0,2})$/i.exec(url);
    if (!match) throw new Error("Catalog contains an unsupported or malformed data-URL image.");
    const encoded = match[2];
    const buffer = Buffer.from(encoded, "base64");
    if (buffer.toString("base64").replace(/=+$/, "") !== encoded.replace(/=+$/, "")) {
      throw new Error("Catalog contains a malformed base64 image.");
    }
    if (buffer.length > 12 * 1024 * 1024) throw new Error("Catalog contains a data-URL image larger than 12 MB.");
    const mime = match[1].toLowerCase();
    const extension = EXTENSIONS.get(mime);
    if (!extension) throw new Error(`Unsupported data-URL image type: ${mime}.`);
    const key = `${crypto.randomUUID()}${extension}`;
    await uploadObject(buffer, mime, key);
    return publicObjectUrl(key);
  }
  const filename = localUploadKey(url);
  if (!filename) return url;
  const source = path.join(ROOT, "uploads", filename);
  try {
    await fs.access(source);
  } catch {
    console.warn(`Skipping unavailable local image ${url}; its source file is not present in uploads/.`);
    return "";
  }
  const mime = MIME_TYPES.get(path.extname(filename).toLowerCase());
  if (!mime) throw new Error(`Unsupported image type for ${url}.`);
  return uploadLocalFile(source, mime, filename);
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("Set DATABASE_URL before importing the catalog.");
  const sourcePath = path.join(ROOT, "data", "store.json");
  const source = JSON.parse(await fs.readFile(sourcePath, "utf8"));
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2, connectionTimeoutMillis: 10000 });

  try {
    const settings = source.settings || {};
    const banner = settings.banner ? await migrateAsset(settings.banner) : "";
    const avatar = settings.avatar ? await migrateAsset(settings.avatar) : "";
    const products = await Promise.all((source.products || []).map(async (product) => ({
      ...product,
      images: await Promise.all((product.images || []).map(migrateAsset)),
    })));

    await pool.query("BEGIN");
    try {
      await pool.query(
        `INSERT INTO catalog_settings (id, business_name, tagline, phone_display, whatsapp, about, banner, avatar)
         VALUES (1, $1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO UPDATE SET business_name = EXCLUDED.business_name, tagline = EXCLUDED.tagline,
           phone_display = EXCLUDED.phone_display, whatsapp = EXCLUDED.whatsapp, about = EXCLUDED.about,
           banner = EXCLUDED.banner, avatar = EXCLUDED.avatar`,
        [
          settings.businessName || "",
          settings.tagline || "",
          settings.phoneDisplay || "",
          String(settings.whatsapp || "").replace(/\D/g, ""),
          settings.about || "",
          banner,
          avatar,
        ]
      );
      for (const [index, category] of (source.categories || []).entries()) {
        await pool.query(
          `INSERT INTO categories (id, name, subtitle, sort_order) VALUES ($1, $2, $3, $4)
           ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, subtitle = EXCLUDED.subtitle, sort_order = EXCLUDED.sort_order`,
          [category.id, category.name, category.subtitle || "", Number.isInteger(category.order) ? category.order : index]
        );
      }
      for (const product of products) {
        await pool.query(
          `INSERT INTO products (id, category_id, name, subtitle, description, price, images)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (id) DO UPDATE SET category_id = EXCLUDED.category_id, name = EXCLUDED.name,
             subtitle = EXCLUDED.subtitle, description = EXCLUDED.description, price = EXCLUDED.price, images = EXCLUDED.images`,
          [
            product.id,
            product.categoryId,
            product.name,
            product.subtitle || "",
            product.description || "",
            product.price || "",
            product.images.filter(Boolean),
          ]
        );
      }
      await pool.query("COMMIT");
    } catch (error) {
      await pool.query("ROLLBACK");
      throw error;
    }

    console.log(`Imported ${source.categories?.length || 0} categories and ${products.length} products from ${sourcePath}.`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`Catalog import failed: ${error.message}`);
  process.exitCode = 1;
});
