export const maskSecret = (secret?: string) => {
  if (!secret) {
    return undefined;
  }

  if (secret.length <= 8) {
    return '****';
  }

  return `${secret.slice(0, 3)}****${secret.slice(-4)}`;
};
