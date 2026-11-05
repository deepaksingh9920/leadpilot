/**
 * Small, dependency-free CSV reader/writer used by lead import and export.
 *
 * It handles quoted fields, escaped quotes, embedded newlines, CRLF input, a
 * UTF-8 BOM, and comma/semicolon/tab delimiters. It deliberately does not try
 * to interpret numbers or dates — that belongs to the import validator.
 */

export type ParsedCsvRow = {
  values: string[];
  /** 1-based line number in the source text where the row starts. */
  line: number;
};

export type ParsedCsv = {
  headers: string[];
  rows: ParsedCsvRow[];
  delimiter: string;
};

const CANDIDATE_DELIMITERS = [",", ";", "\t"] as const;

export function detectDelimiter(firstLine: string): string {
  let best = ",";
  let bestCount = -1;
  for (const delimiter of CANDIDATE_DELIMITERS) {
    let count = 0;
    let quoted = false;
    for (let i = 0; i < firstLine.length; i += 1) {
      const char = firstLine[i];
      if (char === '"') {
        if (quoted && firstLine[i + 1] === '"') {
          i += 1;
        } else {
          quoted = !quoted;
        }
      } else if (!quoted && char === delimiter) {
        count += 1;
      }
    }
    if (count > bestCount) {
      best = delimiter;
      bestCount = count;
    }
  }
  return best;
}

export function parseCsv(input: string): ParsedCsv {
  const text = input.replace(/^\uFEFF/, "");
  if (text.trim().length === 0) {
    return { headers: [], rows: [], delimiter: "," };
  }

  const firstLine = text.slice(0, findLineEnd(text));
  const delimiter = detectDelimiter(firstLine);

  const records: ParsedCsvRow[] = [];
  let values: string[] = [];
  let field = "";
  let quoted = false;
  let line = 1;
  let rowLine = 1;
  let rowHasContent = false;

  const pushField = () => {
    values.push(field);
    field = "";
  };

  const pushRow = () => {
    pushField();
    const meaningful = rowHasContent || values.some((value) => value.trim().length > 0);
    if (meaningful) {
      records.push({ values, line: rowLine });
    }
    values = [];
    rowHasContent = false;
  };

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        if (char === "\n") line += 1;
        field += char;
      }
      continue;
    }

    if (char === '"' && field.length === 0) {
      quoted = true;
      rowHasContent = true;
      continue;
    }

    if (char === delimiter) {
      pushField();
      rowHasContent = true;
      continue;
    }

    if (char === "\r") {
      continue;
    }

    if (char === "\n") {
      pushRow();
      line += 1;
      rowLine = line;
      continue;
    }

    field += char;
    if (char.trim().length > 0) rowHasContent = true;
  }

  if (quoted) {
    throw new CsvParseError("The file has an unterminated quoted field.");
  }

  pushRow();

  const [headerRow, ...body] = records;
  if (!headerRow) {
    return { headers: [], rows: [], delimiter };
  }

  return {
    headers: headerRow.values.map((header) => header.trim()),
    rows: body,
    delimiter,
  };
}

export class CsvParseError extends Error {}

function findLineEnd(text: string): number {
  const index = text.indexOf("\n");
  return index === -1 ? text.length : index;
}

function escapeCell(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function serializeCsv(headers: string[], rows: string[][]): string {
  const lines = [headers.map(escapeCell).join(",")];
  for (const row of rows) {
    lines.push(row.map((value) => escapeCell(value ?? "")).join(","));
  }
  return `${lines.join("\r\n")}\r\n`;
}
