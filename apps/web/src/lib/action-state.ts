/** What a Server Action answers to the UI: a message to show, never an exception for an expected failure. */
export interface ActionState {
  readonly error?: string;
  readonly success?: string;
}
