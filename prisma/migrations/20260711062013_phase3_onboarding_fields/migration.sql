-- CreateEnum
CREATE TYPE "ProductServiceType" AS ENUM ('PRODUCT', 'SERVICE');

-- AlterTable
ALTER TABLE "company_profiles" ADD COLUMN     "preferred_customer_types" TEXT[],
ADD COLUMN     "target_countries" TEXT[],
ADD COLUMN     "website" TEXT,
ADD COLUMN     "work_email" TEXT;

-- AlterTable
ALTER TABLE "product_services" ADD COLUMN     "last_verified_at" TIMESTAMP(3),
ADD COLUMN     "project_keywords" TEXT[],
ADD COLUMN     "related_products_services" TEXT[],
ADD COLUMN     "synonyms" TEXT[],
ADD COLUMN     "tender_keywords" TEXT[],
ADD COLUMN     "type" "ProductServiceType" NOT NULL DEFAULT 'PRODUCT',
ADD COLUMN     "vendor_registration_keywords" TEXT[];

-- CreateTable
CREATE TABLE "website_page_snapshots" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "website_analysis_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "category" TEXT,
    "title" TEXT,
    "visible_text" TEXT,
    "http_status" INTEGER,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "website_page_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "website_page_snapshots_workspace_id_idx" ON "website_page_snapshots"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "website_page_snapshots_website_analysis_id_url_key" ON "website_page_snapshots"("website_analysis_id", "url");

-- AddForeignKey
ALTER TABLE "website_page_snapshots" ADD CONSTRAINT "website_page_snapshots_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "website_page_snapshots" ADD CONSTRAINT "website_page_snapshots_website_analysis_id_fkey" FOREIGN KEY ("website_analysis_id") REFERENCES "website_analyses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
