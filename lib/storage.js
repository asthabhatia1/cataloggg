const path = require("path");
const crypto = require("crypto");

function storageConfig() {
  const configuredUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || "catalog";
  if (!configuredUrl || !serviceKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured for image storage.");
  }
  let url;
  try {
    url = new URL(configuredUrl);
  } catch {
    throw new Error("SUPABASE_URL must be a valid project URL.");
  }
  const localHttp = process.env.NODE_ENV !== "production"
    && !process.env.VERCEL
    && url.protocol === "http:"
    && ["localhost", "127.0.0.1"].includes(url.hostname);
  if ((url.protocol !== "https:" && !localHttp) || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error("SUPABASE_URL must be an HTTPS project origin.");
  }
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(bucket)) {
    throw new Error("SUPABASE_STORAGE_BUCKET contains invalid characters.");
  }
  return { baseUrl: url.origin, serviceKey, bucket };
}

async function uploadObject(buffer, contentType, key) {
  const { baseUrl, serviceKey, bucket } = storageConfig();
  const objectPath = key.split("/").map(encodeURIComponent).join("/");
  const response = await fetch(`${baseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${objectPath}`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`,
      "content-type": contentType,
      "x-upsert": "true",
    },
    body: buffer,
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Image storage upload failed (${response.status}): ${detail.slice(0, 300)}`);
  }
}

async function createSignedUpload(key) {
  const { baseUrl, serviceKey, bucket } = storageConfig();
  const objectPath = key.split("/").map(encodeURIComponent).join("/");
  const response = await fetch(
    `${baseUrl}/storage/v1/object/upload/sign/${encodeURIComponent(bucket)}/${objectPath}`,
    {
      method: "POST",
      headers: {
        apikey: serviceKey,
        authorization: `Bearer ${serviceKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ upsert: true }),
    }
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok || typeof data.url !== "string") {
    throw new Error(`Could not create a signed image upload URL (${response.status}).`);
  }
  const uploadUrl = data.url.startsWith("http")
    ? data.url
    : `${baseUrl}/storage/v1${data.url.startsWith("/") ? data.url : `/${data.url}`}`;
  const signedUrl = new URL(uploadUrl);
  if (
    signedUrl.origin !== baseUrl
    || !signedUrl.pathname.startsWith("/storage/v1/object/upload/sign/")
    || !signedUrl.searchParams.get("token")
  ) {
    throw new Error("Supabase returned an invalid signed upload URL.");
  }
  return { uploadUrl, url: publicObjectUrl(key) };
}

async function uploadLocalFile(filePath, contentType, key = crypto.randomUUID() + path.extname(filePath).toLowerCase()) {
  const fs = require("fs/promises");
  await uploadObject(await fs.readFile(filePath), contentType, key);
  return publicObjectUrl(key);
}

function publicObjectUrl(key) {
  const { baseUrl, bucket } = storageConfig();
  const objectPath = key.split("/").map(encodeURIComponent).join("/");
  return `${baseUrl}/storage/v1/object/public/${encodeURIComponent(bucket)}/${objectPath}`;
}

function localUploadKey(url) {
  if (typeof url !== "string" || !url.startsWith("/uploads/")) return null;
  const filename = path.basename(url.slice("/uploads/".length));
  if (!filename || filename !== url.slice("/uploads/".length)) {
    throw new Error(`Invalid local upload path: ${url}`);
  }
  return filename;
}

module.exports = { storageConfig, uploadObject, createSignedUpload, uploadLocalFile, publicObjectUrl, localUploadKey };
