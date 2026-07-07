-- CreateEnum
CREATE TYPE "CompanyProfileStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED');

-- CreateEnum
CREATE TYPE "CompanyOperationType" AS ENUM ('MANUFACTURER', 'TRADER', 'SERVICE_PROVIDER', 'OTHER', 'UNKNOWN');

-- CreateTable
CREATE TABLE "company_profiles" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "website_analysis_id" TEXT,
    "company_name" TEXT,
    "business_description" TEXT,
    "industry" TEXT,
    "business_model" TEXT,
    "countries_served" TEXT[],
    "headquarters" TEXT,
    "operation_type" "CompanyOperationType" NOT NULL DEFAULT 'UNKNOWN',
    "certifications" TEXT[],
    "key_products_services" TEXT[],
    "confidence_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "source_urls" TEXT[],
    "ai_raw_extraction" JSONB,
    "status" "CompanyProfileStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "approved_at" TIMESTAMP(3),
    "approved_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "company_profiles_workspace_id_key" ON "company_profiles"("workspace_id");

-- CreateIndex
CREATE INDEX "company_profiles_status_idx" ON "company_profiles"("status");

-- CreateIndex
CREATE INDEX "company_profiles_website_analysis_id_idx" ON "company_profiles"("website_analysis_id");

-- AddForeignKey
ALTER TABLE "company_profiles" ADD CONSTRAINT "company_profiles_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_profiles" ADD CONSTRAINT "company_profiles_website_analysis_id_fkey" FOREIGN KEY ("website_analysis_id") REFERENCES "website_analyses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_profiles" ADD CONSTRAINT "company_profiles_approved_by_user_id_fkey" FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

