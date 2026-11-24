import { resolve } from "node:path";
import { cosmiconfig } from "cosmiconfig";
import { configError } from "../utils/error.js";
import { type Config, parseConfig } from "./schema.js";

export type LoadConfigOptions = {
  cwd: string;
  /** Explicit --config path; otherwise we search upward from cwd for .changepilotrc.json etc. */
  configPath?: string | undefined ;
};

export async function loadConfig({ cwd, configPath }: LoadConfigOptions): Promise<Config> {
  const explorer = cosmiconfig("changepilot");
  let result;
  try {
    result = configPath ? await explorer.load(resolve(cwd, configPath)) : await explorer.search(cwd);
  } catch (err) {
    throw configError(`Could not read config: ${(err as Error).message}`, { cause: err });
  }
  if (!result || result.isEmpty) {
    throw configError(
      "No config found. Create .changepilotrc.json with at least testCommand and reporter (see the example in the repo).",
    );
  }
  return parseConfig(result.config, result.filepath);
}