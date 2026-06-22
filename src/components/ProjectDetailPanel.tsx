import { useEffect, useState } from "react";
import type { AiTaggingStatus, ProjectDetail, ProjectUpdatePatch, TagNode } from "../lib/types";
import { AiTagSuggestionPanel } from "./AiTagSuggestionPanel";
import { ProjectTagPicker } from "./ProjectTagPicker";

type Props = {
  project: ProjectDetail | null;
  tags: TagNode[];
  aiStatus: AiTaggingStatus | null;
  onSave(patch: ProjectUpdatePatch): void;
  onCopyPath(path: string): void;
  onSuggestionApplied(project: ProjectDetail): void;
  onError(message: string): void;
};

export function ProjectDetailPanel({
  project,
  tags,
  aiStatus,
  onSave,
  onCopyPath,
  onSuggestionApplied,
  onError
}: Props) {
  const [description, setDescription] = useState("");
  const [startCommand, setStartCommand] = useState("");
  const [testCommand, setTestCommand] = useState("");
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);

  useEffect(() => {
    setDescription(project?.description ?? "");
    setStartCommand(project?.startCommand ?? "");
    setTestCommand(project?.testCommand ?? "");
    setSelectedTagIds(project?.tags.map((tag) => tag.id) ?? []);
  }, [project]);

  return (
    <section className="panel" data-od-id="project-detail">
      <div className="panel-head">
        <h2>项目详情</h2>
        <button className="btn" type="button" disabled={!project} onClick={() => project && onCopyPath(project.path)}>
          复制路径
        </button>
      </div>
      <div className="panel-body">
        {project ? (
          <>
            <div className="detail-title">
              <strong>{project.name}</strong>
              <span className="path">{project.path}</span>
            </div>
            <label className="field">
              <span>描述</span>
              <textarea value={description} onChange={(event) => setDescription(event.target.value)} />
            </label>
            <label className="field">
              <span>启动命令</span>
              <input value={startCommand} onChange={(event) => setStartCommand(event.target.value)} />
            </label>
            <label className="field">
              <span>测试命令</span>
              <input value={testCommand} onChange={(event) => setTestCommand(event.target.value)} />
            </label>
            <label className="field">
              <span>项目标签</span>
              <ProjectTagPicker tags={tags} selectedTagIds={selectedTagIds} onChange={setSelectedTagIds} />
            </label>
            <div className="tags tag-paths">
              {project.tags.map((tag) => (
                <span className="tag" key={tag.id} title={tag.path}>{tag.path.replaceAll("/", " / ")}</span>
              ))}
            </div>
            <div className="tags">
              {project.techStacks.map((stack) => (
                <span className="tag tag-muted" key={stack}>{stack}</span>
              ))}
            </div>
            <button
              className="btn btn-primary"
              type="button"
              onClick={() =>
                onSave({
                  description,
                  startCommand: startCommand.trim() || null,
                  testCommand: testCommand.trim() || null,
                  tagIds: selectedTagIds
                })
              }
            >
              保存人工字段
            </button>
            <AiTagSuggestionPanel
              project={project}
              status={aiStatus}
              onApplied={onSuggestionApplied}
              onError={onError}
            />
          </>
        ) : (
          <p className="muted">选择一个项目查看详情。</p>
        )}
      </div>
    </section>
  );
}
