"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getToken } from "next-auth/jwt";
import { z } from "zod";
import { signIn, signOut } from "@/auth";
import type { ActionState } from "@/lib/action-state";
import { ApiError, apiGet, apiPost, apiSend, documentSchema, folderSchema, teamSchema } from "@/lib/api";
import type { Subject } from "@/lib/api";

/** What a new document is called until its Owner types a title. */
const UNTITLED = "Untitled";
const idSchema = z.string().uuid();
const nameSchema = z.string().trim().min(1, "Enter a name.").max(200, "200 characters at most.");
const roleSchema = z.enum(["editor", "commenter", "viewer"]);
const messageSchema = z.object({ message: z.string() });
const subjectFormSchema = z.object({
  subjectType: z.enum(["user", "team"]),
  subjectId: z.string().trim().min(1, "Choose who to share with."),
  role: roleSchema,
  // The <select> posts "" for "Never expires".
  expiresInHours: z
    .string()
    .transform((value) => (value === "" ? undefined : Number(value)))
    .pipe(z.number().positive().optional()),
});

/** Turns an API failure into a sentence for the user. */
function describe(error: ApiError): string {
  if (error.status === 403) return "You don't have permission to do this.";
  if (error.status === 404) return "This item no longer exists, or it isn't shared with you.";
  if (error.status === 409 || error.status === 400) {
    try {
      const body = messageSchema.safeParse(JSON.parse(error.message));
      if (body.success) return body.data.message;
    } catch {
      // not JSON: fall through to the generic message
    }
  }
  return "Something went wrong. Try again.";
}

/** Runs an API call; an expected API failure becomes a message, anything else still throws. */
async function run(task: () => Promise<void>, success?: string): Promise<ActionState> {
  try {
    await task();
  } catch (error) {
    if (error instanceof ApiError) return { error: describe(error) };
    throw error;
  }
  return success ? { success } : {};
}

function invalid(error: z.ZodError): ActionState {
  return { error: error.issues[0]?.message ?? "Check the form." };
}

/** Usernames to pick from when sharing, found by the start of the name; an empty list if the search fails. */
export async function suggestUsers(text: string): Promise<string[]> {
  try {
    const path = `/users?q=${encodeURIComponent(z.string().max(100).parse(text))}`;
    return await apiGet(path, z.array(z.string()));
  } catch (error) {
    if (error instanceof ApiError) return [];
    throw error;
  }
}

export async function login(): Promise<void> {
  await signIn("keycloak", { redirectTo: "/" });
}

/** Ends the Auth.js session, then the Keycloak SSO session (OIDC RP-initiated logout). */
export async function logout(): Promise<void> {
  const requestHeaders = await headers();
  const token = await getToken({ req: { headers: requestHeaders }, secret: process.env.AUTH_SECRET });
  await signOut({ redirect: false });

  const logoutUrl = new URL(
    `${z.string().url().parse(process.env.AUTH_KEYCLOAK_ISSUER)}/protocol/openid-connect/logout`,
  );
  const origin = `${requestHeaders.get("x-forwarded-proto") ?? "http"}://${requestHeaders.get("host")}`;
  logoutUrl.searchParams.set("post_logout_redirect_uri", `${origin}/`);
  if (token?.idToken) {
    logoutUrl.searchParams.set("id_token_hint", token.idToken);
  } else {
    // Sessions opened before the id token was kept: Keycloak asks the user to confirm.
    logoutUrl.searchParams.set("client_id", process.env.AUTH_KEYCLOAK_ID ?? "");
  }
  redirect(logoutUrl.toString());
}

// ---- Documents

/** Creates an untitled document (in a folder, or at the root) and opens it with its title ready to type. */
export async function createDocument(folderId: string | null): Promise<ActionState> {
  let id = "";
  const result = await run(async () => {
    const created = await apiPost(
      "/documents",
      { title: UNTITLED, content: "", folderId },
      documentSchema,
    );
    id = created.id;
  });
  if (result.error) return result;
  revalidatePath("/");
  if (folderId) revalidatePath(`/folders/${folderId}`);
  redirect(`/documents/${id}?new=1`);
}

export async function updateDocument(id: string, formData: FormData): Promise<ActionState> {
  const body = z
    .object({ title: nameSchema, content: z.string().max(50_000, "50,000 characters at most.") })
    .safeParse({ title: formData.get("title"), content: formData.get("content") });
  if (!body.success) return invalid(body.error);

  const result = await run(
    () => apiSend("PATCH", `/documents/${idSchema.parse(id)}`, body.data),
    "Changes saved.",
  );
  if (!result.error) revalidatePath(`/documents/${id}`);
  return result;
}

export async function addComment(
  documentId: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const text = z.string().trim().min(1, "Write a comment.").max(2000, "2,000 characters at most.").safeParse(formData.get("text"));
  if (!text.success) return invalid(text.error);

  const result = await run(
    () => apiSend("POST", `/documents/${idSchema.parse(documentId)}/comments`, { text: text.data }),
    "Comment added.",
  );
  if (!result.error) revalidatePath(`/documents/${documentId}`);
  return result;
}

export async function deleteComment(documentId: string, commentId: string): Promise<ActionState> {
  const result = await run(
    () => apiSend("DELETE", `/documents/${idSchema.parse(documentId)}/comments/${idSchema.parse(commentId)}`),
    "Comment deleted.",
  );
  if (!result.error) revalidatePath(`/documents/${documentId}`);
  return result;
}

export async function deleteDocument(id: string): Promise<ActionState> {
  const result = await run(() => apiSend("DELETE", `/documents/${idSchema.parse(id)}`));
  if (result.error) return result;
  revalidatePath("/");
  redirect("/");
}

