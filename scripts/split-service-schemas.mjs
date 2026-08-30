import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const sourcePath = path.join(root, 'src/shared/service.schemas.ts');
const lines = fs.readFileSync(sourcePath, 'utf8').split('\n');

const unionStart = lines.findIndex((line) => line.includes('export const serviceRequestSchema = z.discriminatedUnion'));
const headerLines = lines.slice(0, unionStart);
const bodyLines = lines.slice(unionStart + 1, lines.length - 1);

const blocks = [];
let current = [];
let depth = 0;
for (const line of bodyLines) {
  if (current.length === 0 && line.trim() === 'z.object({') {
    current.push(line);
    depth = 1;
    continue;
  }
  if (current.length === 0) continue;
  current.push(line);
  depth += (line.match(/\(/g) ?? []).length;
  depth -= (line.match(/\)/g) ?? []).length;
  if (depth <= 0 && line.trim() === '}),') {
    blocks.push(current.join('\n'));
    current = [];
    depth = 0;
  }
}

function methodPrefix(block) {
  const match = block.match(/method: z\.literal\('([^']+)'\)/);
  return match ? match[1].split('.')[0] : 'misc';
}

const groups = new Map();
for (const block of blocks) {
  const prefix = methodPrefix(block);
  if (!groups.has(prefix)) groups.set(prefix, []);
  groups.get(prefix).push(block);
}

const schemasDir = path.join(root, 'src/shared/schemas');
const requestsDir = path.join(schemasDir, 'requests');
fs.mkdirSync(requestsDir, { recursive: true });

const paramStart = headerLines.findIndex((line) => line.includes('export const accountCustomFeeSchema'));
const primitiveEnd = paramStart;
const primitiveLines = headerLines.slice(0, paramStart);
const paramLines = headerLines.slice(paramStart);

fs.writeFileSync(
  path.join(schemasDir, 'primitives.ts'),
  `import { z } from 'zod';
import { ACCOUNT_BROKER_IDS } from '../accounts/brokers';

${primitiveLines
  .filter((line) => !line.startsWith('import '))
  .join('\n')}
`,
);

fs.writeFileSync(
  path.join(schemasDir, 'params.ts'),
  `import { z } from 'zod';
import {
  accountAliasSchema,
  accountBrokerSchema,
  accountKindSchema,
  alertEventActionSchema,
  directionSchema,
  nonNegativeNumberSchema,
  planStatusSchema,
  playbookCategorySchema,
  playbookCheckTimingSchema,
  playbookStatusSchema,
  positiveNumberSchema,
  symbolSchema,
} from './primitives';

${paramLines.join('\n')}
`,
);

const requestImports = [];
const requestSpreads = [];
for (const prefix of [...groups.keys()].sort()) {
  const fileName = `${prefix}.requests.ts`;
  const content = `import { z } from 'zod';
import { assetHashSchema, nonNegativeNumberSchema, positiveNumberSchema, symbolSchema } from '../primitives';
import {
  accountCustomFeeSchema,
  alertEventActionSchema,
  alertStatusSchema,
  createAccountParamsSchema,
  createAlertParamsSchema,
  createPlanParamsSchema,
  createPlaybookRuleParamsSchema,
  createReviewParamsSchema,
  executionImportInputSchema,
  playbookStatusSchema,
  planStatusSchema,
  reviewAiDraftParamsSchema,
  updateAccountInputSchema,
  updatePlaybookRuleParamsSchema,
} from '../params';

export const ${prefix}ServiceRequests = [
${groups.get(prefix).join(',\n')}
] as const;
`;
  fs.writeFileSync(path.join(requestsDir, fileName), content);
  requestImports.push(`import { ${prefix}ServiceRequests } from './requests/${prefix}.requests';`);
  requestSpreads.push(`  ...${prefix}ServiceRequests,`);
}

fs.writeFileSync(
  path.join(schemasDir, 'service-request.ts'),
  `import { z } from 'zod';
${requestImports.join('\n')}

export const serviceRequestSchema = z.discriminatedUnion('method', [
${requestSpreads.join('\n')}
]);
`,
);

fs.writeFileSync(
  path.join(root, 'src/shared/service.schemas.ts'),
  `export { accountCustomFeeSchema } from './schemas/params';
export { assetHashSchema } from './schemas/primitives';
export { serviceRequestSchema } from './schemas/service-request';
`,
);

console.log(`Parsed ${blocks.length} request blocks across ${groups.size} groups.`);
