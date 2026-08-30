import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  readLedgerImportImagePreviews,
  saveLedgerImportPasteImages,
} from '../src/service/portfolio/ledger-import-paste-store';

describe('ledger import paste store', () => {
  it('writes pasted base64 images to temp files', async () => {
    const dataDir = mkdtempSync(path.join(os.tmpdir(), 'ledger-paste-'));
    const pngBase64 = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).toString('base64');

    try {
      const saved = await saveLedgerImportPasteImages(dataDir, [{ data: pngBase64, mimeType: 'image/png' }]);
      expect(saved.sourcePaths).toHaveLength(1);
      expect(saved.fileNames[0]).toMatch(/^paste-\d+-1\.png$/u);
      expect(readFileSync(saved.sourcePaths[0]!).subarray(0, 4).toString('hex')).toBe('89504e47');
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('reads image previews as data urls', async () => {
    const dataDir = mkdtempSync(path.join(os.tmpdir(), 'ledger-paste-'));
    const pngBase64 = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).toString('base64');

    try {
      const saved = await saveLedgerImportPasteImages(dataDir, [{ data: pngBase64, mimeType: 'image/png' }]);
      const previews = await readLedgerImportImagePreviews(saved.sourcePaths);
      expect(previews[0]).toMatch(/^data:image\/png;base64,/u);
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });
});
