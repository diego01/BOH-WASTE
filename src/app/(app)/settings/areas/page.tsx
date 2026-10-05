import { requirePageUser } from "@/lib/auth/session";
import { loadAreas } from "@/lib/settingsData";
import { AreasClient } from "./AreasClient";

export default async function AreasPage() {
  await requirePageUser("settings:view");
  return <AreasClient areas={await loadAreas()} />;
}
