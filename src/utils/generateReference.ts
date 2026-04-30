const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

export function generateReference(length = 8): string {
  let ref = 'BK-';
  for (let i = 0; i < length; i++) {
    ref += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return ref;
}
