import { RepoLensService } from "./appService.js";
import { errorToJson } from "./errors.js";

type CliRequest = {
  command: string;
  args?: unknown;
};

const request = JSON.parse(process.argv[2] ?? "{}") as CliRequest;
const service = new RepoLensService();

try {
  const result = await dispatch(request);
  process.stdout.write(JSON.stringify({ ok: true, result }));
} catch (error) {
  process.stdout.write(JSON.stringify({ ok: false, error: errorToJson(error) }));
  process.exitCode = 1;
} finally {
  service.close();
}

async function dispatch(request: CliRequest): Promise<unknown> {
  const args = (request.args ?? {}) as Record<string, unknown>;
  switch (request.command) {
    case "list_projects":
      return service.listProjects((args.filters ?? {}) as never);
    case "get_project":
      return service.getProject(String(args.projectId));
    case "update_project":
      return service.updateProject(String(args.projectId), (args.patch ?? {}) as never);
    case "bulk_tag_projects":
      return service.bulkTagProjects((args.input ?? {}) as never);
    case "add_manual_project":
      return service.addManualProject(String(args.path));
    case "delete_project":
      return service.deleteProject(String(args.projectId));
    case "list_tags":
      return service.listTags();
    case "create_tag":
      return service.createTag((args.input ?? {}) as never);
    case "update_tag":
      return service.updateTag(String(args.id), (args.patch ?? {}) as never);
    case "move_tag":
      return service.moveTag(String(args.id), args.direction as never);
    case "delete_tag":
      return service.deleteTag(String(args.id));
    case "get_ai_tagging_status":
      return service.getAiTaggingStatus();
    case "generate_tag_suggestions":
      return service.generateTagSuggestions((args.input ?? {}) as never);
    case "apply_tag_suggestions":
      return service.applyTagSuggestions((args.input ?? {}) as never);
    case "list_scan_roots":
      return service.listScanRoots();
    case "add_scan_root":
      return service.addScanRoot(String(args.path));
    case "update_scan_root":
      return service.updateScanRoot(String(args.id), (args.patch ?? {}) as never);
    case "remove_scan_root":
      return service.removeScanRoot(String(args.id));
    case "scan_all_roots":
      return service.scanAllRoots();
    case "scan_root":
      return service.scanRoot(String(args.rootId));
    case "detect_open_actions":
      return service.detectOpenActions();
    case "open_project":
      return service.openProject(String(args.projectId), args.action as never);
    case "add_project_link":
      return service.addProjectLink((args.input ?? {}) as never);
    case "update_project_link":
      return service.updateProjectLink(String(args.id), (args.patch ?? {}) as never);
    case "delete_project_link":
      return service.deleteProjectLink(String(args.id));
    case "clear_auto_tags":
      return service.clearAutoTags(String(args.projectId));
    case "open_url":
      return service.openUrl(String(args.url));
    case "get_integration_status":
      return service.getIntegrationStatus();
    default:
      throw new Error(`Unknown command: ${request.command}`);
  }
}
