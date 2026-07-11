-- AlterEnum
BEGIN;
CREATE TYPE "TargetCompanyPriorityGrade_new" AS ENUM ('A+', 'A', 'B', 'C');
ALTER TABLE "target_companies" ALTER COLUMN "priority_grade" TYPE "TargetCompanyPriorityGrade_new" USING ("priority_grade"::text::"TargetCompanyPriorityGrade_new");
ALTER TYPE "TargetCompanyPriorityGrade" RENAME TO "TargetCompanyPriorityGrade_old";
ALTER TYPE "TargetCompanyPriorityGrade_new" RENAME TO "TargetCompanyPriorityGrade";
DROP TYPE "TargetCompanyPriorityGrade_old";
COMMIT;

