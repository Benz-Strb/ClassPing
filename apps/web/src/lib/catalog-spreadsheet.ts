import type { CellValue, SheetData } from "read-excel-file/browser";

function csvCell(value: CellValue | null) {
  if (value instanceof Date) throw new Error("ไฟล์ XLSX ต้องใช้ข้อความหรือตัวเลขแทนช่องวันที่");
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function studyPlanDraft(rows: SheetData) {
  if (!rows.slice(0, 12).some((row) => row.some((cell) => typeof cell === "string" && cell.includes("รายงานแผนการศึกษาประจำภาคเรียน")))) return null;
  const title = rows.slice(0, 12).flat()
    .find((cell): cell is string => typeof cell === "string" && /^หลักสูตร.*พ\.ศ\.\s*\d{4}/u.test(cell));
  const year = title?.match(/พ\.ศ\.\s*(\d{4})/u)?.[1];
  const name = title?.split(/\s+(?:มคอ\.\s*\d|หลักสูตรปรับปรุง|พ\.ศ\.)/u)[0].trim();
  const content = rows.flatMap(([first, second, third]) => {
    if (typeof first !== "string") return [];
    if (/^ภาคเรียนที่/u.test(first)) return [first];
    if (first === "รหัสรายวิชา" || (/^[A-Z]{2,}\d{3,}[A-Z0-9]*$/i.test(first) && typeof second === "string")) {
      return [[first, second, third].filter((cell) => cell != null).join(" | ")];
    }
    return [];
  }).join("\n");
  if (!content || content.length > 50_000) throw new Error("ตรวจข้อมูลรายวิชาในรายงานแผนการศึกษาแล้วลองใหม่");
  return { name, year: year ? Number(year) : undefined, content };
}

export async function readCatalogSpreadsheet(file: File) {
  if (file.size > 200_000) throw new Error("ไฟล์ XLSX ต้องไม่เกิน 200 KB");
  const { readSheet } = await import("read-excel-file/browser");
  const sheet = await readSheet(file, 1).catch(() => {
    throw new Error("อ่านไฟล์ XLSX ไม่ได้ กรุณาตรวจสอบไฟล์แล้วลองใหม่");
  });
  const rows = sheet.filter((row) => row.some((value) => String(value ?? "").trim() !== ""));
  if (rows.length < 2) throw new Error("ชีตแรกต้องมีหัวตารางและข้อมูลอย่างน้อย 1 รายการ");
  if (rows.length > 501) throw new Error("นำเข้าได้ไม่เกิน 500 รายการต่อครั้ง");
  const draft = studyPlanDraft(rows);
  if (draft) return { draft };
  const header = rows[0];
  if (!["code", "name", "year"].every((column) => header.includes(column))) {
    throw new Error("ชีตแรกต้องมีหัวตาราง code, name, year หรือเป็นรายงานแผนการศึกษาประจำภาคเรียน");
  }
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
  if (new TextEncoder().encode(csv).length > 200_000) throw new Error("ข้อมูลในไฟล์ XLSX ต้องไม่เกิน 200 KB");
  return { csv };
}
