import { z } from "zod";
import { ingestionError } from "../utils/error.js";

export type gitHubRepo = { owner: string; repo: string };

export function parseRepo(url: string): gitHubRepo | undefined {
  const m = /github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/.exec(
    url.trim(),
  );
  return m ? { owner: m[1]!, repo: m[2]! } : undefined;
}

export type prInfo = {
  number: number;
  title: string;
  baseRef: string;
  headSha: string;
};

const PrResponse = z.object({
  title: z.string(),
  base: z.object({ ref: z.string() }),
  head: z.object({ sha: z.string() }),
});

export async function fetchPrInfo(
  gh: gitHubRepo,
  prNumber: number,
  deps: { token?: string | undefined; fetchFn?: typeof fetch | undefined } = {},
) : Promise<prInfo> {
    const doFetch = deps.fetchFn ?? fetch;
  const headers: Record<string, string> = { Accept: "application/vnd.github+json" };
  if (deps.token) headers.Authorization = `Bearer ${deps.token}`;

  const res = await doFetch(`https://api.github.com/repos/${gh.owner}/${gh.repo}/pulls/${prNumber}`, { headers });
  if (!res.ok) throw ingestionError(`GitHub returned ${res.status} for ${gh.owner}/${gh.repo}#${prNumber}`);

  const parsed = PrResponse.safeParse(await res.json());
  if (!parsed.success) throw ingestionError("Unexpected GitHub PR response shape");
  return { number: prNumber, title: parsed.data.title, baseRef: parsed.data.base.ref, headSha: parsed.data.head.sha };

}
