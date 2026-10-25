/** How many levels of Folders there can be; the API enforces it (ADR 0009), this only keeps the lists honest. */
export const MAX_FOLDER_DEPTH = 5;

export interface TreeFolder {
  readonly id: string;
  readonly name: string;
  readonly parentId: string | null;
}

type Leveled<T> = T & { readonly level: number };

/**
 * The Folders as a tree read from the top: each right after its parent, siblings by name, with its
 * level (1 at the top). A Folder whose parent is not in the list counts as being at the top, which is
 * how a User sees one shared without its parent. Folders that sit in each other are left out.
 */
export function inTreeOrder<T extends TreeFolder>(folders: readonly T[]): Leveled<T>[] {
  const known = new Set(folders.map((folder) => folder.id));
  const children = new Map<string | null, T[]>();
  for (const folder of folders) {
    const parent = folder.parentId !== null && known.has(folder.parentId) ? folder.parentId : null;
    children.set(parent, [...(children.get(parent) ?? []), folder]);
  }
  const ordered: Leveled<T>[] = [];
  const walk = (parent: string | null, level: number): void => {
    const siblings = [...(children.get(parent) ?? [])].sort((a, b) => a.name.localeCompare(b.name));
    for (const folder of siblings) {
      ordered.push({ ...folder, level });
      walk(folder.id, level + 1);
    }
  };
  walk(null, 1);
  return ordered;
}

/** The Folders above `id` that are in the list, the highest first. */
export function ancestorsOf<T extends TreeFolder>(folders: readonly T[], id: string): T[] {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const ancestors: T[] = [];
  for (let parent = byId.get(id)?.parentId, hops = 0; parent && hops <= MAX_FOLDER_DEPTH; hops++) {
    const folder = byId.get(parent);
    if (!folder) break;
    ancestors.unshift(folder);
    parent = folder.parentId;
  }
  return ancestors;
}

/**
 * Where a Folder can be moved, as a tree: not into itself or into what it holds, and not so deep that
 * it, with everything in it, would pass the 5 levels. The API decides in the end.
 */
export function moveTargets<T extends TreeFolder>(folders: readonly T[], movingId: string): Leveled<T>[] {
  const children = new Map<string, string[]>();
  for (const folder of folders) {
    if (folder.parentId !== null) children.set(folder.parentId, [...(children.get(folder.parentId) ?? []), folder.id]);
  }
  const within = new Set<string>();
  const height = (id: string): number => {
    if (within.has(id)) return 0;
    within.add(id);
    return 1 + Math.max(0, ...(children.get(id) ?? []).map(height));
  };
  const movingHeight = height(movingId);
  return inTreeOrder(folders).filter((folder) => !within.has(folder.id) && folder.level + movingHeight <= MAX_FOLDER_DEPTH);
}

export interface TreeNode<T extends TreeFolder> {
  readonly folder: T;
  readonly children: TreeNode<T>[];
}

/**
 * The Folders as nested nodes, to be drawn as a tree. Same rules as `inTreeOrder`: siblings by name, a
 * Folder whose parent is not in the list at the top, Folders that sit in each other left out.
 */
export function buildTree<T extends TreeFolder>(folders: readonly T[]): TreeNode<T>[] {
  const known = new Set(folders.map((folder) => folder.id));
  const children = new Map<string | null, T[]>();
  for (const folder of folders) {
    const parent = folder.parentId !== null && known.has(folder.parentId) ? folder.parentId : null;
    children.set(parent, [...(children.get(parent) ?? []), folder]);
  }
  const nodes = (parent: string | null): TreeNode<T>[] =>
    [...(children.get(parent) ?? [])]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((folder) => ({ folder, children: nodes(folder.id) }));
  return nodes(null);
}

/** The ids of the Folders to show open so that the Folder on screen is visible in the tree. */
export function openedFor(folders: readonly TreeFolder[], currentId: string | null): Set<string> {
  return new Set(currentId === null ? [] : ancestorsOf(folders, currentId).map((folder) => folder.id));
}
