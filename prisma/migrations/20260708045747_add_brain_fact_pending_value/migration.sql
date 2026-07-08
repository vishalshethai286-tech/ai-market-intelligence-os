-- AlterTable
ALTER TABLE "brain_facts" ADD COLUMN     "pending_fact_value" TEXT;

-- AlterTable
ALTER TABLE "brain_update_runs" ADD COLUMN     "facts_flagged" INTEGER NOT NULL DEFAULT 0;

