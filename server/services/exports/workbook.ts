import "server-only";
import ExcelJS from "exceljs";
import { CURRENCY_LABEL } from "@/lib/currency";
import type { ExportData, ExportSheet } from "./data";

/**
 * Renders collected export data as an .xlsx (docs/data-export.md): a summary
 * sheet first, then one right-to-left sheet per dataset with a frozen,
 * auto-filtered header row.
 */

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF0F766E" },
};
const MONEY_FORMAT = "#,##0.00";

/** Summary lines shared with the WhatsApp caption. */
export function summaryLines(data: ExportData): [string, number | string][] {
  const c = data.counts;
  return [
    ["مرضى جدد", c.newPatients],
    ["حجوزات جديدة", c.newAppointments],
    ["مواعيد أُلغيت", c.cancellations],
    ["مواعيد أُكدت", c.confirmed],
    ["مرضى وصلوا (تسجيل حضور)", c.checkIns],
    ["زيارات اكتملت", c.completed],
    ["عدم حضور", c.noShows],
    ["مواعيد مجدولة في الفترة", c.visits],
    ["باقات بيعت", c.packagesSold],
    ["تقييمات جديدة", c.feedback],
    [`إيراد الزيارات المكتملة (${CURRENCY_LABEL})`, round2(data.revenue.completedTotal)],
    [`مدفوعات الباقات (${CURRENCY_LABEL})`, round2(data.revenue.packagesPaid)],
  ];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function periodLabel(data: Pick<ExportData, "filters">): string {
  const { from, to } = data.filters;
  return from === to ? from : `من ${from} إلى ${to}`;
}

export async function renderWorkbook(data: ExportData): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = data.clinicName;
  wb.created = data.generatedAt;

  // ── Summary ──
  const s = wb.addWorksheet("الملخص", { views: [{ rightToLeft: true }] });
  s.columns = [{ width: 34 }, { width: 22 }];
  const title = s.addRow([`تقرير بيانات المرضى — ${data.clinicName}`]);
  title.font = { bold: true, size: 14 };
  s.addRow(["الفترة", periodLabel(data)]);
  s.addRow([
    "وقت الإنشاء",
    // sv-SE formats as "2026-11-24 21:59:26", like the dates in the sheets.
    data.generatedAt.toLocaleString("sv-SE", { timeZone: data.timeZone }).slice(0, 16),
  ]);
  if (data.filterLabels.length) s.addRow(["الفلاتر", data.filterLabels.join("، ")]);
  if (data.branchLimited) s.addRow(["النطاق", "فروعك فقط"]);
  if (!data.medical) s.addRow(["البيانات الطبية", "غير مضمّنة (تحتاج صلاحية السجلات الطبية)"]);
  s.addRow([]);
  const head = s.addRow(["البند", "العدد"]);
  styleHeader(head);
  for (const [label, value] of summaryLines(data)) {
    const r = s.addRow([label, value]);
    if (typeof value === "number" && label.includes(CURRENCY_LABEL)) {
      r.getCell(2).numFmt = MONEY_FORMAT;
    }
  }

  for (const sheet of data.sheets) addSheet(wb, sheet);

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out as ArrayBuffer);
}

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });
}

function addSheet(wb: ExcelJS.Workbook, sheet: ExportSheet) {
  // Excel sheet names: ≤31 chars, no []:*?/\
  const ws = wb.addWorksheet(sheet.name.replace(/[[\]:*?/\\]/g, " ").slice(0, 31), {
    views: [{ rightToLeft: true }],
  });
  let headerRowNo = 1;
  if (sheet.note) {
    const n = ws.addRow([sheet.note]);
    n.font = { italic: true, color: { argb: "FF6B7280" } };
    headerRowNo = 2;
  }
  ws.columns = sheet.columns.map((c) => ({ width: c.width ?? 16 }));
  const header = ws.addRow(sheet.columns.map((c) => c.header));
  styleHeader(header);
  ws.views = [{ rightToLeft: true, state: "frozen", ySplit: headerRowNo }];

  if (sheet.rows.length === 0) {
    ws.addRow(["لا توجد بيانات في هذه الفترة"]).font = { color: { argb: "FF6B7280" } };
    return;
  }
  for (const r of sheet.rows) ws.addRow(r);
  sheet.columns.forEach((c, i) => {
    if (c.kind === "money") ws.getColumn(i + 1).numFmt = MONEY_FORMAT;
  });
  ws.autoFilter = {
    from: { row: headerRowNo, column: 1 },
    to: { row: headerRowNo, column: sheet.columns.length },
  };
}
