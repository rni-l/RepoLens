import type {
  AiTagSuggestion,
  GenerateTagSuggestionsInput,
  GenerateTagSuggestionsResult,
  ProjectDetail,
  TagNode
} from "../shared/types.js";
import { RepoLensError } from "./errors.js";
import { idFromStableText } from "./pathUtils.js";

export type AiTagProjectPayload = {
  project: {
    name: string;
    path: string;
    description: string;
    readmeSummary: string | null;
    techStacks: string[];
    startCommand: string | null;
    testCommand: string | null;
    entryFiles: string[];
  };
  existingTags: Array<{
    id: string;
    path: string;
  }>;
};

export type AiTagProvider = {
  name: string;
  model: string;
  generateTagSuggestions(payload: AiTagProjectPayload): Promise<unknown>;
};

const SOURCE_FIELDS = new Set<AiTagSuggestion["sourceFields"][number]>([
  "name",
  "path",
  "description",
  "readmeSummary",
  "techStacks",
  "commands",
  "entryFiles"
]);

export class DeterministicMockAiTagProvider implements AiTagProvider {
  readonly name = "mock";
  readonly model = "deterministic-local";

  async generateTagSuggestions(payload: AiTagProjectPayload): Promise<unknown> {
    const text = [
      payload.project.name,
      payload.project.path,
      payload.project.description,
      payload.project.readmeSummary ?? "",
      payload.project.techStacks.join(" ")
    ]
      .join(" ")
      .toLowerCase();

    const suggestions: Array<{
      segments: string[];
      confidence: number;
      rationale: string;
      sourceFields: AiTagSuggestion["sourceFields"];
    }> = [];

    if (/水|water/.test(text)) {
      suggestions.push({
        segments: ["业务域", "水健康", text.includes("转换") || text.includes("transform") ? "数据转换" : "项目"],
        confidence: 0.91,
        rationale: "项目名称或描述显示它属于水健康业务域。",
        sourceFields: ["name", "path", "description"]
      });
    }
    if (/清洁|clean/.test(text)) {
      suggestions.push({
        segments: ["业务域", "清洁客服", text.includes("训练") ? "训练数据" : "数据转换"],
        confidence: 0.88,
        rationale: "项目路径或描述显示它服务于清洁客服资料流程。",
        sourceFields: ["name", "path", "description"]
      });
    }
    if (/cli|command|脚本|工具/.test(text)) {
      suggestions.push({
        segments: ["项目类型", "CLI 工具"],
        confidence: 0.84,
        rationale: "命令和描述暗示这是命令行或脚本型工具。",
        sourceFields: ["description", "commands"]
      });
    } else if (/react|vite|web|页面|app/.test(text)) {
      suggestions.push({
        segments: ["项目类型", "Web App"],
        confidence: 0.82,
        rationale: "技术栈或描述显示这是前端应用。",
        sourceFields: ["techStacks", "description"]
      });
    }
    if (/core|核心|常用|favorite|高频/.test(text)) {
      suggestions.push({
        segments: ["维护状态", "高频使用"],
        confidence: 0.8,
        rationale: "项目描述显示它可能是高频维护项目。",
        sourceFields: ["description"]
      });
    }
    if (!suggestions.length) {
      suggestions.push({
        segments: ["维护状态", "待整理"],
        confidence: 0.52,
        rationale: "当前元数据不足，建议先放入待整理分组。",
        sourceFields: ["name", "description"]
      });
    }

    return suggestions;
  }
}

export function buildAiTagPayload(project: ProjectDetail, tags: TagNode[]): AiTagProjectPayload {
  return {
    project: {
      name: project.name,
      path: project.path,
      description: project.description,
      readmeSummary: project.readmeSummary,
      techStacks: project.techStacks,
      startCommand: project.startCommand,
      testCommand: project.testCommand,
      entryFiles: project.entryFiles
    },
    existingTags: tags.map((tag) => ({
      id: tag.id,
      path: tag.path
    }))
  };
}

export function buildPromptPreview(payload: AiTagProjectPayload): string {
  return JSON.stringify(payload, null, 2);
}

export async function generateValidatedTagSuggestions(
  provider: AiTagProvider,
  payload: AiTagProjectPayload,
  input: GenerateTagSuggestionsInput
): Promise<GenerateTagSuggestionsResult> {
  const maxSuggestions = clampInteger(input.maxSuggestions ?? 5, 1, 12);
  const allowNewTags = input.allowNewTags ?? true;
  const output = await provider.generateTagSuggestions(payload).catch((error) => {
    if (error instanceof RepoLensError) {
      throw error;
    }
    throw new RepoLensError("ai_request_failed", error instanceof Error ? error.message : String(error));
  });
  const suggestions = validateAiSuggestions(output, payload.existingTags, allowNewTags).slice(0, maxSuggestions);

  return {
    projectId: input.projectId,
    suggestions,
    model: provider.model,
    promptPreview: buildPromptPreview(payload),
    createdAt: new Date().toISOString()
  };
}

export function validateAiSuggestions(
  output: unknown,
  existingTags: AiTagProjectPayload["existingTags"],
  allowNewTags: boolean
): AiTagSuggestion[] {
  const rawSuggestions = Array.isArray(output)
    ? output
    : isRecord(output) && Array.isArray(output.suggestions)
      ? output.suggestions
      : null;
  if (!rawSuggestions) {
    throw new RepoLensError("ai_invalid_response", "AI response must contain a suggestions array.");
  }

  const existingByPath = new Map(existingTags.map((tag) => [tag.path, tag]));
  const seen = new Set<string>();
  const normalized: AiTagSuggestion[] = [];

  for (const raw of rawSuggestions) {
    if (!isRecord(raw) || !Array.isArray(raw.segments)) {
      throw new RepoLensError("ai_invalid_response", "Each AI suggestion must include segments.");
    }
    const segments = raw.segments.map((segment) => {
      if (typeof segment !== "string") {
        throw new RepoLensError("ai_invalid_response", "Tag path segments must be strings.");
      }
      const trimmed = segment.trim();
      if (!trimmed || trimmed.includes("/")) {
        throw new RepoLensError("ai_invalid_response", "Tag path segments cannot be empty or contain /.");
      }
      return trimmed;
    });
    if (!segments.length) {
      throw new RepoLensError("ai_invalid_response", "Tag path must include at least one segment.");
    }

    const path = segments.join("/");
    if (seen.has(path)) {
      continue;
    }
    seen.add(path);

    const existing = existingByPath.get(path);
    if (!existing && !allowNewTags) {
      continue;
    }

    const sourceFields = Array.isArray(raw.sourceFields)
      ? raw.sourceFields.filter((field): field is AiTagSuggestion["sourceFields"][number] =>
          typeof field === "string" && SOURCE_FIELDS.has(field as AiTagSuggestion["sourceFields"][number])
        )
      : [];
    if (!sourceFields.length) {
      throw new RepoLensError("ai_invalid_response", "Each AI suggestion must include sourceFields.");
    }

    normalized.push({
      id: idFromStableText("suggestion", path),
      kind: existing ? "existing_tag" : "new_tag_path",
      tagId: existing?.id,
      path,
      segments,
      confidence: clampNumber(typeof raw.confidence === "number" ? raw.confidence : 0, 0, 1),
      rationale: typeof raw.rationale === "string" ? raw.rationale.trim() : "",
      sourceFields
    });
  }

  return normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.trunc(clampNumber(value, min, max));
}
