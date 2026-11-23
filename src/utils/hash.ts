import { createHash } from "node:crypto";

/** JSON.stringify with sorted keys, so equal objects always serialize identically. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const fields = Object.keys(obj)
    .sort()
    .filter((k) => obj[k] !== undefined)
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`);
  return `{${fields.join(",")}}`;
}

export const sha256 = (input: string): string => createHash("sha256").update(input).digest("hex");

/** Cache key for an LLM request (or anything JSON-like). */
export const hashRequest = (request: unknown): string => sha256(stableStringify(request));