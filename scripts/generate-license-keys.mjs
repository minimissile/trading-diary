#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateKeyPairSync } from 'node:crypto';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const licensesDir = path.join(rootDir, 'licenses');
const privatePath = path.join(licensesDir, 'private.pem');
const publicPath = path.join(licensesDir, 'public.pem');
const publicTarget = path.join(rootDir, 'src/shared/license/public-key.ts');

if (fs.existsSync(privatePath)) {
  console.error('已存在 licenses/private.pem，如需重新生成请先手动备份并删除。');
  process.exit(1);
}

fs.mkdirSync(licensesDir, { recursive: true });
const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' });
const publicPem = publicKey.export({ type: 'spki', format: 'pem' });

fs.writeFileSync(privatePath, privatePem, { mode: 0o600 });
fs.writeFileSync(publicPath, publicPem, { mode: 0o644 });

const publicKeyModule = `/** 客户端内置的 License 验签公钥（Ed25519 PEM）。私钥仅保存在本机 licenses/ 目录。 */
export const LICENSE_PUBLIC_KEY_PEM = \`${publicPem}\`;
`;

fs.writeFileSync(publicTarget, publicKeyModule, 'utf8');

console.log('已生成密钥对：');
console.log(`  私钥（勿提交）: ${privatePath}`);
console.log(`  公钥（已写入）: ${publicTarget}`);
console.log('');
console.log('请将 licenses/ 目录保留在本机，用于 npm run license:issue 发码。');
