import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import type { AiTagProjectPayload, AiTagProvider } from "../src/backend/aiTagProvider.js";
import { OpenAiCompatibleTagProvider } from "../src/backend/openAiCompatibleTagProvider.js";
import { RepoLensService } from "../src/backend/appService.js";
import { RepoLensDatabase } from "../src/backend/database.js";
import { RepoLensError } from "../src/backend/errors.js";
import { idFromPath } from "../src/backend/pathUtils.js";

test("generates validated suggestions from stored project metadata only", async () => {
  const { database, project } = await createService();
  const capturedPayloads: AiTagProjectPayload[] = [];
  const provider: AiTagProvider = {
    name: "fake",
    model: "fake-model",
    async generateTagSuggestions(payload) {
      capturedPayloads.push(payload);
      return {
        suggestions: [
          {
            segments: ["业务域", "水健康", "数据转换"],
            confidence: 1.4,
            rationale: "Matches the project description.",
            sourceFields: ["name", "description"]
          }
        ]
      };
    }
  };
  const serviceWithProvider = new RepoLensService(database, { aiProvider: provider });

  const result = await serviceWithProvider.generateTagSuggestions({ projectId: project.id, maxSuggestions: 5 });

  assert.equal(result.model, "fake-model");
  assert.equal(result.suggestions[0].confidence, 1);
  assert.equal(result.suggestions[0].kind, "new_tag_path");
  assert.equal(result.suggestions[0].path, "业务域/水健康/数据转换");
  assert.deepEqual(capturedPayloads[0].project.entryFiles, ["src/main.ts"]);
  assert.equal(JSON.stringify(capturedPayloads[0]).includes("SECRET_SOURCE_CONTENT"), false);
  serviceWithProvider.close();
});

test("invalid AI output fails without mutating tags", async () => {
  const { service, project } = await createService({
    async generateTagSuggestions() {
      return { suggestions: [{ segments: ["bad/path"], confidence: 0.8, sourceFields: ["name"] }] };
    }
  });

  await assert.rejects(
    () => service.generateTagSuggestions({ projectId: project.id }),
    (error: unknown) => error instanceof RepoLensError && error.code === "ai_invalid_response"
  );
  assert.deepEqual((await service.listTags()).map((tag) => tag.path), []);
  service.close();
});

test("applying suggestions reuses existing tags and creates missing paths", async () => {
  const { service, project } = await createService();
  const root = await service.createTag({ name: "项目类型" });
  const cli = await service.createTag({ name: "CLI 工具", parentId: root.id });

  const updated = await service.applyTagSuggestions({
    projectId: project.id,
    mode: "append",
    suggestions: [
      { tagId: cli.id, segments: ["项目类型", "CLI 工具"] },
      { segments: ["业务域", "水健康", "数据转换"] },
      { segments: ["业务域", "水健康", "数据转换"] }
    ]
  });

  assert.deepEqual(updated.tags.map((tag) => tag.path), ["项目类型/CLI 工具", "业务域/水健康/数据转换"]);
  assert.deepEqual((await service.listTags()).map((tag) => tag.path), [
    "项目类型",
    "项目类型/CLI 工具",
    "业务域",
    "业务域/水健康",
    "业务域/水健康/数据转换"
  ]);
  service.close();
});

test("applying suggestions in replace mode replaces existing project tags", async () => {
  const { service, project } = await createService();
  const status = await service.createTag({ name: "维护状态" });
  const frequent = await service.createTag({ name: "高频使用", parentId: status.id });
  await service.updateProject(project.id, { tagIds: [frequent.id] });

  const replaced = await service.applyTagSuggestions({
    projectId: project.id,
    mode: "replace",
    suggestions: [{ segments: ["项目类型", "Web App"] }]
  });

  assert.deepEqual(replaced.tags.map((tag) => tag.path), ["项目类型/Web App"]);
  service.close();
});

test("OpenAI-compatible provider parses JSON responses without storing secrets", async () => {
  const provider = new OpenAiCompatibleTagProvider({
    apiKey: "test-key",
    baseUrl: "https://example.test/v1",
    model: "test-model",
    fetchImpl: async (_input, init) => {
      assert.equal(init.headers.authorization, "Bearer test-key");
      const body = JSON.parse(init.body) as { messages: Array<{ content: string }> };
      assert.equal(body.messages[1].content.includes("test-key"), false);
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    suggestions: [
                      {
                        segments: ["维护状态", "待整理"],
                        confidence: 0.6,
                        rationale: "Sparse metadata.",
                        sourceFields: ["name"]
                      }
                    ]
                  })
                }
              }
            ]
          });
        }
      };
    }
  });

  const output = await provider.generateTagSuggestions({
    project: {
      name: "demo",
      path: "/tmp/demo",
      description: "",
      readmeSummary: null,
      techStacks: [],
      startCommand: null,
      testCommand: null,
      entryFiles: []
    },
    existingTags: []
  });

  assert.deepEqual(output, {
    suggestions: [
      {
        segments: ["维护状态", "待整理"],
        confidence: 0.6,
        rationale: "Sparse metadata.",
        sourceFields: ["name"]
      }
    ]
  });
});

async function createService(provider?: Pick<AiTagProvider, "generateTagSuggestions">) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "repolens-ai-tags-"));
  const database = new RepoLensDatabase(path.join(tempDir, "index.sqlite"));
  const project = database.upsertProject({
    id: idFromPath("project", path.join(tempDir, "water-tool")),
    name: "water-tool",
    path: path.join(tempDir, "water-tool"),
    source: "scan",
    status: "active",
    description: "Water business data converter.",
    readmeSummary: "README summary, not source code.",
    techStacks: ["TypeScript"],
    startCommand: "npm run dev",
    testCommand: "npm test",
    entryFiles: ["src/main.ts"],
    lastModifiedAt: null,
    lastScannedAt: new Date().toISOString()
  }).project;
  const service = new RepoLensService(database, {
    aiProvider: provider
      ? {
          name: "fake",
          model: "fake-model",
          generateTagSuggestions: provider.generateTagSuggestions
        }
      : null
  });
  return { service, database, project };
}
