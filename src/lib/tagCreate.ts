import { api } from "./tauri";
import type { TagNode } from "./types";

export function splitTagPath(path: string): string[] {
  return path
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);
}

/** Finds or creates every level of "父/子/孙", reusing existing nodes; returns the deepest tag. */
export async function createTagPath(path: string, tags: TagNode[]): Promise<TagNode> {
  const segments = splitTagPath(path);
  if (!segments.length) {
    throw new Error("请输入标签名称");
  }
  let parentId: string | null = null;
  let current: TagNode | undefined;
  for (const segment of segments) {
    const levelParentId: string | null = parentId;
    const existing: TagNode | undefined = tags.find((tag) => tag.parentId === levelParentId && tag.name === segment);
    current = existing ?? (await api.createTag({ name: segment, parentId: levelParentId }));
    parentId = current.id;
  }
  return current as TagNode;
}
