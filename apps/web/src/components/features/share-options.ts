export const ROLE_ITEMS = [
  { value: "viewer", label: "Viewer: can read" },
  { value: "commenter", label: "Commenter: can read and comment" },
  { value: "editor", label: "Editor: can read and edit" },
];

export const EXPIRY_ITEMS = [
  { value: "", label: "Never expires" },
  { value: String(1 / 60), label: "1 minute" },
  { value: "1", label: "1 hour" },
  { value: "24", label: "1 day" },
  { value: "168", label: "1 week" },
  { value: "720", label: "30 days" },
];
