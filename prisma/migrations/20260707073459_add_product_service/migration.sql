-- CreateEnum
CREATE TYPE "ProductServiceStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "product_services" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "website_analysis_id" TEXT,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "subcategory" TEXT,
    "description" TEXT,
    "applications" TEXT[],
    "target_industries" TEXT[],
    "buyer_types" TEXT[],
    "keywords" TEXT[],
    "source_urls" TEXT[],
    "confidence_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ai_raw_extraction" JSONB,
    "status" "ProductServiceStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "approved_at" TIMESTAMP(3),
    "approved_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_services_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_services_workspace_id_status_idx" ON "product_services"("workspace_id", "status");

-- CreateIndex
CREATE INDEX "product_services_website_analysis_id_idx" ON "product_services"("website_analysis_id");

-- AddForeignKey
ALTER TABLE "product_services" ADD CONSTRAINT "product_services_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_services" ADD CONSTRAINT "product_services_website_analysis_id_fkey" FOREIGN KEY ("website_analysis_id") REFERENCES "website_analyses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_services" ADD CONSTRAINT "product_services_approved_by_user_id_fkey" FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

