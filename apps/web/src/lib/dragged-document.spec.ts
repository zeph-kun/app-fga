import { describe, expect, it } from "vitest";
import { parseDraggedDocument } from "./dragged-document";

const id = "6f1c2f0e-8f3a-4c57-9d1e-2b7a5c0e9a11";
const folderId = "0d4b7c3a-1e2f-4a6b-8c9d-3e5f7a9b1c2d";

describe("parseDraggedDocument", () => {
  it("reads the document and the folder it is dragged from", () => {
    expect(parseDraggedDocument(JSON.stringify({ id, folderId }))).toEqual({ id, folderId });
  });

  it("accepts a document that is in no folder", () => {
    expect(parseDraggedDocument(JSON.stringify({ id, folderId: null }))).toEqual({ id, folderId: null });
  });

  it.each([
    ["text that is not JSON", "not json"],
    ["an empty drag", ""],
    ["JSON of another shape", JSON.stringify(["a", "b"])],
    ["a missing folder", JSON.stringify({ id })],
    ["an id that is not a UUID", JSON.stringify({ id: "doc-1", folderId: null })],
    ["a folder that is not a UUID", JSON.stringify({ id, folderId: "folder-1" })],
    ["a number as id", JSON.stringify({ id: 7, folderId: null })],
  ])("ignores %s", (_name, text) => {
    expect(parseDraggedDocument(text)).toBeUndefined();
  });

  it("keeps only the two fields it needs", () => {
    expect(parseDraggedDocument(JSON.stringify({ id, folderId, title: "Plan" }))).toEqual({ id, folderId });
  });
});
