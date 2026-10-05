import { requirePageUser } from "@/lib/auth/session";
import { ImportClient } from "./ImportClient";

export default async function ImportPage() {
  await requirePageUser("settings:edit");
  return <ImportClient />;
}
