import { requirePageUser } from "@/lib/auth/session";
import { loadCategories } from "@/lib/settingsData";
import { CategoriesClient } from "./CategoriesClient";

export default async function CategoriesPage() {
  await requirePageUser("settings:view");
  return <CategoriesClient categories={await loadCategories()} />;
}
