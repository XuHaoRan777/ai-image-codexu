import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'crypto';

const algorithm = 'aes-256-gcm';
const encoding = 'base64url';
const version = 'v1';

/**
 * Encrypts a secret for database storage. The returned payload includes
 * version, IV, auth tag, and ciphertext.
 */
export function encryptSecret(secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(algorithm, getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(secret, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    version,
    iv.toString(encoding),
    tag.toString(encoding),
    ciphertext.toString(encoding),
  ].join(':');
}

/**
 * Decrypts a secret payload produced by encryptSecret.
 */
export function decryptSecret(payload?: string | null) {
  if (!payload) {
    return undefined;
  }

  const [payloadVersion, ivText, tagText, ciphertextText] =
    payload.split(':');

  if (payloadVersion !== version || !ivText || !tagText || !ciphertextText) {
    throw new Error('Unsupported secret payload format');
  }

  const decipher = createDecipheriv(
    algorithm,
    getEncryptionKey(),
    Buffer.from(ivText, encoding),
  );

  decipher.setAuthTag(Buffer.from(tagText, encoding));

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextText, encoding)),
    decipher.final(),
  ]).toString('utf8');
}

/**
 * 从环境变量派生 AES-256-GCM 加密密钥。
 */
function getEncryptionKey() {
  const secret =
    process.env.API_KEY_ENCRYPTION_SECRET?.trim() ||
    process.env.APP_SECRET?.trim();

  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'API_KEY_ENCRYPTION_SECRET or APP_SECRET is required in production',
      );
    }

    return createHash('sha256')
      .update('ai-image-codexu-development-secret')
      .digest();
  }

  return createHash('sha256').update(secret).digest();
}
