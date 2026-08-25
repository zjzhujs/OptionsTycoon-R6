export function new_id(): string {
  const crypto_api = globalThis.crypto as Crypto | undefined;
  if (crypto_api?.randomUUID) return crypto_api.randomUUID().replace(/-/g, "");
  return `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
}

