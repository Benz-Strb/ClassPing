import { digest, getRandomValues, type CryptoDigestAlgorithm } from 'expo-crypto';

// supabase สร้าง PKCE ด้วย WebCrypto ถ้าไม่มีจะใช้แบบ plain และสุ่มด้วย Math.random
// บนมือถือไม่มี WebCrypto เลยเติมเท่าที่ supabase ใช้ (เว็บมีของจริงอยู่แล้ว ไม่ทับ)
const g = globalThis as {
  crypto?: { getRandomValues?: Crypto['getRandomValues']; subtle?: SubtleCrypto };
};
g.crypto ??= {};
g.crypto.getRandomValues ??= getRandomValues as Crypto['getRandomValues'];
g.crypto.subtle ??= {
  digest: (algorithm: string, data: BufferSource) =>
    digest(algorithm as CryptoDigestAlgorithm, data),
} as SubtleCrypto;
