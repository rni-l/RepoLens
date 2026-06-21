import type { ProjectStatus } from "../lib/types";

const LABELS: Record<ProjectStatus, string> = {
  active: "活跃",
  archived: "归档",
  experimental: "实验",
  learning: "学习",
  client: "客户",
  missing: "缺失"
};

export function StatusBadge({ status }: { status: ProjectStatus }) {
  return <span className={`status status-${status}`}>{LABELS[status]}</span>;
}
