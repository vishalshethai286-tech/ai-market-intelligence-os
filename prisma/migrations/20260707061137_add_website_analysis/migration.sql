-- CreateEnum
CREATE TYPE "WebsiteAnalysisStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "website_analyses" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "status" "WebsiteAnalysisStatus" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "http_status" INTEGER,
    "robots_allowed" BOOLEAN,
    "title" TEXT,
    "meta_description" TEXT,
    "headings" JSONB,
    "visible_text" TEXT,
    "internal_links" JSONB,
    "identified_pages" JSONB,
    "raw_result" JSONB,
    "fetched_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "website_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "website_analyses_workspace_id_created_at_idx" ON "website_analyses"("workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "website_analyses_status_idx" ON "website_analyses"("status");

-- AddForeignKey
ALTER TABLE "website_analyses" ADD CONSTRAINT "website_analyses_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

