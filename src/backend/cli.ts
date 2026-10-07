import { RepoLensService } from "./appService.js";
import { dispatch, type BackendRequest } from "./dispatch.js";
import { errorToJson } from "./errors.js";

const request = JSON.parse(process.argv[2] ?? "{}") as BackendRequest;
const service = new RepoLensService();

try {
  const result = await dispatch(service, request);
  process.stdout.write(JSON.stringify({ ok: true, result }));
} catch (error) {
  process.stdout.write(JSON.stringify({ ok: false, error: errorToJson(error) }));
  process.exitCode = 1;
} finally {
  service.close();
}
