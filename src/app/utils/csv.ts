/**
 * Minimal RFC 4180 CSV building + download. No dependencies: the app's other
 * exports are PDFs (jsPDF); the scholarship export needs an Excel-openable
 * spreadsheet, which a CSV is.
 */

/** Quotes a field iff it needs it (comma, quote, or line break inside). */
function csvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Builds a CSV string: header row + data rows, CRLF-joined (Excel-friendly),
 * no trailing newline. Rows are emitted as given — no padding or truncation.
 */
export function toCsvString(header: string[], rows: string[][]): string {
  return [header, ...rows]
    .map(row => row.map(csvField).join(','))
    .join('\r\n');
}

/**
 * Triggers a browser download of the content as a CSV file. The BOM prefix
 * makes Excel open UTF-8 content correctly.
 */
export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob(['\ufeff' + content], {type: 'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
