export type ChangePilotError = Error & { readonly code: string };
const makeErrorFactory =
  (code: string) =>
  (message: string, option?: ErrorOptions): ChangePilotError =>
    Object.assign(
      new Error(message, option),
      { name: "ChangePilotError", code },
      code,
    );

export const configError = makeErrorFactory("CONFIG_ERROR");
export const notImplementedError  = makeErrorFactory("VALIDATION_ERROR");
export const llmError  = makeErrorFactory("LLM ERROR");
export const evalError  = makeErrorFactory("EVALUATION ERROR");
export const workSpaceError = makeErrorFactory("WORK SPACE ERROR");
export const ingestionError = makeErrorFactory("INGESTION ERROR");




export const isChangePilotError = (error: unknown): error is ChangePilotError =>
  error instanceof Error &&
  error.name == "ChangePilotError" &&
  typeof (error as { code?: unknown })?.code === "string";
