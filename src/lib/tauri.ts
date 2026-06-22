import { invoke } from "@tauri-apps/api/tauri";
import type {
  AppApi,
  ApplyTagSuggestionsInput,
  BulkTagProjectsInput,
  GenerateTagSuggestionsInput,
  OpenAction,
  ProjectFilters,
  ProjectUpdatePatch,
  ScanRootUpdatePatch,
  TagCreateInput,
  TagMoveDirection,
  TagUpdatePatch
} from "./types";
import { mockApi } from "./mockApi";

const isTauri = "__TAURI__" in window;

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  return invoke<T>(command, args);
}

export const api: AppApi = isTauri
  ? {
      listProjects: (filters: ProjectFilters = {}) => call("list_projects", { filters }),
      getProject: (projectId: string) => call("get_project", { projectId }),
      updateProject: (projectId: string, patch: ProjectUpdatePatch) =>
        call("update_project", { projectId, patch }),
      bulkTagProjects: (input: BulkTagProjectsInput) => call("bulk_tag_projects", { input }),
      addManualProject: (path: string) => call("add_manual_project", { path }),
      deleteProject: (projectId: string) => call("delete_project", { projectId }),
      listTags: () => call("list_tags"),
      createTag: (input: TagCreateInput) => call("create_tag", { input }),
      updateTag: (id: string, patch: TagUpdatePatch) => call("update_tag", { id, patch }),
      moveTag: (id: string, direction: TagMoveDirection) => call("move_tag", { id, direction }),
      deleteTag: (id: string) => call("delete_tag", { id }),
      getAiTaggingStatus: () => call("get_ai_tagging_status"),
      generateTagSuggestions: (input: GenerateTagSuggestionsInput) =>
        call("generate_tag_suggestions", { input }),
      applyTagSuggestions: (input: ApplyTagSuggestionsInput) => call("apply_tag_suggestions", { input }),
      listScanRoots: () => call("list_scan_roots"),
      addScanRoot: (path: string) => call("add_scan_root", { path }),
      updateScanRoot: (id: string, patch: ScanRootUpdatePatch) =>
        call("update_scan_root", { id, patch }),
      removeScanRoot: (id: string) => call("remove_scan_root", { id }),
      scanAllRoots: () => call("scan_all_roots"),
      scanRoot: (rootId: string) => call("scan_root", { rootId }),
      detectOpenActions: () => call("detect_open_actions"),
      openProject: (projectId: string, action: OpenAction) => call("open_project", { projectId, action })
    }
  : mockApi;
