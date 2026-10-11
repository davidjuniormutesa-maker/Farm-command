/**
 * Farm Command — export serializers (no external libraries, fully offline).
 * Turns ExportSheet[] into Excel (.xls SpreadsheetML), Word (.doc HTML) and a
 * printable PDF view.
 */

import type { ExportSheet, CellValue } from "./export";

const BRAND = "#0f3b2e"; // Farm Command deep green

function xmlEscape(v: CellValue): string {
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Excel caps worksheet names at 31 chars and forbids a few characters. */
function safeSheetName(name: string, used: Set<string>): string {
  let base = name.replace(/[\[\]:*?/\\]/g, " ").trim().slice(0, 31) || "Sheet";
  let candidate = base;
  let n = 2;
  while (used.has(candidate.toLowerCase())) {
    const suffix = ` ${n}`;
    candidate = base.slice(0, 31 - suffix.length) + suffix;
    n += 1;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

/** Trigger a browser download for a Blob. */
export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ---------- Excel: SpreadsheetML 2003 (.xls) ----------

export function downloadExcel(sheets: ExportSheet[], filename: string): void {
  const used = new Set<string>();
  const worksheets = sheets
    .map((sheet) => {
      const name = safeSheetName(sheet.name, used);
      const header = sheet.columns
        .map(
          (c) =>
            `<Cell ss:StyleID=\"hdr\"><Data ss:Type=\"String\">${xmlEscape(c.label)}</Data></Cell>`
        )
        .join("");
      const body = sheet.rows
        .map((row) => {
          const cells = sheet.columns
            .map((c) => {
              const v = row[c.key];
              if (typeof v === "number" && Number.isFinite(v)) {
                return `<Cell><Data ss:Type=\"Number\">${v}</Data></Cell>`;
              }
              return `<Cell><Data ss:Type=\"String\">${xmlEscape(v ?? "")}</Data></Cell>`;
            })
            .join("");
          return `<Row>${cells}</Row>`;
        })
        .join("");
      return `<Worksheet ss:Name=\"${xmlEscape(name)}\"><Table>${
        `<Row>${header}</Row>` + body
      }</Table></Worksheet>`;
    })
    .join("");

  const xml =
    `<?xml version=\"1.0\"?>\n` +
    `<?mso-application progid=\"Excel.Sheet\"?>\n` +
    `<Workbook xmlns=\"urn:schemas-microsoft-com:office:spreadsheet\" ` +
    `xmlns:ss=\"urn:schemas-microsoft-com:office:spreadsheet\">` +
    `<Styles><Style ss:ID=\"hdr\"><Font ss:Bold=\"1\" ss:Color=\"#FFFFFF\"/>` +
    `<Interior ss:Color=\"${BRAND}\" ss:Pattern=\"Solid\"/>` +
    `<Alignment ss:Vertical=\"Center\"/></Style></Styles>` +
    worksheets +
    `</Workbook>`;

  triggerDownload(
    new Blob([xml], { type: "application/vnd.ms-excel" }),
    filename.endsWith(".xls") ? filename : `${filename}.xls`
  );
}

// ---------- shared HTML body (Word + PDF) ----------

function buildHtml(sheets: ExportSheet[], title: string, subtitle: string): string {
  const sections = sheets
    .map((sheet) => {
      if (sheet.rows.length === 0) {
        return `<h2>${xmlEscape(sheet.name)}</h2><p class=\"empty\">No records yet.</p>`;
      }
      const head = sheet.columns.map((c) => `<th>${xmlEscape(c.label)}</th>`).join("");
      const rows = sheet.rows
        .map((row) => {
          const cells = sheet.columns
            .map((c) => `<td>${xmlEscape(row[c.key] ?? "")}</td>`)
            .join("");
          return `<tr>${cells}</tr>`;
        })
        .join("");
      return `<h2>${xmlEscape(sheet.name)}</h2><table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`;
    })
    .join("");

  return (
    `<h1>${xmlEscape(title)}</h1><p class=\"sub\">${xmlEscape(subtitle)}</p>` + sections
  );
}

const DOC_CSS =
  `body{font-family:Arial,Helvetica,sans-serif;color:#1c1917;margin:24px;}` +
  `h1{color:${BRAND};font-size:22px;margin:0 0 2px;}` +
  `.sub{color:#57534e;margin:0 0 18px;font-size:12px;}` +
  `h2{color:${BRAND};font-size:15px;margin:22px 0 6px;border-bottom:2px solid ${BRAND};padding-bottom:3px;}` +
  `.empty{color:#78716c;font-style:italic;font-size:12px;}` +
  `table{border-collapse:collapse;width:100%;margin-bottom:10px;font-size:12px;}` +
  `th{background:${BRAND};color:#fff;text-align:left;padding:6px 8px;border:1px solid #d6d3d1;}` +
  `td{padding:5px 8px;border:1px solid #d6d3d1;vertical-align:top;}` +
  `tbody tr:nth-child(even){background:#f5f5f4;}`;

// ---------- Word: HTML-flavoured .doc ----------

export function downloadWord(
  sheets: ExportSheet[],
  filename: string,
  title: string,
  subtitle: string
): void {
  const html =
    `<html xmlns:o=\"urn:schemas-microsoft-com:office:office\" ` +
    `xmlns:w=\"urn:schemas-microsoft-com:office:word\" xmlns=\"http://www.w3.org/TR/REC-html40\">` +
    `<head><meta charset=\"utf-8\"><title>${xmlEscape(title)}</title><style>${DOC_CSS}</style></head>` +
    `<body>${buildHtml(sheets, title, subtitle)}</body></html>`;

  triggerDownload(
    new Blob(["\ufeff", html], { type: "application/msword" }),
    filename.endsWith(".doc") ? filename : `${filename}.doc`
  );
}

// ---------- PDF: print view (user picks "Save as PDF") ----------

export function exportPdf(sheets: ExportSheet[], title: string, subtitle: string): boolean {
  const html =
    `<!doctype html><html><head><meta charset=\"utf-8\"><title>${xmlEscape(title)}</title>` +
    `<style>${DOC_CSS}@media print{body{margin:12mm;}h2{page-break-after:avoid;}` +
    `tr{page-break-inside:avoid;}}</style></head>` +
    `<body>${buildHtml(sheets, title, subtitle)}</body></html>`;

  const w = window.open("", "_blank");
  if (!w) return false; // popup blocked
  w.document.open();
  w.document.write(html);
  w.document.close();
  // Give the new window a moment to lay out, then open the print dialog.
  // The user chooses "Save as PDF" (works on Android Chrome and desktop).
  setTimeout(() => {
    try {
      w.focus();
      w.print();
    } catch {
      /* if printing fails the page is still shown for manual print */
    }
  }, 400);
  return true;
}
