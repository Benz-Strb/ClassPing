import { describe, expect, it, vi } from "vitest";
import { readSheet, type SheetData } from "read-excel-file/browser";
import { readCatalogSpreadsheet } from "./catalog-spreadsheet";

vi.mock("read-excel-file/browser", () => ({ readSheet: vi.fn() }));

const readFirstSheet = vi.mocked(readSheet as (file: File, sheet: number) => Promise<SheetData>);

describe("curriculum XLSX import", () => {
  it("reads the first sheet and escapes Thai workbook values for the CSV importer", async () => {
    const workbook = new File(["test"], "หลักสูตร.XLSX");
    readFirstSheet.mockResolvedValueOnce([
      ["code", "name", "year", "content", "active"],
      ["001", "วิทยาการคอมพิวเตอร์", 2569, 'รายละเอียด, "ตัวอย่าง"\nบรรทัดสอง', true],
      [null, null, null, null, null],
      ["IT", "เทคโนโลยี", 2568, null, false],
    ]);
    await expect(readCatalogSpreadsheet(workbook)).resolves.toEqual({ csv:
      'code,name,year,content,active\n001,วิทยาการคอมพิวเตอร์,2569,"รายละเอียด, ""ตัวอย่าง""\nบรรทัดสอง",true\nIT,เทคโนโลยี,2568,,false',
    });
    expect(readSheet).toHaveBeenCalledWith(workbook, 1);
  });

  it("bounds uploads and rows, and reports an unreadable workbook", async () => {
    const workbook = new File(["test"], "curricula.xlsx");
    await expect(readCatalogSpreadsheet(new File([new Uint8Array(200_001)], "large.xlsx"))).rejects.toThrow("200 KB");
    readFirstSheet.mockRejectedValueOnce(new Error("invalid workbook"));
    await expect(readCatalogSpreadsheet(workbook)).rejects.toThrow("อ่านไฟล์ XLSX ไม่ได้");
    readFirstSheet.mockResolvedValueOnce(Array.from({ length: 502 }, () => ["row"]));
    await expect(readCatalogSpreadsheet(workbook)).rejects.toThrow("500");
  });
  it("recognizes a university study-plan report and prepares a reviewable draft", async () => {
    readFirstSheet.mockResolvedValueOnce([
      ["มหาวิทยาลัยธุรกิจบัณฑิตย์", null, null],
      [null, "รายงานแผนการศึกษาประจำภาคเรียน", "หน้าที่"],
      ["หลักสูตรวิศวกรรมศาสตรบัณฑิต สาขาวิชาวิศวกรรมคอมพิวเตอร์ มคอ.2 หลักสูตรปรับปรุง พ.ศ. 2565 (ปีภาคที่เปิด/ปรับปรุงหลักสูตร 2565/1)", null, null],
      ["ภาคเรียนที่ 1/2566 (18 หน่วยกิต)", null, null],
      ["รหัสรายวิชา", "ชื่อรายวิชา", "หน่วยกิต"],
      ["CE201", "หลักการเขียนโปรแกรมคอมพิวเตอร์", "3(3-0-6)"],
      ["พิมพ์โดย ผู้ทดสอบ", null, null],
    ]);
    await expect(readCatalogSpreadsheet(new File(["test"], "report.xlsx"))).resolves.toEqual({
      draft: {
        name: "หลักสูตรวิศวกรรมศาสตรบัณฑิต สาขาวิชาวิศวกรรมคอมพิวเตอร์",
        year: 2565,
        content: "ภาคเรียนที่ 1/2566 (18 หน่วยกิต)\nรหัสรายวิชา | ชื่อรายวิชา | หน่วยกิต\nCE201 | หลักการเขียนโปรแกรมคอมพิวเตอร์ | 3(3-0-6)",
      },
    });
  });
});
