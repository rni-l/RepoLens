export class RepoLensError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "RepoLensError";
    this.code = code;
  }
}

export function errorToJson(error: unknown): { code: string; message: string } {
  if (error instanceof RepoLensError) {
    return { code: error.code, message: error.message };
  }
  if (error instanceof Error) {
    return { code: "unexpected_error", message: error.message };
  }
  return { code: "unexpected_error", message: String(error) };
}
