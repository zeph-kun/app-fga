import { describe, expect, it } from "vitest";
import { ancestorsOf, inTreeOrder, moveTargets } from "./folder-tree";

const f = (id: string, parentId: string | null, name = id) => ({ id, name, parentId });

describe("inTreeOrder", () => {
  it("lists each Folder right after its parent, with its level, siblings by name", () => {
    const folders = [f("c", "a", "Zeta"), f("b", null, "Beta"), f("a", null, "Alpha"), f("d", "a", "Gamma"), f("e", "d", "Deep")];

    expect(inTreeOrder(folders).map((x) => [x.id, x.level])).toEqual([
      ["a", 1],
      ["d", 2],
      ["e", 3],
      ["c", 2],
      ["b", 1],
    ]);
  });

  it("puts a Folder whose parent is not in the list at the top", () => {
    expect(inTreeOrder([f("x", "unseen")]).map((x) => [x.id, x.level])).toEqual([["x", 1]]);
  });

  it("does not loop forever on Folders that sit in each other", () => {
    expect(inTreeOrder([f("a", "b"), f("b", "a")])).toEqual([]);
  });
});

describe("ancestorsOf", () => {
  const folders = [f("a", null), f("b", "a"), f("c", "b"), f("z", null)];

  it("gives the Folders above, the highest first", () => {
    expect(ancestorsOf(folders, "c").map((x) => x.id)).toEqual(["a", "b"]);
    expect(ancestorsOf(folders, "a")).toEqual([]);
  });

  it("stops at a parent that is not in the list", () => {
    expect(ancestorsOf([f("b", "a"), f("c", "b")], "c").map((x) => x.id)).toEqual(["b"]);
  });
});

describe("moveTargets", () => {
  it("leaves out the Folder itself and everything in it", () => {
    const folders = [f("a", null), f("b", "a"), f("c", "b"), f("d", null)];

    expect(moveTargets(folders, "b").map((x) => x.id)).toEqual(["a", "d"]);
  });

  it("leaves out the Folders that would make the tree deeper than 5 levels, counting what is in the moved Folder", () => {
    const chain = [f("l1", null), f("l2", "l1"), f("l3", "l2"), f("l4", "l3"), f("l5", "l4")];
    const alone = f("alone", null);
    const withChild = [f("tall", null), f("tall-child", "tall")];

    // alone is one level high: it fits under levels 1 to 4.
    expect(moveTargets([...chain, alone], "alone").map((x) => x.id)).toEqual(["l1", "l2", "l3", "l4"]);
    // tall is two levels high: it fits under levels 1 to 3.
    expect(moveTargets([...chain, ...withChild], "tall").map((x) => x.id)).toEqual(["l1", "l2", "l3"]);
  });

  it("keeps the order and the levels of the tree", () => {
    const targets = moveTargets([f("a", null), f("b", "a"), f("m", null)], "m");

    expect(targets.map((x) => [x.id, x.level])).toEqual([
      ["a", 1],
      ["b", 2],
    ]);
  });
});
