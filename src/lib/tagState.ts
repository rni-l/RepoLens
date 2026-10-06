export function pruneSelectedTagIds(selectedTagIds: string[], validTagIds: Iterable<string>): string[] {
  if (selectedTagIds.length === 0) {
    return selectedTagIds;
  }

  const valid = new Set(validTagIds);
  const next = selectedTagIds.filter((tagId) => valid.has(tagId));
  return next.length === selectedTagIds.length ? selectedTagIds : next;
}

export type SortableTagNode = {
  id: string;
  parentId: string | null;
  path: string;
  sortOrder: number;
};

export function orderTagsForTree<T extends SortableTagNode>(tags: T[]): T[] {
  const byParent = new Map<string, T[]>();
  for (const tag of tags) {
    const key = tag.parentId ?? "";
    byParent.set(key, [...(byParent.get(key) ?? []), tag]);
  }

  for (const siblings of byParent.values()) {
    siblings.sort(compareTagsForTree);
  }

  const ordered: T[] = [];
  const append = (parentId: string | null) => {
    for (const tag of byParent.get(parentId ?? "") ?? []) {
      ordered.push(tag);
      append(tag.id);
    }
  };
  append(null);
  return ordered;
}

function compareTagsForTree(left: SortableTagNode, right: SortableTagNode): number {
  const order = left.sortOrder - right.sortOrder;
  if (order !== 0) {
    return order;
  }
  return left.path.localeCompare(right.path, "zh-CN");
}
