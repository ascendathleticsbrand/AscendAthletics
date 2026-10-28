// Values prepared for admin exports. Keep spreadsheet escaping separate from display formatting.
// Quote CSV values and neutralize formula prefixes before a spreadsheet opens the export.
export function csvCell(value: string): string {
  const escaped = /^[\s\u0000-\u001f]*[=+@-]|^[\t\r\n]/.test(value) ? `'${value}` : value;
  return `"${escaped.replaceAll('"', '""')}"`;
}
