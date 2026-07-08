-- CreateEnum
CREATE TYPE "SearchQueryCategory" AS ENUM ('TARGET_CUSTOMER', 'BUYER_TYPE', 'INDUSTRY_COMPANY', 'PRODUCT_SERVICE_BUYER', 'COUNTRY_SPECIFIC', 'VENDOR_REGISTRATION', 'PROJECT');

-- CreateTable
CREATE TABLE "search_queries" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "brain_id" TEXT NOT NULL,
    "category" "SearchQueryCategory" NOT NULL,
    "query" TEXT NOT NULL,
    "based_on" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "search_queries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "search_queries_workspace_id_category_idx" ON "search_queries"("workspace_id", "category");

-- CreateIndex
CREATE INDEX "search_queries_brain_id_idx" ON "search_queries"("brain_id");

-- CreateIndex
CREATE UNIQUE INDEX "search_queries_workspace_id_query_key" ON "search_queries"("workspace_id", "query");

-- AddForeignKey
ALTER TABLE "search_queries" ADD CONSTRAINT "search_queries_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_queries" ADD CONSTRAINT "search_queries_brain_id_fkey" FOREIGN KEY ("brain_id") REFERENCES "business_brains"("id") ON DELETE CASCADE ON UPDATE CASCADE;

