/**
 * 将密钥转换为前端可展示的掩码字符串。
 */
export const maskSecret = (secret?: string) => {
  if (!secret) {
    return undefined;
  }

  if (secret.length <= 8) {
    return '****';
  }

  return `${secret.slice(0, 3)}****${secret.slice(-4)}`;
};
