-- Exchange rates become per-store (they were global, letting one tenant affect another).
-- Pre-existing global rates cannot be assigned to a store and must be re-entered.
DELETE FROM "ExchangeRate";

-- DropIndex
DROP INDEX "ExchangeRate_base_quote_date_key";

-- AlterTable
ALTER TABLE "CampaignDailyMetric" ADD COLUMN     "shopifyFeeOrders" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "shopifyOrderTotals" DECIMAL(18,4) NOT NULL DEFAULT 0,
ADD COLUMN     "shopifyShippingCharged" DECIMAL(18,4) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "ExchangeRate" ADD COLUMN     "storeId" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeRate_storeId_base_quote_date_key" ON "ExchangeRate"("storeId", "base", "quote", "date");

-- AddForeignKey
ALTER TABLE "ExchangeRate" ADD CONSTRAINT "ExchangeRate_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

