"use client";

import { Autocomplete } from "@base-ui/react/autocomplete";
import { useEffect, useState } from "react";
import { suggestUsers } from "@/app/actions";
import { cn } from "cn";

const DEBOUNCE_MS = 200;

/** A username field that suggests the people who exist as you type; any text can still be submitted. */
export function UserPicker({
  id,
  name,
  placeholder = "Search a username",
  exclude = [],
}: {
  id: string;
  name: string;
  placeholder?: string;
  /** Usernames not worth suggesting, such as the people already in the team. */
  exclude?: readonly string[];
}) {
  const [text, setText] = useState("");
  const [users, setUsers] = useState<string[]>([]);

  useEffect(() => {
    let current = true;
    const timer = setTimeout(async () => {
      const found = await suggestUsers(text.trim());
      if (current) setUsers(found);
    }, DEBOUNCE_MS);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [text]);

  return (
    <Autocomplete.Root
      items={users.filter((user) => !exclude.includes(user))}
      mode="none"
      value={text}
      onValueChange={setText}
      name={name}
      required
      openOnInputClick
    >
      <Autocomplete.Input
        id={id}
        autoComplete="off"
        placeholder={placeholder}
        className={cn(
          "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30",
        )}
      />
      <Autocomplete.Portal>
        <Autocomplete.Positioner sideOffset={4} className="isolate z-50">
          <Autocomplete.Popup className="max-h-60 w-(--anchor-width) overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 empty:hidden">
            <Autocomplete.Empty className="px-2 py-1.5 text-sm text-muted-foreground empty:hidden">
              No matching user.
            </Autocomplete.Empty>
            <Autocomplete.List>
              {(username: string) => (
                <Autocomplete.Item
                  key={username}
                  value={username}
                  className="cursor-default rounded-md px-2 py-1.5 text-sm outline-none select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                >
                  {username}
                </Autocomplete.Item>
              )}
            </Autocomplete.List>
          </Autocomplete.Popup>
        </Autocomplete.Positioner>
      </Autocomplete.Portal>
    </Autocomplete.Root>
  );
}
