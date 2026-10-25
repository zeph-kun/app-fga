"use client";

import { FolderTree } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { FolderNav } from "./folder-nav";

/** The Folder tree for screens too narrow for the sidebar: a button that opens it in a side panel. */
export function FolderNavSheet(props: React.ComponentProps<typeof FolderNav>) {
  return (
    <Sheet>
      <SheetTrigger render={<Button variant="outline" size="sm" />}>
        <FolderTree aria-hidden />
        Folders
      </SheetTrigger>
      <SheetContent side="left">
        <SheetHeader>
          <SheetTitle>Folders</SheetTitle>
          <SheetDescription>Open a folder, or drop a document on one to move it there.</SheetDescription>
        </SheetHeader>
        <div className="overflow-y-auto px-4 pb-4">
          <FolderNav {...props} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
