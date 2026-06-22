import type {
  AiTagSuggestion,
  AppApi,
  ApplyTagSuggestionsInput,
  GenerateTagSuggestionsInput,
  OpenActionAvailability,
  ProjectDetail,
  ProjectFilters,
  ProjectListItem,
  ProjectTag,
  ProjectUpdatePatch,
  ScanRoot,
  ScanRootUpdatePatch,
  ScanSummary,
  TagCreateInput,
  TagNode,
  TagUpdatePatch
} from "./types";

const now = new Date().toISOString();

let scanRoots: ScanRoot[] = [
  {
    id: "root_documents",
    path: "/Users/ddd/Documents",
    enabled: true,
    createdAt: now,
    updatedAt: now
  },
  {
    id: "root_feiyu",
    path: "/Users/ddd/D/feiyu",
    enabled: true,
    createdAt: now,
    updatedAt: now
  },
  {
    id: "root_archive",
    path: "/Users/ddd/Archive",
    enabled: false,
    createdAt: now,
    updatedAt: now
  }
];

let tags: TagNode[] = [];

const tagPaths = {
  waterTransform: createInitialTagPath(["业务域", "水健康", "数据转换"]),
  cleanTraining: createInitialTagPath(["业务域", "清洁客服", "训练数据"]),
  cli: createInitialTagPath(["项目类型", "CLI 工具"]),
  webApp: createInitialTagPath(["项目类型", "Web App"]),
  frequent: createInitialTagPath(["维护状态", "高频使用"]),
  selfCore: createInitialTagPath(["维护状态", "自用核心"]),
  archived: createInitialTagPath(["维护状态", "归档"])
};

let projects: ProjectDetail[] = [
  {
    id: "water",
    name: "water-product-transform-info",
    path: "/Users/ddd/D/feiyu/水健康-客服/code/water-product-transform-info",
    description: "水健康客服数据转换工具，负责把产品资料转换成训练与知识库需要的结构化结果。",
    readmeSummary: "把水健康产品资料转换为训练、知识库和飞书发布需要的结构化数据。",
    techStacks: ["TypeScript", "Vite", "Feishu"],
    status: "active",
    tags: toProjectTags([tagPaths.waterTransform, tagPaths.cli, tagPaths.frequent]),
    lastModifiedAt: now,
    source: "scan",
    favorite: true,
    startCommand: "npm run dev",
    testCommand: "npm test",
    entryFiles: ["src/main.ts"],
    descriptionSource: "user",
    startCommandSource: "auto",
    testCommandSource: "auto",
    lastScannedAt: now,
    createdAt: now,
    updatedAt: now
  },
  {
    id: "todo",
    name: "myself-todo",
    path: "/Users/ddd/Documents/myself-todo",
    description: "个人任务管理应用，包含今日工作台、任务详情、快速添加和报告页。",
    readmeSummary: "Self-hosted todo app for personal task planning.",
    techStacks: ["Node.js", "React"],
    status: "active",
    tags: toProjectTags([tagPaths.webApp, tagPaths.selfCore]),
    lastModifiedAt: now,
    source: "scan",
    favorite: false,
    startCommand: "npm run dev",
    testCommand: "npm test",
    entryFiles: ["src/main.tsx"],
    descriptionSource: "user",
    startCommandSource: "auto",
    testCommandSource: "auto",
    lastScannedAt: now,
    createdAt: now,
    updatedAt: now
  },
  {
    id: "clean",
    name: "clean-transform-info",
    path: "/Users/ddd/D/feiyu/清洁客服/code/clean-transform-info",
    description: "清洁客服资料转换流程，输出 JSONL 批处理结果并对接训练映射。",
    readmeSummary: null,
    techStacks: ["Node.js"],
    status: "experimental",
    tags: toProjectTags([tagPaths.cleanTraining, tagPaths.cli]),
    lastModifiedAt: now,
    source: "scan",
    favorite: false,
    startCommand: "npm run start",
    testCommand: "npm test",
    entryFiles: [],
    descriptionSource: "user",
    startCommandSource: "auto",
    testCommandSource: "auto",
    lastScannedAt: now,
    createdAt: now,
    updatedAt: now
  },
  {
    id: "legacy",
    name: "legacy-client-site",
    path: "/Users/ddd/Archive/client/legacy-client-site",
    description: "历史客户站点记录，当前路径缺失，保留人工备注等待确认。",
    readmeSummary: null,
    techStacks: ["PHP"],
    status: "missing",
    tags: toProjectTags([tagPaths.archived]),
    lastModifiedAt: null,
    source: "manual",
    favorite: false,
    startCommand: null,
    testCommand: null,
    entryFiles: [],
    descriptionSource: "user",
    startCommandSource: "auto",
    testCommandSource: "auto",
    lastScannedAt: now,
    createdAt: now,
    updatedAt: now
  }
];

