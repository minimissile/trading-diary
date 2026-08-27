import fs from 'node:fs';
import path from 'node:path';

export interface ParsedCsv {
  headers: string[];
  rows: string[][];
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function detectDelimiter(line: string): ',' | '\t' | ';' {
  const candidates: Array<',' | '\t' | ';'> = [',', '\t', ';'];
  let best: ',' | '\t' | ';' = ',';
  let bestCount = -1;
  for (const delimiter of candidates) {
    const count = line.split(delimiter).length;
    if (count > bestCount) {
      best = delimiter;
      bestCount = count;
    }
  }
  return best;
}

function parseLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (!inQuotes && char === delimiter) {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

/**
 * 解析本地 CSV/TSV 文件为表头与数据行。
 */
export function parseCsvFile(sourcePath: string, maxRows = 5_000): ParsedCsv {
  const raw = fs.readFileSync(sourcePath, 'utf8');
  const normalized = stripBom(raw).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n').filter((line) => line.trim().length > 0);
  if (lines.length === 0) throw new Error('CSV 文件为空');

  const delimiter = detectDelimiter(lines[0] ?? '');
  const headers = parseLine(lines[0] ?? '', delimiter);
  const rows = lines.slice(1, maxRows + 1).map((line) => parseLine(line, delimiter));

  if (headers.length === 0) throw new Error('未识别到 CSV 表头');
  return { headers, rows };
}

export function csvBasename(sourcePath: string): string {
  return path.basename(sourcePath);
}
