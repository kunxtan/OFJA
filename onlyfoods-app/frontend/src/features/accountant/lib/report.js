// รายงานส่งออก XLSX : ชนิดรายงาน คอลัมน์ และการสร้างไฟล์
import { xlsxCol, xmlEsc, zipStore } from '../../../lib/xlsxWriter';

/* ---------------- XLSX export: สร้างไฟล์ .xlsx จริง (ZIP + OOXML) ไม่ต้องติดตั้งไลบรารีเพิ่ม ---------------- */
// สไตล์ (cellXfs): 0 ปกติ, 1 หัวเรื่อง, 2 หัวตาราง, 3 ข้อความ, 4 เงิน, 5 %, 6 ข้อความแถวรวม, 7 เงินแถวรวม, 8 หมายเหตุ, 9 จำนวนเต็ม, 10 จำนวนเต็มแถวรวม, 11 % แถวรวม
export const XLSX_STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="0.0&quot;%&quot;"/></numFmts>
<fonts count="5">
<font><sz val="11"/><name val="Calibri"/></font>
<font><b/><sz val="14"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><name val="Calibri"/></font>
<font><i/><sz val="10"/><color rgb="FF697586"/><name val="Calibri"/></font>
</fonts>
<fills count="4">
<fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFF724C"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFFF0EC"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="2">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left style="thin"><color rgb="FFD9DEE3"/></left><right style="thin"><color rgb="FFD9DEE3"/></right><top style="thin"><color rgb="FFD9DEE3"/></top><bottom style="thin"><color rgb="FFD9DEE3"/></bottom><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="12">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>
<xf numFmtId="4" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
<xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="4" fontId="3" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="3" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
<xf numFmtId="3" fontId="3" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="164" fontId="3" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

// columns: [{label, kind: 'text'|'int'|'money'|'percent', width}] / rows, totalRow: อาร์เรย์ของค่า
export function buildXlsxBlob({ sheetName, title, infoLines = [], columns, rows, totalRow }) {
  const cell = (c, r, v, style, kind) => {
    const ref = `${xlsxCol(c)}${r}`;
    if (kind !== 'text' && typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}" s="${style}"><v>${v}</v></c>`;
    if (v === null || v === undefined || v === '') return `<c r="${ref}" s="${style}"/>`;
    return `<c r="${ref}" t="inlineStr" s="${style === 4 || style === 5 || style === 9 ? 3 : style === 7 || style === 10 || style === 11 ? 6 : style}"><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`;
  };
  const dataStyle = { text: 3, int: 9, money: 4, percent: 5 };
  const totalStyle = { text: 6, int: 10, money: 7, percent: 11 };
  const out = [];
  let r = 1;
  out.push(`<row r="${r}"><c r="A${r}" t="inlineStr" s="1"><is><t>${xmlEsc(title)}</t></is></c></row>`); r++;
  infoLines.forEach(line => { out.push(`<row r="${r}"><c r="A${r}" t="inlineStr" s="8"><is><t xml:space="preserve">${xmlEsc(line)}</t></is></c></row>`); r++; });
  r++;
  out.push(`<row r="${r}" ht="22" customHeight="1">${columns.map((c, i) => cell(i, r, c.label, 2, 'text')).join('')}</row>`); r++;
  rows.forEach(row => { out.push(`<row r="${r}">${columns.map((c, i) => cell(i, r, row[i], dataStyle[c.kind] || 3, c.kind)).join('')}</row>`); r++; });
  if (totalRow) { out.push(`<row r="${r}">${columns.map((c, i) => cell(i, r, totalRow[i], totalStyle[c.kind] || 6, c.kind)).join('')}</row>`); r++; }
  const cols = columns.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width || 18}" customWidth="1"/>`).join('');
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols>${cols}</cols><sheetData>${out.join('')}</sheetData></worksheet>`;
  const safeName = String(sheetName || 'Report').replace(/[\[\]:*?\/\\]/g, ' ').slice(0, 31) || 'Report';
  return zipStore([
    { name: '[Content_Types].xml', text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>` },
    { name: '_rels/.rels', text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: 'xl/workbook.xml', text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xmlEsc(safeName)}" sheetId="1" r:id="rId1"/></sheets></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: 'xl/styles.xml', text: XLSX_STYLES },
    { name: 'xl/worksheets/sheet1.xml', text: sheet },
  ]);
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ---------------- Report Config ---------------- */
export const REPORT_TYPES = [
  { id: 'store', title: 'Store Summary', sub: 'สรุปยอดรายร้านครบทุกมิติ' },
  { id: 'sales', title: 'Sales Report', sub: 'ยอดขายรวมทุกร้าน' },
  { id: 'net', title: 'Net Sales Report', sub: 'ยอดขายสุทธิ' },
  { id: 'cancel', title: 'Cancellation Report', sub: 'รายงานการยกเลิกออเดอร์' },
];

export const REPORT_COLUMNS = {
  store: [
    { key: 'storeName', label: 'STORE' },
    { key: 'totalOrders', label: 'ORDERS' },
    { key: 'grossSales', label: 'GROSS SALES', money: true },
    { key: 'cancelledOrders', label: 'CANCEL' },
    { key: 'rate', label: 'RATE', percent: true },
    { key: 'netSales', label: 'NET SALES', money: true },
  ],
  sales: [
    { key: 'storeName', label: 'STORE' },
    { key: 'totalOrders', label: 'ORDERS' },
    { key: 'grossSales', label: 'GROSS SALES', money: true },
  ],
  net: [
    { key: 'storeName', label: 'STORE' },
    { key: 'netSales', label: 'NET SALES', money: true },
  ],
  cancel: [
    { key: 'storeName', label: 'STORE' },
    { key: 'totalOrders', label: 'ORDERS' },
    { key: 'cancelledOrders', label: 'CANCELLED' },
    { key: 'rate', label: 'RATE', percent: true },
  ],
};
