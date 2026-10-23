-- CreateTable
CREATE TABLE "comments" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "author_id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "comments_document_id_created_at_idx" ON "comments"("document_id", "created_at");

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
