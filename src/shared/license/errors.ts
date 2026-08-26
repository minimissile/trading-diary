/** License 相关错误码。 */
export type LicenseErrorCode =
  | 'LICENSE_INVALID'
  | 'LICENSE_EXPIRED'
  | 'LICENSE_REVOKED'
  | 'LICENSE_FEATURE_REQUIRED'
  | 'LICENSE_LIMIT_REACHED';

/** License 校验或权限不足时抛出的业务错误。 */
export class LicenseError extends Error {
  readonly code: LicenseErrorCode;

  constructor(code: LicenseErrorCode, message: string) {
    super(message);
    this.name = 'LicenseError';
    this.code = code;
  }
}
