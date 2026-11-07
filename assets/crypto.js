const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
export const ITERATIONS = 600000;
const AAD = encoder.encode('tien-do:v1:PBKDF2-SHA256:AES-256-GCM');

export function fromBase64(value) {
  if (typeof value !== 'string' || value.length > 50000000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) throw new Error('Bản mã không hợp lệ.');
  return Uint8Array.from(atob(value), c => c.charCodeAt(0));
}

export function toBase64(bytes) {
  let output = '';
  for (let i = 0; i < bytes.length; i += 32768) output += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(output);
}

export async function importPassword(password) {
  if (!globalThis.crypto?.subtle) throw new Error('Hãy mở bằng HTTPS hoặc localhost để dùng giải mã.');
  if (typeof password !== 'string' || password.length > 1024) throw new Error('Mật khẩu không hợp lệ.');
  const bytes = encoder.encode(password);
  try { return await crypto.subtle.importKey('raw', bytes, 'PBKDF2', false, ['deriveKey']); }
  finally { bytes.fill(0); }
}

async function derive(material, salt, usages) {
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, usages);
}

export function validateEnvelope(envelope) {
  if (!envelope || envelope.version !== 1 || envelope.kdf?.name !== 'PBKDF2' || envelope.kdf.hash !== 'SHA-256' || envelope.kdf.iterations !== ITERATIONS || envelope.cipher?.name !== 'AES-256-GCM') throw new Error('Định dạng hoặc tham số bản mã không được hỗ trợ.');
  const salt = fromBase64(envelope.kdf.salt), iv = fromBase64(envelope.cipher.iv), ciphertext = fromBase64(envelope.ciphertext);
  if (salt.length !== 32 || iv.length !== 12 || ciphertext.length < 16) throw new Error('Bản mã không đầy đủ.');
  return { salt, iv, ciphertext };
}

export async function encryptData(data, password) {
  if (password.length < 16) throw new Error('Dùng mật khẩu ít nhất 16 ký tự hoặc cụm từ dài.');
  const material = await importPassword(password);
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await derive(material, salt, ['encrypt']);
  const clear = encoder.encode(JSON.stringify(data));
  try {
    const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: AAD, tagLength: 128 }, key, clear));
    return { version: 1, kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: ITERATIONS, salt: toBase64(salt) }, cipher: { name: 'AES-256-GCM', iv: toBase64(iv) }, ciphertext: toBase64(encrypted) };
  } finally { clear.fill(0); }
}

export async function decryptData(envelope, material) {
  const { salt, iv, ciphertext } = validateEnvelope(envelope);
  const key = await derive(material, salt, ['decrypt']);
  let clear;
  try {
    clear = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: AAD, tagLength: 128 }, key, ciphertext));
    const data = JSON.parse(decoder.decode(clear));
    if (data.version !== 1 || !Array.isArray(data.projects) || data.projects.length > 10000) throw new Error('Dữ liệu dự án không hợp lệ.');
    return data;
  } finally { clear?.fill(0); }
}
