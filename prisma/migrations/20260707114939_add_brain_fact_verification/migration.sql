-- CreateEnum
CREATE TYPE "BrainFactVerificationStatus" AS ENUM ('UNVERIFIED', 'CORRECT', 'INCORRECT', 'NEEDS_REVIEW');

-- AlterEnum
ALTER TYPE "BrainFactType" ADD VALUE 'COMPETITOR';

-- AlterTable
ALTER TABLE "brain_facts" ADD COLUMN     "verification_status" "BrainFactVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
ADD COLUMN     "verified_by_user_id" TEXT;

-- AddForeignKey
ALTER TABLE "brain_facts" ADD CONSTRAINT "brain_facts_verified_by_user_id_fkey" FOREIGN KEY ("verified_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

