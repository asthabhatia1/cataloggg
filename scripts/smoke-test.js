const baseUrl = process.env.BASE_URL;

if (!baseUrl) {
  console.error("Set BASE_URL to the deployed site URL, for example https://catalog.example.com.");
  process.exit(1);
}

async function main() {
  const root = baseUrl.replace(/\/+$/, "");
  const health = await fetch(`${root}/api/health`);
  if (!health.ok) throw new Error(`Health endpoint returned HTTP ${health.status}.`);
  const catalogResponse = await fetch(`${root}/api/catalog`);
  if (!catalogResponse.ok) throw new Error(`Catalog endpoint returned HTTP ${catalogResponse.status}.`);
  const catalog = await catalogResponse.json();
  if (!catalog.settings || !Array.isArray(catalog.categories) || !Array.isArray(catalog.products)) {
    throw new Error("Catalog endpoint returned an unexpected response shape.");
  }
  console.log(`Smoke test passed: ${catalog.categories.length} categories, ${catalog.products.length} products.`);
}

main().catch((error) => {
  console.error(`Smoke test failed: ${error.message}`);
  process.exitCode = 1;
});
