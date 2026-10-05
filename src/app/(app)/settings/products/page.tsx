import { requirePageUser } from "@/lib/auth/session";
import { loadAreas, loadCategories, loadProducts } from "@/lib/settingsData";
import { ProductsClient } from "./ProductsClient";

export default async function ProductsPage() {
  await requirePageUser("settings:view");
  const [areas, categories, products] = await Promise.all([loadAreas(), loadCategories(), loadProducts()]);
  return <ProductsClient areas={areas} categories={categories} products={products} />;
}
