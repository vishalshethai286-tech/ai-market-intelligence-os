-- CreateEnum
CREATE TYPE "BusinessBrainStatus" AS ENUM ('INITIALIZING', 'ACTIVE', 'STALE');

-- CreateEnum
CREATE TYPE "BrainFactType" AS ENUM ('COMPANY_NAME', 'BUSINESS_DESCRIPTION', 'INDUSTRY', 'BUSINESS_MODEL', 'HEADQUARTERS', 'COUNTRY_SERVED', 'OPERATION_TYPE', 'CERTIFICATION', 'PRODUCT_OR_SERVICE', 'TARGET_INDUSTRY', 'BUYER_TYPE', 'KEYWORD', 'CONTACT_INFO', 'FINANCIAL', 'LEADERSHIP', 'OTHER');

-- CreateEnum
CREATE TYPE "BrainEntityType" AS ENUM ('ORGANIZATION', 'PERSON', 'PRODUCT', 'LOCATION', 'CERTIFICATION', 'INDUSTRY', 'OTHER');

-- CreateEnum
CREATE TYPE "BrainSourceType" AS ENUM ('WEBSITE_PAGE', 'DOCUMENT', 'MANUAL_ENTRY', 'THIRD_PARTY_API', 'OTHER');

-- CreateEnum
CREATE TYPE "BrainUpdateRunStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "BrainUpdateTrigger" AS ENUM ('ONBOARDING', 'MANUAL', 'SCHEDULED', 'WEBSITE_ANALYSIS');

-- CreateTable
CREATE TABLE "business_brains" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "status" "BusinessBrainStatus" NOT NULL DEFAULT 'INITIALIZING',
    "last_updated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_brains_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brain_sources" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "brain_id" TEXT NOT NULL,
    "website_analysis_id" TEXT,
    "source_type" "BrainSourceType" NOT NULL DEFAULT 'WEBSITE_PAGE',
    "url" TEXT,
    "title" TEXT,
    "fetched_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brain_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brain_entities" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "brain_id" TEXT NOT NULL,
    "entity_type" "BrainEntityType" NOT NULL DEFAULT 'OTHER',
    "name" TEXT NOT NULL,
    "description" TEXT,
    "confidence_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brain_entities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brain_relationships" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "brain_id" TEXT NOT NULL,
    "source_id" TEXT,
    "from_entity_id" TEXT NOT NULL,
    "to_entity_id" TEXT NOT NULL,
    "relationship_type" TEXT NOT NULL,
    "confidence_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brain_relationships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brain_facts" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "brain_id" TEXT NOT NULL,
    "source_id" TEXT,
    "entity_id" TEXT,
    "fact_type" "BrainFactType" NOT NULL,
    "fact_value" TEXT NOT NULL,
    "source_url" TEXT,
    "confidence_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "last_verified_at" TIMESTAMP(3),
    "freshness_score" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brain_facts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brain_update_runs" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "brain_id" TEXT NOT NULL,
    "status" "BrainUpdateRunStatus" NOT NULL DEFAULT 'PENDING',
    "trigger" "BrainUpdateTrigger" NOT NULL DEFAULT 'MANUAL',
    "facts_created" INTEGER NOT NULL DEFAULT 0,
    "facts_updated" INTEGER NOT NULL DEFAULT 0,
    "facts_expired" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "triggered_by_user_id" TEXT,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brain_update_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "business_brains_workspace_id_key" ON "business_brains"("workspace_id");

-- CreateIndex
CREATE INDEX "business_brains_status_idx" ON "business_brains"("status");

-- CreateIndex
CREATE INDEX "brain_sources_workspace_id_idx" ON "brain_sources"("workspace_id");

-- CreateIndex
CREATE INDEX "brain_sources_brain_id_idx" ON "brain_sources"("brain_id");

-- CreateIndex
CREATE INDEX "brain_sources_website_analysis_id_idx" ON "brain_sources"("website_analysis_id");

-- CreateIndex
CREATE INDEX "brain_entities_workspace_id_entity_type_idx" ON "brain_entities"("workspace_id", "entity_type");

-- CreateIndex
CREATE INDEX "brain_entities_brain_id_idx" ON "brain_entities"("brain_id");

-- CreateIndex
CREATE INDEX "brain_relationships_workspace_id_idx" ON "brain_relationships"("workspace_id");

-- CreateIndex
CREATE INDEX "brain_relationships_brain_id_idx" ON "brain_relationships"("brain_id");

-- CreateIndex
CREATE INDEX "brain_relationships_from_entity_id_idx" ON "brain_relationships"("from_entity_id");

-- CreateIndex
CREATE INDEX "brain_relationships_to_entity_id_idx" ON "brain_relationships"("to_entity_id");

-- CreateIndex
CREATE INDEX "brain_facts_workspace_id_fact_type_idx" ON "brain_facts"("workspace_id", "fact_type");

-- CreateIndex
CREATE INDEX "brain_facts_brain_id_idx" ON "brain_facts"("brain_id");

-- CreateIndex
CREATE INDEX "brain_facts_source_id_idx" ON "brain_facts"("source_id");

-- CreateIndex
CREATE INDEX "brain_facts_entity_id_idx" ON "brain_facts"("entity_id");

-- CreateIndex
CREATE INDEX "brain_update_runs_workspace_id_created_at_idx" ON "brain_update_runs"("workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "brain_update_runs_brain_id_idx" ON "brain_update_runs"("brain_id");

-- CreateIndex
CREATE INDEX "brain_update_runs_status_idx" ON "brain_update_runs"("status");

-- AddForeignKey
ALTER TABLE "business_brains" ADD CONSTRAINT "business_brains_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brain_sources" ADD CONSTRAINT "brain_sources_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brain_sources" ADD CONSTRAINT "brain_sources_brain_id_fkey" FOREIGN KEY ("brain_id") REFERENCES "business_brains"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brain_sources" ADD CONSTRAINT "brain_sources_website_analysis_id_fkey" FOREIGN KEY ("website_analysis_id") REFERENCES "website_analyses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brain_entities" ADD CONSTRAINT "brain_entities_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brain_entities" ADD CONSTRAINT "brain_entities_brain_id_fkey" FOREIGN KEY ("brain_id") REFERENCES "business_brains"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brain_relationships" ADD CONSTRAINT "brain_relationships_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brain_relationships" ADD CONSTRAINT "brain_relationships_brain_id_fkey" FOREIGN KEY ("brain_id") REFERENCES "business_brains"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brain_relationships" ADD CONSTRAINT "brain_relationships_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "brain_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brain_relationships" ADD CONSTRAINT "brain_relationships_from_entity_id_fkey" FOREIGN KEY ("from_entity_id") REFERENCES "brain_entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brain_relationships" ADD CONSTRAINT "brain_relationships_to_entity_id_fkey" FOREIGN KEY ("to_entity_id") REFERENCES "brain_entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brain_facts" ADD CONSTRAINT "brain_facts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brain_facts" ADD CONSTRAINT "brain_facts_brain_id_fkey" FOREIGN KEY ("brain_id") REFERENCES "business_brains"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brain_facts" ADD CONSTRAINT "brain_facts_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "brain_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brain_facts" ADD CONSTRAINT "brain_facts_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "brain_entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brain_update_runs" ADD CONSTRAINT "brain_update_runs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brain_update_runs" ADD CONSTRAINT "brain_update_runs_brain_id_fkey" FOREIGN KEY ("brain_id") REFERENCES "business_brains"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brain_update_runs" ADD CONSTRAINT "brain_update_runs_triggered_by_user_id_fkey" FOREIGN KEY ("triggered_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

