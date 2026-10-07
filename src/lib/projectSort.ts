export type ProjectSortKey = "updated" | "created" | "priority";

export type ProjectSortDirection = "asc" | "desc";

export type ProjectSort = {
  key: ProjectSortKey;
  direction: ProjectSortDirection;
};

export type SortableProject = {
  name: string;
  pinned: boolean;
  priority: number;
  createdAt: string | null;
  updatedAt: string | null;
};

export const DEFAULT_PROJECT_SORT: ProjectSort = { key: "updated", direction: "desc" };

/**
 * Pinned projects always come first; pinned and unpinned groups are each ordered by the chosen key.
 * Ties fall through to the other dimensions (priority → last update → name), always high/new first.
 */
export function sortProjects<T extends SortableProject>(projects: T[], sort: ProjectSort): T[] {
  const direction = sort.direction === "asc" ? 1 : -1;
  return [...projects].sort(
    (left, right) =>
      Number(right.pinned) - Number(left.pinned) ||
      direction * compareByKey(sort.key, left, right) ||
      (sort.key === "priority" ? 0 : right.priority - left.priority) ||
      (sort.key === "updated" ? 0 : timeOf(right.updatedAt) - timeOf(left.updatedAt)) ||
      left.name.localeCompare(right.name, "zh-CN")
  );
}

export function parseProjectSort(value: unknown): ProjectSort {
  if (
    value &&
    typeof value === "object" &&
    ["updated", "created", "priority"].includes((value as ProjectSort).key) &&
    ["asc", "desc"].includes((value as ProjectSort).direction)
  ) {
    return { key: (value as ProjectSort).key, direction: (value as ProjectSort).direction };
  }
  return DEFAULT_PROJECT_SORT;
}

function compareByKey(key: ProjectSortKey, left: SortableProject, right: SortableProject): number {
  if (key === "priority") {
    return left.priority - right.priority;
  }
  if (key === "created") {
    return timeOf(left.createdAt) - timeOf(right.createdAt);
  }
  return timeOf(left.updatedAt) - timeOf(right.updatedAt);
}

function timeOf(value: string | null): number {
  const time = value ? Date.parse(value) : Number.NaN;
  return Number.isNaN(time) ? 0 : time;
}
