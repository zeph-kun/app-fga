-- CreateTable
CREATE TABLE "activity_entries" (
    "id" UUID NOT NULL,
    "document_id" UUID,
    "folder_id" UUID,
    "actor_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_entries_pkey" PRIMARY KEY ("id"),
    -- Prisma cannot declare this: an entry is about a Document or a Folder, never both or neither.
    CONSTRAINT "activity_entries_one_resource" CHECK (("document_id" IS NULL) <> ("folder_id" IS NULL))
);

-- CreateIndex
CREATE INDEX "activity_entries_document_id_created_at_idx" ON "activity_entries"("document_id", "created_at");

-- CreateIndex
CREATE INDEX "activity_entries_folder_id_created_at_idx" ON "activity_entries"("folder_id", "created_at");

-- AddForeignKey
ALTER TABLE "activity_entries" ADD CONSTRAINT "activity_entries_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_entries" ADD CONSTRAINT "activity_entries_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "folders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
