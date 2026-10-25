/** What a Server Action answers to the UI: a message to show, never an exception for an expected failure. */
export interface ActionState {
  readonly error?: string;
  readonly success?: string;
}

/** What creating a Share link answers: the token, to show once, since only its hash is kept. */
export interface ShareLinkActionState extends ActionState {
  readonly token?: string;
}
