-- CreateTable
CREATE TABLE "share_links" (
    "id" UUID NOT NULL,
    "document_id" UUID,
    "folder_id" UUID,
    "role" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "token_suffix" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),

    CONSTRAINT "share_links_pkey" PRIMARY KEY ("id"),
    -- Prisma cannot declare this: a link points to a Document or to a Folder, never both or neither.
    CONSTRAINT "share_links_one_resource" CHECK (("document_id" IS NULL) <> ("folder_id" IS NULL))
);

-- CreateIndex
CREATE UNIQUE INDEX "share_links_token_hash_key" ON "share_links"("token_hash");

-- CreateIndex
CREATE INDEX "share_links_document_id_created_at_idx" ON "share_links"("document_id", "created_at");

-- CreateIndex
CREATE INDEX "share_links_folder_id_created_at_idx" ON "share_links"("folder_id", "created_at");

-- AddForeignKey
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "folders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
