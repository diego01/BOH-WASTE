import { db } from "@/db";
import { requirePageUser } from "@/lib/auth/session";
import { loadReport, parseReportParams } from "@/lib/reportData";
import { ReportsClient } from "./ReportsClient";

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePageUser("reports:view");
  const params = await parseReportParams(db, await searchParams);
  const { report, areas } = await loadReport(db, params);
  return <ReportsClient report={report} params={params} areas={areas} />;
}
