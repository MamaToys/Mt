-- AlterTable
ALTER TABLE "DailyBusinessMetric" ADD COLUMN     "adLinkedExpenses" DECIMAL(18,4);

-- AlterTable
ALTER TABLE "ShopifyConnection" ADD COLUMN     "initialImportCompletedAt" TIMESTAMP(3),
ADD COLUMN     "productsSyncedAt" TIMESTAMP(3);
