function invalid(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function cleanText(value, field, maxLength, { required = false } = {}) {
  if (value == null && !required) return "";
  if (typeof value !== "string") {
    if (required) throw invalid(`${field} is required.`);
    throw invalid(`${field} must be text.`);
  }
  const text = value.trim();
  if (text.length > maxLength) throw invalid(`${field} must be ${maxLength} characters or fewer.`);
  if (required && !text) throw invalid(`${field} is required.`);
  return text;
}

function validateImageUrl(value) {
  const url = cleanText(value, "Image URL", 2048, { required: true });
  if (url.startsWith("//")) throw invalid("Image URLs must use HTTPS, HTTP, or a root-relative path.");
  if (url.startsWith("/")) return url;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw invalid("Image URLs must use HTTPS, HTTP, or a root-relative path.");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw invalid("Image URLs must use HTTPS or HTTP.");
  }
  return url;
}

function validateImages(images) {
  if (images == null) return [];
  if (!Array.isArray(images) || images.length > 12) {
    throw invalid("A product can have at most 12 images.");
  }
  return images.map(validateImageUrl);
}

function validateCategoryId(categories, id) {
  const categoryId = cleanText(id, "Category", 128, { required: true });
  if (!categories.some((category) => category.id === categoryId)) {
    throw invalid("Choose a valid category.");
  }
  return categoryId;
}

function validateOrder(value) {
  if (!Number.isInteger(value) || value < 0) {
    throw invalid("Category order must be a non-negative integer.");
  }
  return value;
}

module.exports = { cleanText, validateImageUrl, validateImages, validateCategoryId, validateOrder };
