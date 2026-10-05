import { asc, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePageUser } from "@/lib/auth/session";
import { UsersClient } from "./UsersClient";

export default async function UsersPage() {
  const me = await requirePageUser("users:manage");
  const users = await db
    .select({
      id: schema.users.id,
      name: schema.users.name,
      role: schema.users.role,
      active: schema.users.active,
      mustChangePin: schema.users.mustChangePin,
      locked: sql<boolean>`coalesce(${schema.users.lockedUntil} > now(), false)`,
    })
    .from(schema.users)
    .orderBy(asc(schema.users.name));
  return <UsersClient meId={me.id} users={users} />;
}
