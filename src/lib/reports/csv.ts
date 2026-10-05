/** RFC 4180 CSV with spreadsheet formula-injection protection. Null → empty cell (not 0). */
export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const cell = (v: string | number | null | undefined) => {
    if (v === null || v === undefined || (typeof v === "number" && !Number.isFinite(v))) return "";
    let s = typeof v === "number" ? String(Math.round(v * 10000) / 10000) : v;
    if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}
