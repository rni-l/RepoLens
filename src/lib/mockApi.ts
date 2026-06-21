import type {
  AppApi,
  OpenActionAvailability,
  ProjectDetail,
  ProjectFilters,
  ProjectListItem,
  ProjectUpdatePatch,
  ScanRoot,
  ScanRootUpdatePatch,
  ScanSummary
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

let projects: ProjectDetail[] = [
  {
    id: "water",
    name: "water-product-transform-info",
    path: "/Users/ddd/D/feiyu/水健康-客服/code/water-product-transform-info",
    description: "水健康客服数据转换工具，负责把产品资料转换成训练与知识库需要的结构化结果。",
    readmeSummary: "把水健康产品资料转换为训练、知识库和飞书发布需要的结构化数据。",
    techStacks: ["TypeScript", "Vite", "Feishu"],
    status: "active",
    tags: ["TypeScript", "Vite", "飞书"],
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
    tags: ["Node.js", "React", "PM2"],
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
    tags: ["JSONL", "Node.js"],
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
    tags: ["PHP", "归档"],
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
    return { ...project };
  },
  async updateProject(projectId: string, patch: ProjectUpdatePatch) {
    const index = projects.findIndex((item) => item.id === projectId);
    if (index === -1) {
      throw new Error("Project not found");
    }
    projects[index] = {
      ...projects[index],
      ...patch,
      descriptionSource: patch.description === undefined ? projects[index].descriptionSource : "user",
      startCommandSource: patch.startCommand === undefined ? projects[index].startCommandSource : "user",
      testCommandSource: patch.testCommand === undefined ? projects[index].testCommandSource : "user",
      updatedAt: new Date().toISOString()
    };
    return { ...projects[index] };
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
    return { ...project };
  },
  async deleteProject(projectId) {
    projects = projects.filter((item) => item.id !== projectId);
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

function filterProjects(items: ProjectDetail[], filters: ProjectFilters): ProjectDetail[] {
  const query = filters.query?.trim().toLowerCase();
  return items.filter((project) => {
    if (filters.favoriteOnly && !project.favorite) return false;
    if (filters.statuses?.length && !filters.statuses.includes(project.status)) return false;
    if (query) {
      const haystack = [
        project.name,
        project.path,
        project.description,
        project.readmeSummary,
        project.tags.join(" "),
        project.techStacks.join(" "),
        project.startCommand
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
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
