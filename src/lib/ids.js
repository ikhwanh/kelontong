import { v5 as uuidv5, v7 as uuidv7 } from 'uuid';

// Fixed namespace for deterministic IDs. Never change it: every device must derive
// the same IDs from the same facts (DATABASE.md §1, IDs).
export const APP_NAMESPACE = '6b1f6c2e-3f0a-4c55-9a51-2f4d0f6a7c11';

export const newId = () => uuidv7();
export const derivedId = (name) => uuidv5(name, APP_NAMESPACE);

export const normalizeSku = (sku) => String(sku ?? '').trim().toUpperCase();
export const normalizeCategory = (name) => String(name ?? '').trim().toLowerCase();

export const productIdForSku = (sku) => derivedId('product:' + normalizeSku(sku));
export const categoryIdForName = (name) => derivedId('category:' + normalizeCategory(name));
export const openingMovementId = (fileHash, productId) => derivedId('opening:' + fileHash + ':' + productId);
export const cancelMovementId = (saleLineId) => derivedId('cancel:' + saleLineId);

export async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
