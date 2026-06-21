import { useEffect, useState } from "react";
import type { ProjectDetail, ProjectUpdatePatch } from "../lib/types";

type Props = {
  project: ProjectDetail | null;
  onSave(patch: ProjectUpdatePatch): void;
  onCopyPath(path: string): void;
};

export function ProjectDetailPanel({ project, onSave, onCopyPath }: Props) {
  const [description, setDescription] = useState("");
  const [startCommand, setStartCommand] = useState("");
  const [testCommand, setTestCommand] = useState("");
  const [tags, setTags] = useState("");

  useEffect(() => {
    setDescription(project?.description ?? "");
    setStartCommand(project?.startCommand ?? "");
    setTestCommand(project?.testCommand ?? "");
    setTags(project?.tags.join(", ") ?? "");
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
              <span>标签</span>
              <input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="用逗号分隔" />
            </label>
            <div className="tags">
              {project.techStacks.map((stack) => (
                <span className="tag" key={stack}>{stack}</span>
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
                  tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean)
                })
              }
            >
              保存人工字段
            </button>
          </>
        ) : (
          <p className="muted">选择一个项目查看详情。</p>
        )}
      </div>
    </section>
  );
}
