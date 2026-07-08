-- CreateEnum
CREATE TYPE "TargetCompanyStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "TargetCompanyDuplicateStatus" AS ENUM ('UNIQUE', 'DUPLICATE', 'POSSIBLE_DUPLICATE');

-- CreateEnum
CREATE TYPE "TargetCompanyPriorityGrade" AS ENUM ('A', 'B', 'C', 'D');

-- CreateTable
CREATE TABLE "target_companies" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "company_name" TEXT NOT NULL,
    "website" TEXT,
    "country" TEXT,
    "city_state" TEXT,
    "industry" TEXT,
    "company_description" TEXT,
    "buyer_type" TEXT,
    "matched_product" TEXT,
    "source_url" TEXT,
    "relevance_explanation" TEXT,
    "confidence_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "priority_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "priority_grade" "TargetCompanyPriorityGrade",
    "status" "TargetCompanyStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "duplicate_status" "TargetCompanyDuplicateStatus" NOT NULL DEFAULT 'UNIQUE',
    "last_verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "target_companies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "target_companies_workspace_id_status_idx" ON "target_companies"("workspace_id", "status");

-- CreateIndex
CREATE INDEX "target_companies_workspace_id_priority_grade_idx" ON "target_companies"("workspace_id", "priority_grade");

-- CreateIndex
CREATE INDEX "target_companies_workspace_id_created_at_idx" ON "target_companies"("workspace_id", "created_at");

-- AddForeignKey
ALTER TABLE "target_companies" ADD CONSTRAINT "target_companies_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

