/** Public share links for snippets. A share id is separate from the snippet id, random, and revocable. */
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
export const SHARE_ID_LENGTH = 22; // 22 × log2(62) ≈ 131 bits
export const SHARE_ID = /^[A-Za-z0-9]{22}$/;

const cryptoBytes = (n: number) => globalThis.crypto.getRandomValues(new Uint8Array(n));

/** Unbiased base62 via rejection sampling (bytes ≥ 248 are discarded). */
export function newShareId(random: (n: number) => Uint8Array = cryptoBytes): string {
  let out = "";
  while (out.length < SHARE_ID_LENGTH) {
    for (const b of random(32)) {
      if (b >= 248) continue;
      out += ALPHABET[b % 62];
      if (out.length === SHARE_ID_LENGTH) break;
    }
  }
  return out;
}

export const sharePath = (shareId: string) => `/s/${shareId}`;
export const shareUrl = (shareId: string, origin: string) => `${origin.replace(/\/+$/, "")}${sharePath(shareId)}`;

/** What a public share exposes: never the owner, never the private snippet id. */
export interface SharedSnippet { id: string; title: string; code: string; exampleId: string | null; updatedAt: number }

/** localStorage key of the playground draft; "Fork" writes the shared code here. */
export const PLAYGROUND_DRAFT_KEY = "tp-playground-draft";
