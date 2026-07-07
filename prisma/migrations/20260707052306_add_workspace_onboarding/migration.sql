-- CreateEnum
CREATE TYPE "OnboardingStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED');

-- CreateTable
CREATE TABLE "workspace_onboarding" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "company_website" TEXT,
    "work_email" TEXT,
    "target_countries" TEXT[],
    "customer_types" TEXT[],
    "status" "OnboardingStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "current_step" INTEGER NOT NULL DEFAULT 1,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspace_onboarding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "workspace_onboarding_workspace_id_key" ON "workspace_onboarding"("workspace_id");

-- CreateIndex
CREATE INDEX "workspace_onboarding_status_idx" ON "workspace_onboarding"("status");

-- AddForeignKey
ALTER TABLE "workspace_onboarding" ADD CONSTRAINT "workspace_onboarding_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

