import { createPrivateKey, createPublicKey, sign, verify, type KeyObject } from 'node:crypto';
import { z } from 'zod';
import { LicenseError } from '../../shared/license/errors';
import { LICENSE_PUBLIC_KEY_PEM } from '../../shared/license/public-key';
import { REVOKED_LICENSE_IDS } from '../../shared/license/revoked-ids';
import type { LicensePayload } from '../../shared/license/types';

export const LICENSE_CODE_PREFIX = 'TD1';

const licensePayloadSchema = z
  .object({
    v: z.literal(1),
    tier: z.enum(['pro', 'lifetime']),
    exp: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
    lid: z.string().regex(/^[A-Z0-9]{8}$/u),
  })
  .strict();

function base64UrlEncode(input: Buffer | string): string {
  const buffer = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buffer.toString('base64url');
}

function base64UrlDecode(input: string): Buffer {
  return Buffer.from(input, 'base64url');
}

function canonicalPayload(payload: LicensePayload): string {
  return JSON.stringify({
    v: payload.v,
    tier: payload.tier,
    exp: payload.exp,
    lid: payload.lid,
  });
}

let cachedPublicKeys = new Map<string, KeyObject>();

function getPublicKey(publicKeyPem = LICENSE_PUBLIC_KEY_PEM): KeyObject {
  const cached = cachedPublicKeys.get(publicKeyPem);
  if (cached) return cached;
  const key = createPublicKey(publicKeyPem);
  cachedPublicKeys = new Map(cachedPublicKeys).set(publicKeyPem, key);
  return key;
}

/**
 * 校验 ISO 日期字符串是否未过期（按 UTC 日界）。
 * @param exp 到期日 YYYY-MM-DD
 */
export function isLicenseExpired(exp: string, now = new Date()): boolean {
  const end = new Date(`${exp}T23:59:59.999Z`);
  return now.getTime() > end.getTime();
}

/**
 * 解析并验签激活码，返回 payload。
 * @param code 用户粘贴的 TD1 激活码
 * @param publicKeyPem 可选公钥，测试时可注入
 */
export function verifyLicenseCode(code: string, publicKeyPem = LICENSE_PUBLIC_KEY_PEM): LicensePayload {
  const trimmed = code.trim();
  const parts = trimmed.split('.');
  if (parts.length !== 3 || parts[0] !== LICENSE_CODE_PREFIX) {
    throw new LicenseError('LICENSE_INVALID', '激活码格式无效');
  }

  const [, payloadPart, signaturePart] = parts;
  if (!payloadPart || !signaturePart) {
    throw new LicenseError('LICENSE_INVALID', '激活码格式无效');
  }

  let payloadJson: string;
  try {
    payloadJson = base64UrlDecode(payloadPart).toString('utf8');
  } catch {
    throw new LicenseError('LICENSE_INVALID', '激活码内容无法解析');
  }

  let payloadRaw: unknown;
  try {
    payloadRaw = JSON.parse(payloadJson);
  } catch {
    throw new LicenseError('LICENSE_INVALID', '激活码内容不是有效 JSON');
  }

  const parsed = licensePayloadSchema.safeParse(payloadRaw);
  if (!parsed.success) {
    throw new LicenseError('LICENSE_INVALID', '激活码字段无效');
  }

  const payload = parsed.data;
  const signature = base64UrlDecode(signaturePart);
  const canonical = canonicalPayload(payload);
  const valid = verify(null, Buffer.from(canonical, 'utf8'), getPublicKey(publicKeyPem), signature);
  if (!valid) {
    throw new LicenseError('LICENSE_INVALID', '激活码签名无效');
  }

  if (REVOKED_LICENSE_IDS.includes(payload.lid)) {
    throw new LicenseError('LICENSE_REVOKED', '该激活码已作废，请联系作者换码');
  }

  if (payload.tier !== 'lifetime' && isLicenseExpired(payload.exp)) {
    throw new LicenseError('LICENSE_EXPIRED', `激活码已于 ${payload.exp} 过期`);
  }

  return payload;
}

/**
 * 使用私钥签发激活码（仅发码脚本或测试使用）。
 * @param payload License payload
 * @param privateKeyPem Ed25519 私钥 PEM
 */
export function signLicensePayload(payload: LicensePayload, privateKeyPem: string): string {
  const canonical = canonicalPayload(payload);
  const key = createPrivateKey(privateKeyPem);
  const signature = sign(null, Buffer.from(canonical, 'utf8'), key);
  return `${LICENSE_CODE_PREFIX}.${base64UrlEncode(canonical)}.${base64UrlEncode(signature)}`;
}

/**
 * 生成随机 license id。
 */
export function generateLicenseId(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let index = 0; index < 8; index += 1) {
    result += alphabet[Math.floor(Math.random() * alphabet.length)]!;
  }
  return result;
}

/**
 * 根据天数计算到期日（UTC 日历日）。
 * @param days 有效天数
 */
export function computeLicenseExpiry(days: number, from = new Date()): string {
  const date = new Date(from);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
