/** 访问锁公开配置（不含密码哈希）。 */
export interface AccessLockSettingsView {
  enabled: boolean;
  hasPassword: boolean;
}

export interface VerifyAccessLockResult {
  valid: boolean;
}

export interface EnableAccessLockInput {
  newPassword: string;
}

export interface DisableAccessLockInput {
  password: string;
}

export interface ChangeAccessLockPasswordInput {
  currentPassword: string;
  newPassword: string;
}
