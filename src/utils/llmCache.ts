import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { hashRequest } from "./hash.js";
import { dirname, join } from "node:path";
import { log } from "./logger.js";

export function createLlmCache(dir: string) {
  const pathFor = (key: string) => join(dir, key.slice(0, 2), `${key}.json`);

  async function get<T>(key: string): Promise<T | undefined> {
    try {
      return JSON.parse(await readFile(pathFor(key), "utf-8")) as T;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        log.warn(`cache read failed, treating as miss (${key.slice(0, 8)})`);
      }
      return undefined;
    }
  }

  async function set<T>(key: string, value: unknown): Promise<void> {
    const path = pathFor(key);
    await mkdir(dirname(path), { recursive: true });
    const tmp = `${path}. ${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(value), "utf-8");
    await rename(tmp, path);
  }

  async function getOrCompute<T>(
    request: unknown,
    compute: () => Promise<T>,
  ): Promise<{ value: T; hit: boolean }> {
    const key = hashRequest(request);
    const cached = await get<T>(key);
    if (cached !== undefined) {
      return {
        value: cached,
        hit: true,
      };
    }

    const value = await compute();
    await set(key, value);
    return { value, hit: false };
  }
  return { get, set, getOrCompute };
}

export type LlmCache = ReturnType<typeof createLlmCache>;
