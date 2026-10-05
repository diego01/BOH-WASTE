import { asc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { db, schema } from "@/db";
import { getCurrentUser } from "@/lib/auth/session";
import { LangToggle } from "@/components/LangToggle";
import { LoginForm } from "./LoginForm";

export default async function LoginPage() {
  await connection();
  const current = await getCurrentUser();
  if (current) redirect(current.mustChangePin ? "/change-pin" : "/log");
  const users = await db
    .select({ id: schema.users.id, name: schema.users.name, role: schema.users.role })
    .from(schema.users)
    .where(eq(schema.users.active, true))
    .orderBy(asc(schema.users.name));

  return (
    <main className="mx-auto min-h-dvh max-w-lg px-4 pb-10 pt-[max(2.5rem,env(safe-area-inset-top))]">
      <div className="flex justify-end">
        <LangToggle />
      </div>
      <h1 className="mt-2 text-center text-2xl font-bold">BOH Waste</h1>
      <LoginForm users={users} />
    </main>
  );
}
