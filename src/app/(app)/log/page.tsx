import { signEntryToken } from "@/lib/auth/entryToken";
import { requirePageUser } from "@/lib/auth/session";
import { maxBackdateDays, maxRemoveBackDays } from "@/lib/entries/rules";
import { loadLogData } from "@/lib/logData";
import { LogClient } from "./LogClient";

export default async function LogPage() {
  const user = await requirePageUser("entries:create");
  const [data, token] = await Promise.all([loadLogData(), signEntryToken(user.id)]);
  return (
    <LogClient
      data={data}
      token={token}
      me={{ id: user.id, role: user.role }}
      maxBackdate={maxBackdateDays(user.role)}
      maxRemoveBack={maxRemoveBackDays(user.role)}
    />
  );
}