export const mockApi: AppApi = {
  async listProjects(filters = {}) {
    return filterProjects(projects, filters).map(toListItem);
  },
  async getProject(projectId) {
    const project = projects.find((item) => item.id === projectId);
    if (!project) {
      throw new Error("Project not found");
    }
    return cloneProject(project);
  },
  async updateProject(projectId: string, patch: ProjectUpdatePatch) {
    const index = projects.findIndex((item) => item.id === projectId);
    if (index === -1) {
      throw new Error("Project not found");
    }
    const { tagIds, ...projectPatch } = patch;
    projects[index] = {
      ...projects[index],
      ...projectPatch,
      tags: tagIds === undefined ? projects[index].tags : toProjectTags(unique(tagIds)),
      descriptionSource: patch.description === undefined ? projects[index].descriptionSource : "user",
      startCommandSource: patch.startCommand === undefined ? projects[index].startCommandSource : "user",
      testCommandSource: patch.testCommand === undefined ? projects[index].testCommandSource : "user",
      updatedAt: new Date().toISOString()
    };
    return cloneProject(projects[index]);
  },
  async addManualProject(path) {
    const id = `manual_${Date.now()}`;
    const project: ProjectDetail = {
      id,
      name: path.split("/").filter(Boolean).at(-1) ?? "Manual Project",
      path,
      description: "",
      readmeSummary: null,
      techStacks: [],
      status: "active",
      tags: [],
      lastModifiedAt: null,
      source: "manual",
      favorite: false,
      startCommand: null,
      testCommand: null,
      entryFiles: [],
      descriptionSource: "auto",
      startCommandSource: "auto",
      testCommandSource: "auto",
      lastScannedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    projects = [project, ...projects];
    return cloneProject(project);
  },
  async deleteProject(projectId) {
    projects = projects.filter((item) => item.id !== projectId);
  },
  async listTags() {
    return tags.map((tag) => ({
      ...tag,
      projectCount: projects.filter((project) => project.tags.some((projectTag) => projectTag.id === tag.id)).length
    }));
  },
  async createTag(input: TagCreateInput) {
    return createTag(input);
  },
  async updateTag(id: string, patch: TagUpdatePatch) {
    return updateTag(id, patch);
  },
  async deleteTag(id: string) {
    const target = getTag(id);
    const deletedIds = new Set(tags.filter((tag) => tag.id === id || tag.path.startsWith(`${target.path}/`)).map((tag) => tag.id));
    tags = tags.filter((tag) => !deletedIds.has(tag.id));
    projects = projects.map((project) => ({
      ...project,
      tags: project.tags.filter((tag) => !deletedIds.has(tag.id))
    }));
  },
  async getAiTaggingStatus() {
    return {
      available: true,
      provider: "mock",
      model: "deterministic-local"
    };
  },
  async generateTagSuggestions(input: GenerateTagSuggestionsInput) {
    const project = await mockApi.getProject(input.projectId);
    const suggestions = buildMockSuggestions(project, input.allowNewTags ?? true).slice(0, input.maxSuggestions ?? 5);
    return {
      projectId: project.id,
      suggestions,
      model: "deterministic-local",
      promptPreview: JSON.stringify(
        {
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
          existingTags: tags.map((tag) => ({ id: tag.id, path: tag.path }))
        },
        null,
        2
      ),
      createdAt: new Date().toISOString()
    };
  },
  async applyTagSuggestions(input: ApplyTagSuggestionsInput) {
    const project = await mockApi.getProject(input.projectId);
    const tagIds = new Set(input.mode === "append" ? project.tags.map((tag) => tag.id) : []);
    for (const suggestion of input.suggestions) {
      const tag = suggestion.tagId ? getTag(suggestion.tagId) : findOrCreateTagPath(suggestion.segments);
      tagIds.add(tag.id);
    }
    return mockApi.updateProject(input.projectId, { tagIds: Array.from(tagIds) });
  },
  async listScanRoots() {
    return scanRoots.map((item) => ({ ...item }));
  },
  async addScanRoot(path) {
    const root: ScanRoot = {
      id: `root_${Date.now()}`,
      path,
      enabled: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    scanRoots = [...scanRoots, root];
    return { ...root };
  },
  async updateScanRoot(id: string, patch: ScanRootUpdatePatch) {
    const index = scanRoots.findIndex((root) => root.id === id);
    if (index === -1) {
      throw new Error("Scan root not found");
    }
    scanRoots[index] = { ...scanRoots[index], ...patch, updatedAt: new Date().toISOString() };
    return { ...scanRoots[index] };
  },
  async removeScanRoot(id) {
    scanRoots = scanRoots.filter((root) => root.id !== id);
  },
  async scanAllRoots() {
    return mockSummary();
  },
  async scanRoot() {
    return mockSummary();
  },
  async detectOpenActions(): Promise<OpenActionAvailability[]> {
    return [
      { action: "folder", label: "Folder", available: true },
      { action: "terminal", label: "Terminal", available: true },
      { action: "iterm2", label: "iTerm2", available: false, reason: "iTerm2 is not installed." },
      { action: "vscode", label: "VS Code", available: true },
      { action: "cursor", label: "Cursor", available: true }
    ];
  },
  async openProject() {
    return undefined;
  }
};

function toListItem(project: ProjectDetail): ProjectListItem {
  return {
    id: project.id,
    name: project.name,
    path: project.path,
    description: project.description,
    techStacks: project.techStacks,
    status: project.status,
    tags: project.tags,
    lastModifiedAt: project.lastModifiedAt,
    source: project.source,
    favorite: project.favorite
  };
}

function cloneProject(project: ProjectDetail): ProjectDetail {
  return {
    ...project,
    techStacks: [...project.techStacks],
    tags: project.tags.map((tag) => ({ ...tag })),
    entryFiles: [...project.entryFiles]
  };
}

function filterProjects(items: ProjectDetail[], filters: ProjectFilters): ProjectDetail[] {
  const query = filters.query?.trim().toLowerCase();
  const normalizedPathQuery = query?.replace(/\s*\/\s*/g, "/");
  const allowedTagIds = filters.tagIds?.length ? descendantTagIds(filters.tagIds) : null;
  return items.filter((project) => {
    if (filters.favoriteOnly && !project.favorite) return false;
    if (filters.statuses?.length && !filters.statuses.includes(project.status)) return false;
    if (allowedTagIds && !project.tags.some((tag) => allowedTagIds.has(tag.id))) return false;
    if (query) {
      const haystack = [
        project.name,
        project.path,
        project.description,
        project.readmeSummary,
        project.tags.map((tag) => `${tag.name} ${tag.path}`).join(" "),
        project.techStacks.join(" "),
        project.startCommand
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(query) && (!normalizedPathQuery || !haystack.includes(normalizedPathQuery))) {
        return false;
      }
    }
    return true;
  });
}

function createInitialTagPath(segments: string[]): string {
  return findOrCreateTagPath(segments).id;
}

function findOrCreateTagPath(segments: string[]): TagNode {
  let parentId: string | null = null;
  let current: TagNode | null = null;
  for (const segment of segments) {
    current = tags.find((tag) => tag.parentId === parentId && tag.name === segment) ?? createTag({ name: segment, parentId });
    parentId = current.id;
  }
  if (!current) {
    throw new Error("Tag path is required");
  }
  return current;
}

function createTag(input: TagCreateInput): TagNode {
  const name = normalizeTagName(input.name);
  const parent = input.parentId ? getTag(input.parentId) : null;
  if (tags.some((tag) => tag.parentId === (parent?.id ?? null) && tag.name === name)) {
    throw new Error("A sibling tag with that name already exists.");
  }
  const tag: TagNode = {
    id: tagId(parent ? `${parent.path}/${name}` : name),
    name,
    parentId: parent?.id ?? null,
    path: parent ? `${parent.path}/${name}` : name,
    depth: parent ? parent.depth + 1 : 0,
    projectCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  tags = [...tags, tag].sort((left, right) => left.path.localeCompare(right.path, "zh-CN"));
  return { ...tag };
}

function updateTag(id: string, patch: TagUpdatePatch): TagNode {
  const current = getTag(id);
  const nextParentId = patch.parentId === undefined ? current.parentId : patch.parentId ?? null;
  if (nextParentId === id) {
    throw new Error("A tag cannot be moved under itself.");
  }
  const nextParent = nextParentId ? getTag(nextParentId) : null;
  if (nextParent?.path.startsWith(`${current.path}/`)) {
    throw new Error("A tag cannot be moved under one of its descendants.");
  }
  const nextName = patch.name === undefined ? current.name : normalizeTagName(patch.name);
  if (tags.some((tag) => tag.id !== id && tag.parentId === (nextParent?.id ?? null) && tag.name === nextName)) {
    throw new Error("A sibling tag with that name already exists.");
  }
  const oldPath = current.path;
  const nextPath = nextParent ? `${nextParent.path}/${nextName}` : nextName;
  const updatedAt = new Date().toISOString();
  tags = tags.map((tag) => {
    if (tag.id === id) {
      return {
        ...tag,
        name: nextName,
        parentId: nextParent?.id ?? null,
        path: nextPath,
        depth: nextPath.split("/").length - 1,
        updatedAt
      };
    }
    if (tag.path.startsWith(`${oldPath}/`)) {
      const path = `${nextPath}${tag.path.slice(oldPath.length)}`;
      return {
        ...tag,
        path,
        depth: path.split("/").length - 1,
        updatedAt
      };
    }
    return tag;
  }).sort((left, right) => left.path.localeCompare(right.path, "zh-CN"));
  projects = projects.map((project) => ({
    ...project,
    tags: project.tags.map((projectTag) => toProjectTag(getTag(projectTag.id)))
  }));
  return { ...getTag(id) };
}

function getTag(id: string): TagNode {
  const tag = tags.find((item) => item.id === id);
  if (!tag) {
    throw new Error("Tag not found");
  }
  return tag;
}

function toProjectTags(tagIds: string[]): ProjectTag[] {
  return tagIds.map((tagId) => toProjectTag(getTag(tagId))).sort((left, right) => left.path.localeCompare(right.path, "zh-CN"));
}

function toProjectTag(tag: TagNode): ProjectTag {
  return {
    id: tag.id,
    name: tag.name,
    path: tag.path
  };
}

function descendantTagIds(tagIds: string[]): Set<string> {
  const roots = tagIds.map(getTag);
  return new Set(tags.filter((tag) => roots.some((root) => tag.id === root.id || tag.path.startsWith(`${root.path}/`))).map((tag) => tag.id));
}

function buildMockSuggestions(project: ProjectDetail, allowNewTags: boolean): AiTagSuggestion[] {
  const text = [project.name, project.path, project.description, project.readmeSummary ?? "", project.techStacks.join(" ")]
    .join(" ")
    .toLowerCase();
  const paths: Array<{ segments: string[]; confidence: number; rationale: string; sourceFields: AiTagSuggestion["sourceFields"] }> = [];
  if (/水|water/.test(text)) {
    paths.push({
      segments: ["业务域", "水健康", text.includes("转换") || text.includes("transform") ? "数据转换" : "项目"],
      confidence: 0.91,
      rationale: "项目名称、路径或描述显示它属于水健康业务域。",
      sourceFields: ["name", "path", "description"]
    });
  }
  if (/清洁|clean/.test(text)) {
    paths.push({
      segments: ["业务域", "清洁客服", "训练数据"],
      confidence: 0.86,
      rationale: "项目元数据显示它服务于清洁客服资料流程。",
      sourceFields: ["name", "path", "description"]
    });
  }
  paths.push({
    segments: project.techStacks.some((stack) => /react|vite/i.test(stack)) ? ["项目类型", "Web App"] : ["项目类型", "CLI 工具"],
    confidence: 0.82,
    rationale: "根据技术栈和命令推断项目类型。",
    sourceFields: ["techStacks", "commands"]
  });

  const suggestions: AiTagSuggestion[] = [];
  for (const item of paths) {
    const path = item.segments.join("/");
    const existing = tags.find((tag) => tag.path === path);
    if (!existing && !allowNewTags) {
      continue;
    }
    suggestions.push({
      id: `suggestion_${tagId(path)}`,
      kind: existing ? "existing_tag" : "new_tag_path",
      tagId: existing?.id,
      path,
      segments: item.segments,
      confidence: item.confidence,
      rationale: item.rationale,
      sourceFields: item.sourceFields
    });
  }
  return suggestions;
}

function normalizeTagName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("Tag name is required.");
  }
  if (trimmed.includes("/")) {
    throw new Error("Tag names cannot contain /.");
  }
  return trimmed;
}

function tagId(path: string): string {
  return `tag_${Array.from(path).map((char) => char.charCodeAt(0).toString(36)).join("_")}`;
}

function unique(items: string[]): string[] {
  return Array.from(new Set(items));
}

function mockSummary(): ScanSummary {
  return {
    scannedRoots: scanRoots.filter((root) => root.enabled).length,
    discoveredProjects: projects.length,
    addedProjects: 0,
    updatedProjects: projects.length,
    skippedDirs: 8,
    errors: projects.some((project) => project.status === "missing")
      ? [
          {
            path: "/Users/ddd/Archive/client/legacy-client-site",
            kind: "root_not_found",
            message: "Project path is missing."
          }
        ]
      : []
  };
}
