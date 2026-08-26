#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPrivateKey, sign } from 'node:crypto';

const LICENSE_CODE_PREFIX = 'TD1';

function parseArgs(argv) {
  const options = {
    tier: 'pro',
    days: 365,
    note: '',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--tier' && argv[index + 1]) {
      options.tier = argv[index + 1];
      index += 1;
      continue;
    }
    if (token === '--days' && argv[index + 1]) {
      options.days = Number.parseInt(argv[index + 1], 10);
      index += 1;
      continue;
    }
    if (token === '--note' && argv[index + 1]) {
      options.note = argv[index + 1];
      index += 1;
    }
  }

  return options;
}

function base64UrlEncode(input) {
  return Buffer.from(input, 'utf8').toString('base64url');
}

function generateLicenseId() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let index = 0; index < 8; index += 1) {
    result += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return result;
}

function computeExpiry(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function signPayload(payload, privateKeyPem) {
  const canonical = JSON.stringify(payload);
  const key = createPrivateKey(privateKeyPem);
  const signature = sign(null, Buffer.from(canonical, 'utf8'), key);
  return `${LICENSE_CODE_PREFIX}.${base64UrlEncode(canonical)}.${base64UrlEncode(signature)}`;
}

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const privatePath = path.join(rootDir, 'licenses/private.pem');
const logPath = path.join(rootDir, 'licenses/issued.log');
const { tier, days, note } = parseArgs(process.argv.slice(2));

if (!['pro', 'lifetime'].includes(tier)) {
  console.error('--tier 仅支持 pro 或 lifetime');
  process.exit(1);
}

if (!Number.isFinite(days) || days <= 0) {
  console.error('--days 必须是正整数');
  process.exit(1);
}

if (!fs.existsSync(privatePath)) {
  console.error(`未找到私钥 ${privatePath}，请先运行 npm run license:keys`);
  process.exit(1);
}

const privateKeyPem = fs.readFileSync(privatePath, 'utf8');
const payload = {
  v: 1,
  tier,
  exp: tier === 'lifetime' ? '2099-12-31' : computeExpiry(days),
  lid: generateLicenseId(),
};
const code = signPayload(payload, privateKeyPem);
const issuedAt = new Date().toISOString();

fs.mkdirSync(path.dirname(logPath), { recursive: true });
const logLine = [issuedAt, payload.lid, payload.tier, payload.exp, note.replace(/\s+/gu, ' ').trim()].join('\t');
fs.appendFileSync(logPath, `${logLine}\n`, 'utf8');

console.log('');
console.log('激活码（发给用户）：');
console.log(code);
console.log('');
console.log('摘要：');
console.log(`  编号: ${payload.lid}`);
console.log(`  档位: ${payload.tier}`);
console.log(`  到期: ${payload.exp}`);
if (note) console.log(`  备注: ${note}`);
console.log(`  记录: ${logPath}`);
