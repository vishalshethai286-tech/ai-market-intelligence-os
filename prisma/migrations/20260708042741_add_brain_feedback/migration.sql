-- CreateEnum
CREATE TYPE "BrainFeedbackType" AS ENUM ('GOOD_LEAD', 'BAD_LEAD', 'CORRECT_PRODUCT', 'INCORRECT_PRODUCT', 'GOOD_INDUSTRY', 'BAD_INDUSTRY');

-- CreateTable
CREATE TABLE "brain_feedback" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "brain_id" TEXT NOT NULL,
    "feedback_type" "BrainFeedbackType" NOT NULL,
    "entity_id" TEXT,
    "fact_id" TEXT,
    "subject_label" TEXT,
    "note" TEXT,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "brain_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "brain_feedback_workspace_id_feedback_type_idx" ON "brain_feedback"("workspace_id", "feedback_type");

-- CreateIndex
CREATE INDEX "brain_feedback_brain_id_idx" ON "brain_feedback"("brain_id");

-- CreateIndex
CREATE INDEX "brain_feedback_entity_id_idx" ON "brain_feedback"("entity_id");

-- CreateIndex
CREATE INDEX "brain_feedback_fact_id_idx" ON "brain_feedback"("fact_id");

-- AddForeignKey
ALTER TABLE "brain_feedback" ADD CONSTRAINT "brain_feedback_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brain_feedback" ADD CONSTRAINT "brain_feedback_brain_id_fkey" FOREIGN KEY ("brain_id") REFERENCES "business_brains"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brain_feedback" ADD CONSTRAINT "brain_feedback_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "brain_entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brain_feedback" ADD CONSTRAINT "brain_feedback_fact_id_fkey" FOREIGN KEY ("fact_id") REFERENCES "brain_facts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brain_feedback" ADD CONSTRAINT "brain_feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

