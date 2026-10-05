import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db";
import { AuthError, requireCap } from "@/lib/auth/session";
import { loadEntriesForExport, loadReport, parseReportParams } from "@/lib/reportData";
import { comparisonTable, dailyTable, entriesTable, productsTable, toCsv, toXlsx } from "@/lib/reportExport";
import { loadScheduleConfig } from "@/lib/storeConfig";
import { isLang, makeT, pickMsg } from "@/lib/i18n";
import { getLang } from "@/lib/i18nServer";

/** GET /api/reports/export?from&to&type&daypart&area&format=xlsx|csv&table=allowance|daily|products|entries */
export async function GET(request: NextRequest) {
  const sp = Object.fromEntries(request.nextUrl.searchParams.entries());
  const lang = isLang(sp.lang) ? sp.lang : await getLang();
  const t = makeT(lang);
  try {
    await requireCap("reports:view");
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: pickMsg(e.message, lang) }, { status: e.status });
    throw e;
  }
  const params = await parseReportParams(db, sp);
  const { report } = await loadReport(db, params);
  const { timezone } = await loadScheduleConfig(db);
  const base = `waste-report_${params.from}_to_${params.to}`;

  if (sp.format === "csv") {
    const table = sp.table ?? "allowance";
    const tbl =
      table === "entries"
        ? entriesTable(await loadEntriesForExport(db, params), timezone, lang)
        : table === "products"
          ? productsTable(report, lang)
          : table === "daily"
            ? dailyTable(report, lang)
            : comparisonTable(report, lang);
    return new NextResponse(toCsv(tbl), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${base}_${table}.csv"`,
      },
    });
  }

  const title = t(`Waste report ${params.from} to ${params.to}`, `Reporte de waste del ${params.from} al ${params.to}`);
  const xlsx = await toXlsx(report, await loadEntriesForExport(db, params), timezone, title, lang);
  return new NextResponse(new Uint8Array(xlsx), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${base}.xlsx"`,
    },
  });
}
