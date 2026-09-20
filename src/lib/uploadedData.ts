export const MAX_UPLOADED_ROWS = 50;

export type ParsedUploadType = 'json-array' | 'json-object' | 'csv' | 'tsv';

export interface ParsedUpload {
  filename: string;
  type: ParsedUploadType;
  columns: string[];
  rows: unknown[];
}

function splitDelimited(text: string, delimiter: string, maxRows: number): { columns: string[]; rows: Record<string, string>[] } {
  const lines = text.split(/\r\n|\n/).filter(l => l.length > 0);
  if (lines.length === 0) return { columns: [], rows: [] };

  const columns = lines[0].split(delimiter).map(c => c.trim());
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length && rows.length < maxRows; i++) {
    const cells = lines[i].split(delimiter);
    const row: Record<string, string> = {};
    columns.forEach((col, idx) => {
      row[col] = (cells[idx] ?? '').trim();
    });
    rows.push(row);
  }
  return { columns, rows };
}

/**
 * Parses an uploaded file into a bounded set of rows the model can be given
 * directly (as literal data), instead of a filename it would try to fetch.
 * Returns null for unsupported file types.
 */
export function parseUploadedFile(filename: string, text: string, maxRows: number = MAX_UPLOADED_ROWS): ParsedUpload | null {
  if (filename.endsWith('.json')) {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      const rows = parsed.slice(0, maxRows);
      const first = rows[0];
      const columns = first && typeof first === 'object' ? Object.keys(first) : [];
      return { filename, type: 'json-array', columns, rows };
    }
    if (parsed && typeof parsed === 'object') {
      return { filename, type: 'json-object', columns: Object.keys(parsed), rows: [parsed] };
    }
    return { filename, type: 'json-array', columns: [], rows: [] };
  }

  if (filename.endsWith('.tsv')) {
    const { columns, rows } = splitDelimited(text, '\t', maxRows);
    return { filename, type: 'tsv', columns, rows };
  }

  if (filename.endsWith('.csv')) {
    const { columns, rows } = splitDelimited(text, ',', maxRows);
    return { filename, type: 'csv', columns, rows };
  }

  return null;
}