/** `folderId` null takes the document out of any folder. */
export async function moveDocument(id: string, folderId: string | null): Promise<ActionState> {
  const result = await run(
    () => apiSend("PUT", `/documents/${idSchema.parse(id)}/folder`, { folderId }),
    folderId === null ? "Moved to the root." : "Document moved.",
  );
  if (!result.error) {
    revalidatePath(`/documents/${id}`);
    revalidatePath("/");
  }
  return result;
}

export async function shareDocument(
  id: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return share(`/documents/${idSchema.parse(id)}`, `/documents/${id}`, formData);
}

export async function unshareDocument(id: string, subject: Subject): Promise<ActionState> {
  return unshare(`/documents/${idSchema.parse(id)}`, `/documents/${id}`, subject);
}

// ---- Folders

/** Creates a folder and opens it. */
export async function createFolder(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const name = nameSchema.safeParse(formData.get("name"));
  if (!name.success) return invalid(name.error);

  let id = "";
  const result = await run(async () => {
    id = (await apiPost("/folders", { name: name.data }, folderSchema)).id;
  });
  if (result.error) return result;
  revalidatePath("/");
  redirect(`/folders/${id}`);
}

export async function renameFolder(id: string, formData: FormData): Promise<ActionState> {
  const name = nameSchema.safeParse(formData.get("name"));
  if (!name.success) return invalid(name.error);

  const result = await run(
    () => apiSend("PATCH", `/folders/${idSchema.parse(id)}`, { name: name.data }),
    "Folder renamed.",
  );
  if (!result.error) {
    revalidatePath(`/folders/${id}`);
    revalidatePath("/");
  }
  return result;
}

export async function deleteFolder(id: string): Promise<ActionState> {
  const result = await run(() => apiSend("DELETE", `/folders/${idSchema.parse(id)}`));
  if (result.error) return result;
  revalidatePath("/");
  redirect("/");
}

export async function shareFolder(
  id: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return share(`/folders/${idSchema.parse(id)}`, `/folders/${id}`, formData);
}

export async function unshareFolder(id: string, subject: Subject): Promise<ActionState> {
  return unshare(`/folders/${idSchema.parse(id)}`, `/folders/${id}`, subject);
}

// ---- Teams

/** Creates a team, with its creator as the only member, and opens it. */
export async function createTeam(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const name = nameSchema.safeParse(formData.get("name"));
  if (!name.success) return invalid(name.error);

  let id = "";
  const result = await run(async () => {
    id = (await apiPost("/teams", { name: name.data }, teamSchema)).id;
  });
  if (result.error) return result;
  revalidatePath("/teams");
  redirect(`/teams/${id}`);
}

export async function renameTeam(id: string, formData: FormData): Promise<ActionState> {
  const name = nameSchema.safeParse(formData.get("name"));
  if (!name.success) return invalid(name.error);

  const result = await run(
    () => apiSend("PATCH", `/teams/${idSchema.parse(id)}`, { name: name.data }),
    "Team renamed.",
  );
  if (!result.error) {
    revalidatePath(`/teams/${id}`);
    revalidatePath("/teams");
  }
  return result;
}

export async function deleteTeam(id: string): Promise<ActionState> {
  const result = await run(() => apiSend("DELETE", `/teams/${idSchema.parse(id)}`));
  if (result.error) return result;
  revalidatePath("/teams");
  redirect("/teams");
}

export async function addTeamMember(
  id: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const userId = z.string().trim().min(1, "Enter a username.").safeParse(formData.get("userId"));
  if (!userId.success) return invalid(userId.error);

  const result = await run(
    () => apiSend("POST", `/teams/${idSchema.parse(id)}/members`, { userId: userId.data }),
    `Added ${userId.data} to the team.`,
  );
  if (!result.error) revalidatePath(`/teams/${id}`);
  return result;
}

export async function removeTeamMember(id: string, userId: string): Promise<ActionState> {
  const target = z.string().min(1).parse(userId);
  const result = await run(
    () => apiSend("DELETE", `/teams/${idSchema.parse(id)}/members/${encodeURIComponent(target)}`),
    `Removed ${target} from the team.`,
  );
  if (!result.error) revalidatePath(`/teams/${id}`);
  return result;
}

// ---- Shared by documents and folders

async function share(apiPath: string, pagePath: string, formData: FormData): Promise<ActionState> {
  const body = subjectFormSchema.safeParse({
    subjectType: formData.get("subjectType"),
    subjectId: formData.get("subjectId"),
    role: formData.get("role"),
    expiresInHours: formData.get("expiresInHours"),
  });
  if (!body.success) return invalid(body.error);
  const { subjectType, subjectId, role, expiresInHours } = body.data;

  const result = await run(
    () =>
      apiSend("POST", `${apiPath}/shares`, {
        subject: { type: subjectType, id: subjectId },
        role,
        expiresInHours,
      }),
    subjectType === "user" ? `Shared with ${subjectId}.` : "Shared with the team.",
  );
  if (!result.error) revalidatePath(pagePath);
  return result;
}

async function unshare(apiPath: string, pagePath: string, subject: Subject): Promise<ActionState> {
  const target = subject.type === "user" ? z.string().min(1).parse(subject.id) : idSchema.parse(subject.id);
  const result = await run(
    () => apiSend("DELETE", `${apiPath}/shares/${subject.type}s/${encodeURIComponent(target)}`),
    "Access removed.",
  );
  if (!result.error) revalidatePath(pagePath);
  return result;
}
