// Shared password generation used by hotspot creation flows.
// Never hardcode hotspot credentials; always generate a random passphrase.

const CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

export function generateHotspotPassword(length = 12): string {
  const array = new Uint32Array(length);
  crypto.getRandomValues(array);
  let password = "";
  for (let i = 0; i < length; i++) {
    password += CHARSET[array[i] % CHARSET.length];
  }
  return password;
}
