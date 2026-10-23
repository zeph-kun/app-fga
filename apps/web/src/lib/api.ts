import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getToken } from "next-auth/jwt";
import { z } from "zod";

const API_URL = process.env.API_URL ?? "http://localhost:4000";

export const documentSchema = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string(),
  ownerId: z.string(),
  folderId: z.string().nullable(),
});

export const folderSchema = z.object({
  id: z.string(),
  name: z.string(),
  ownerId: z.string(),
});

export const subjectSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("user"), id: z.string() }),
  z.object({ type: z.literal("team"), id: z.string() }),
]);

export const shareSchema = z.object({
  subject: subjectSchema,
  name: z.string(),
  role: z.enum(["editor", "viewer"]),
  expiresAt: z.coerce.date().optional(),
});

export const teamSchema = z.object({
  id: z.string(),
  name: z.string(),
  ownerId: z.string(),
});

export const teamViewSchema = teamSchema.extend({
  role: z.enum(["owner", "member"]),
  members: z.array(z.string()),
});

export const folderSummarySchema = folderSchema.extend({
  access: z.enum(["owner", "editor", "viewer"]),
});

export const documentViewSchema = documentSchema.extend({
  access: z.enum(["owner", "editor", "viewer"]),
  /** When the caller's access ends; absent if it never does. */
  accessExpiresAt: z.coerce.date().optional(),
});

export const folderViewSchema = folderSchema.extend({
  access: z.enum(["owner", "editor", "viewer"]),
  documents: z.array(documentSchema),
});

export type Role = z.infer<typeof folderSummarySchema>["access"];
export type Document = z.infer<typeof documentSchema>;
export type Folder = z.infer<typeof folderSchema>;
export type FolderView = z.infer<typeof folderViewSchema>;
export type DocumentView = z.infer<typeof documentViewSchema>;
export type Subject = z.infer<typeof subjectSchema>;
export type Share = z.infer<typeof shareSchema>;
export type Team = z.infer<typeof teamSchema>;
export type TeamView = z.infer<typeof teamViewSchema>;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Reads the Keycloak access token from the encrypted session cookie. */
async function accessToken(): Promise<string> {
  const token = await getToken({
    req: { headers: await headers() },
    secret: process.env.AUTH_SECRET,
  });
  // An expired token means the proxy has not refreshed the cookie yet: go through
  // "/" so the response carries the refreshed cookie instead of calling the API with a stale token.
  const expired = !token?.expiresAt || Date.now() >= token.expiresAt * 1000;
  if (!token?.accessToken || token.error || expired) redirect("/");
  return token.accessToken;
}

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      Authorization: `Bearer ${await accessToken()}`,
    },
  });
  if (response.status === 401) redirect("/");
  if (!response.ok) throw new ApiError(response.status, await response.text());
  return response;
}

export async function apiGet<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  return schema.parse(await (await request(path)).json());
}

/** POST that answers with the created resource. */
export async function apiPost<T>(path: string, body: unknown, schema: z.ZodType<T>): Promise<T> {
  const response = await request(path, { method: "POST", body: JSON.stringify(body) });
  return schema.parse(await response.json());
}

export async function apiSend(
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
): Promise<void> {
  await request(path, { method, ...(body !== undefined && { body: JSON.stringify(body) }) });
}
