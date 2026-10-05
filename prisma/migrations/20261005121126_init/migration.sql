-- CreateEnum
CREATE TYPE "MemberRole" AS ENUM ('OWNER', 'ADMIN', 'VIEWER');

-- CreateEnum
CREATE TYPE "ShippingCostMode" AS ENUM ('NONE', 'PER_ORDER', 'EQUAL_TO_CHARGED', 'PERCENT_OF_NET_SALES');

-- CreateEnum
CREATE TYPE "BreakEvenMode" AS ENUM ('AUTO', 'MANUAL');

-- CreateEnum
CREATE TYPE "ConnectionStatus" AS ENUM ('PENDING', 'ACTIVE', 'ERROR', 'EXPIRED', 'DISCONNECTED');

-- CreateEnum
CREATE TYPE "CostSource" AS ENUM ('SHOPIFY', 'MANUAL');

-- CreateEnum
CREATE TYPE "InsightLevel" AS ENUM ('ACCOUNT', 'CAMPAIGN', 'ADSET', 'AD');

-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('GOOGLE_ADS', 'TIKTOK_ADS', 'OTHER_ADVERTISING', 'INFLUENCER', 'AGENCY', 'SOFTWARE', 'WAREHOUSE', 'PACKAGING', 'SHIPPING', 'PAYMENT_FEES', 'SALARIES', 'OTHER');

-- CreateEnum
CREATE TYPE "ExpenseType" AS ENUM ('FIXED', 'PERCENTAGE');

-- CreateEnum
CREATE TYPE "ExpenseFrequency" AS ENUM ('ONE_TIME', 'DAILY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "PercentBase" AS ENUM ('NET_SALES', 'GROSS_SALES', 'TOTAL_SALES', 'META_SPEND');

-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('SHOPIFY', 'META', 'SYSTEM');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('RUNNING', 'COMPLETED', 'PARTIAL', 'FAILED');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Store" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "weekStartsOn" INTEGER NOT NULL DEFAULT 1,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Store_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreMember" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "MemberRole" NOT NULL DEFAULT 'OWNER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreSettings" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "paymentFeePercent" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "paymentFeeFixed" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "shippingCostMode" "ShippingCostMode" NOT NULL DEFAULT 'NONE',
    "shippingCostPerOrder" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "shippingCostPercent" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "breakEvenMode" "BreakEvenMode" NOT NULL DEFAULT 'AUTO',
    "manualContributionMargin" DECIMAL(7,4),
    "targetRoas" DECIMAL(10,4),
    "targetCpa" DECIMAL(18,4),
    "targetProfitMargin" DECIMAL(7,4),
    "targetMonthlySales" DECIMAL(18,2),
    "targetMonthlyProfit" DECIMAL(18,2),
    "alertDiscrepancyPct" DECIMAL(7,2) NOT NULL DEFAULT 20,
    "alertCampaignSpendNoPurch" DECIMAL(18,2) NOT NULL DEFAULT 100,
    "alertCampaignDailySpendMax" DECIMAL(18,2),
    "alertCpaIncreasePct" DECIMAL(7,2) NOT NULL DEFAULT 25,
    "alertSalesDeclinePct" DECIMAL(7,2) NOT NULL DEFAULT 20,
    "alertRefundRatePct" DECIMAL(7,2) NOT NULL DEFAULT 10,
    "utmAttributionEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopifyConnection" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "accessTokenEnc" TEXT NOT NULL,
    "scopes" TEXT,
    "status" "ConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
    "shopName" TEXT,
    "shopCurrency" TEXT,
    "shopTimezone" TEXT,
    "historyFrom" DATE,
    "ordersSyncedThrough" TIMESTAMP(3),
    "lastSyncAt" TIMESTAMP(3),
    "lastSuccessfulSyncAt" TIMESTAMP(3),
    "lastError" TEXT,
    "webhooksRegisteredAt" TIMESTAMP(3),
    "syncLockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopifyConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaConnection" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "metaUserId" TEXT,
    "metaUserName" TEXT,
    "accessTokenEnc" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3),
    "status" "ConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastSyncAt" TIMESTAMP(3),
    "lastSuccessfulSyncAt" TIMESTAMP(3),
    "lastError" TEXT,
    "syncLockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopifyOrder" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "orderNumber" INTEGER,
    "name" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL,
    "createdAtShopify" TIMESTAMP(3) NOT NULL,
    "updatedAtShopify" TIMESTAMP(3) NOT NULL,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "closedAt" TIMESTAMP(3),
    "test" BOOLEAN NOT NULL DEFAULT false,
    "financialStatus" TEXT,
    "fulfillmentStatus" TEXT,
    "currency" TEXT NOT NULL,
    "localDate" DATE NOT NULL,
    "localHour" INTEGER NOT NULL,
    "grossSales" DECIMAL(18,4) NOT NULL,
    "totalDiscounts" DECIMAL(18,4) NOT NULL,
    "subtotalPrice" DECIMAL(18,4) NOT NULL,
    "totalShipping" DECIMAL(18,4) NOT NULL,
    "totalTax" DECIMAL(18,4) NOT NULL,
    "totalPrice" DECIMAL(18,4) NOT NULL,
    "totalRefunded" DECIMAL(18,4) NOT NULL,
    "netPayment" DECIMAL(18,4),
    "currentTotalPrice" DECIMAL(18,4),
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "utmTerm" TEXT,
    "utmContent" TEXT,
    "landingPage" TEXT,
    "sourceName" TEXT,
    "attributedCampaignId" TEXT,
    "attributedAdSetId" TEXT,
    "attributedAdId" TEXT,
    "customerHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopifyOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopifyOrderLineItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "productExternalId" TEXT,
    "variantExternalId" TEXT,
    "sku" TEXT,
    "title" TEXT NOT NULL,
    "variantTitle" TEXT,
    "quantity" INTEGER NOT NULL,
    "originalUnitPrice" DECIMAL(18,4) NOT NULL,
    "totalDiscount" DECIMAL(18,4) NOT NULL,
    "shopifyUnitCost" DECIMAL(18,4),
    "isGiftCard" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopifyOrderLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopifyRefund" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL,
    "localDate" DATE NOT NULL,
    "totalRefunded" DECIMAL(18,4) NOT NULL,
    "lineItemsSubtotal" DECIMAL(18,4) NOT NULL,
    "lineItemsTax" DECIMAL(18,4) NOT NULL,
    "shippingRefunded" DECIMAL(18,4) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopifyRefund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopifyRefundLineItem" (
    "id" TEXT NOT NULL,
    "refundId" TEXT NOT NULL,
    "lineItemId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "subtotal" DECIMAL(18,4) NOT NULL,
    "totalTax" DECIMAL(18,4) NOT NULL,
    "restockType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopifyRefundLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopifyProduct" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopifyProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopifyVariant" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "sku" TEXT,
    "title" TEXT NOT NULL,
    "price" DECIMAL(18,4),
    "shopifyUnitCost" DECIMAL(18,4),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopifyVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductCost" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "productExternalId" TEXT,
    "variantExternalId" TEXT,
    "sku" TEXT,
    "title" TEXT,
    "costPerUnit" DECIMAL(18,4) NOT NULL,
    "currency" TEXT NOT NULL,
    "source" "CostSource" NOT NULL DEFAULT 'MANUAL',
    "effectiveFrom" DATE NOT NULL DEFAULT '1970-01-01 00:00:00 +00:00',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductCost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaAdAccount" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "timezone" TEXT,
    "accountStatus" INTEGER,
    "isSelected" BOOLEAN NOT NULL DEFAULT true,
    "insightsFrom" DATE,
    "insightsThrough" DATE,
    "lastInsightsSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaAdAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaCampaign" (
    "id" TEXT NOT NULL,
    "adAccountId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT,
    "effectiveStatus" TEXT,
    "objective" TEXT,
    "dailyBudget" DECIMAL(18,4),
    "lifetimeBudget" DECIMAL(18,4),
    "startTime" TIMESTAMP(3),
    "stopTime" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaAdSet" (
    "id" TEXT NOT NULL,
    "adAccountId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT,
    "effectiveStatus" TEXT,
    "dailyBudget" DECIMAL(18,4),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaAdSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaAd" (
    "id" TEXT NOT NULL,
    "adAccountId" TEXT NOT NULL,
    "adSetId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT,
    "effectiveStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaAd_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaDailyInsight" (
    "id" TEXT NOT NULL,
    "adAccountId" TEXT NOT NULL,
    "level" "InsightLevel" NOT NULL,
    "entityExternalId" TEXT NOT NULL,
    "campaignExternalId" TEXT,
    "adSetExternalId" TEXT,
    "adExternalId" TEXT,
    "date" DATE NOT NULL,
    "currency" TEXT NOT NULL,
    "spend" DECIMAL(18,4) NOT NULL,
    "impressions" BIGINT NOT NULL,
    "reach" BIGINT,
    "frequency" DECIMAL(10,4),
    "clicks" BIGINT NOT NULL,
    "linkClicks" BIGINT,
    "ctr" DECIMAL(10,4),
    "cpc" DECIMAL(18,4),
    "cpm" DECIMAL(18,4),
    "purchases" DECIMAL(18,4),
    "purchaseValue" DECIMAL(18,4),
    "costPerPurchase" DECIMAL(18,4),
    "purchaseActionType" TEXT,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaDailyInsight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "ExpenseCategory" NOT NULL,
    "type" "ExpenseType" NOT NULL,
    "frequency" "ExpenseFrequency" NOT NULL,
    "amount" DECIMAL(18,4),
    "percent" DECIMAL(7,4),
    "percentBase" "PercentBase",
    "currency" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExchangeRate" (
    "id" TEXT NOT NULL,
    "base" TEXT NOT NULL,
    "quote" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "rate" DECIMAL(18,8) NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyBusinessMetric" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "hasShopifyData" BOOLEAN NOT NULL DEFAULT false,
    "hasMetaData" BOOLEAN NOT NULL DEFAULT false,
    "grossSales" DECIMAL(18,4),
    "discounts" DECIMAL(18,4),
    "returns" DECIMAL(18,4),
    "netSales" DECIMAL(18,4),
    "shippingCharged" DECIMAL(18,4),
    "taxes" DECIMAL(18,4),
    "totalSales" DECIMAL(18,4),
    "refundedAmount" DECIMAL(18,4),
    "orders" INTEGER,
    "cancelledOrders" INTEGER,
    "refundedOrders" INTEGER,
    "unitsSold" INTEGER,
    "productCost" DECIMAL(18,4),
    "unitsMissingCost" INTEGER,
    "shippingCost" DECIMAL(18,4),
    "paymentFees" DECIMAL(18,4),
    "otherExpenses" DECIMAL(18,4),
    "variableExpenses" DECIMAL(18,4),
    "metaSpend" DECIMAL(18,4),
    "metaPurchases" DECIMAL(18,4),
    "metaPurchaseValue" DECIMAL(18,4),
    "metaImpressions" BIGINT,
    "metaClicks" BIGINT,
    "metaLinkClicks" BIGINT,
    "metaFxMissing" BOOLEAN NOT NULL DEFAULT false,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyBusinessMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignDailyMetric" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "adAccountExternalId" TEXT NOT NULL,
    "campaignExternalId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "spend" DECIMAL(18,4) NOT NULL,
    "impressions" BIGINT NOT NULL,
    "clicks" BIGINT NOT NULL,
    "linkClicks" BIGINT,
    "purchases" DECIMAL(18,4),
    "purchaseValue" DECIMAL(18,4),
    "shopifyOrders" INTEGER NOT NULL DEFAULT 0,
    "shopifyNetSales" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "shopifyProductCost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "shopifyUnitsMissingCost" INTEGER NOT NULL DEFAULT 0,
    "fxMissing" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignDailyMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductDailyMetric" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "productExternalId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "unitsSold" INTEGER NOT NULL,
    "unitsReturned" INTEGER NOT NULL,
    "grossSales" DECIMAL(18,4) NOT NULL,
    "discounts" DECIMAL(18,4) NOT NULL,
    "returns" DECIMAL(18,4) NOT NULL,
    "netSales" DECIMAL(18,4) NOT NULL,
    "productCost" DECIMAL(18,4) NOT NULL,
    "unitsMissingCost" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductDailyMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncLog" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "syncType" TEXT NOT NULL,
    "trigger" TEXT NOT NULL DEFAULT 'schedule',
    "status" "SyncStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "recordsImported" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "resourceId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIAnalysis" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "question" TEXT,
    "campaignExternalId" TEXT,
    "dateFrom" DATE NOT NULL,
    "dateTo" DATE NOT NULL,
    "input" JSONB NOT NULL,
    "output" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "severity" "AlertSeverity" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "data" JSONB,
    "dismissedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE INDEX "session_userId_idx" ON "session"("userId");

-- CreateIndex
CREATE INDEX "account_userId_idx" ON "account"("userId");

-- CreateIndex
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");

-- CreateIndex
CREATE INDEX "StoreMember_userId_idx" ON "StoreMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "StoreMember_storeId_userId_key" ON "StoreMember"("storeId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "StoreSettings_storeId_key" ON "StoreSettings"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "ShopifyConnection_storeId_key" ON "ShopifyConnection"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "ShopifyConnection_shopDomain_key" ON "ShopifyConnection"("shopDomain");

-- CreateIndex
CREATE UNIQUE INDEX "MetaConnection_storeId_key" ON "MetaConnection"("storeId");

-- CreateIndex
CREATE INDEX "ShopifyOrder_storeId_localDate_idx" ON "ShopifyOrder"("storeId", "localDate");

-- CreateIndex
CREATE INDEX "ShopifyOrder_storeId_updatedAtShopify_idx" ON "ShopifyOrder"("storeId", "updatedAtShopify");

-- CreateIndex
CREATE INDEX "ShopifyOrder_storeId_attributedCampaignId_idx" ON "ShopifyOrder"("storeId", "attributedCampaignId");

-- CreateIndex
CREATE UNIQUE INDEX "ShopifyOrder_storeId_externalId_key" ON "ShopifyOrder"("storeId", "externalId");

-- CreateIndex
CREATE INDEX "ShopifyOrderLineItem_variantExternalId_idx" ON "ShopifyOrderLineItem"("variantExternalId");

-- CreateIndex
CREATE INDEX "ShopifyOrderLineItem_productExternalId_idx" ON "ShopifyOrderLineItem"("productExternalId");

-- CreateIndex
CREATE INDEX "ShopifyOrderLineItem_sku_idx" ON "ShopifyOrderLineItem"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "ShopifyOrderLineItem_orderId_externalId_key" ON "ShopifyOrderLineItem"("orderId", "externalId");

-- CreateIndex
CREATE INDEX "ShopifyRefund_localDate_idx" ON "ShopifyRefund"("localDate");

-- CreateIndex
CREATE UNIQUE INDEX "ShopifyRefund_orderId_externalId_key" ON "ShopifyRefund"("orderId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "ShopifyRefundLineItem_refundId_externalId_key" ON "ShopifyRefundLineItem"("refundId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "ShopifyProduct_storeId_externalId_key" ON "ShopifyProduct"("storeId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "ShopifyVariant_externalId_key" ON "ShopifyVariant"("externalId");

-- CreateIndex
CREATE INDEX "ShopifyVariant_sku_idx" ON "ShopifyVariant"("sku");

-- CreateIndex
CREATE INDEX "ProductCost_storeId_sku_idx" ON "ProductCost"("storeId", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "ProductCost_storeId_variantExternalId_source_effectiveFrom_key" ON "ProductCost"("storeId", "variantExternalId", "source", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "MetaAdAccount_storeId_externalId_key" ON "MetaAdAccount"("storeId", "externalId");

-- CreateIndex
CREATE INDEX "MetaCampaign_externalId_idx" ON "MetaCampaign"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "MetaCampaign_adAccountId_externalId_key" ON "MetaCampaign"("adAccountId", "externalId");

-- CreateIndex
CREATE INDEX "MetaAdSet_externalId_idx" ON "MetaAdSet"("externalId");

-- CreateIndex
CREATE INDEX "MetaAdSet_campaignId_idx" ON "MetaAdSet"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "MetaAdSet_adAccountId_externalId_key" ON "MetaAdSet"("adAccountId", "externalId");

-- CreateIndex
CREATE INDEX "MetaAd_externalId_idx" ON "MetaAd"("externalId");

-- CreateIndex
CREATE INDEX "MetaAd_adSetId_idx" ON "MetaAd"("adSetId");

-- CreateIndex
CREATE UNIQUE INDEX "MetaAd_adAccountId_externalId_key" ON "MetaAd"("adAccountId", "externalId");

-- CreateIndex
CREATE INDEX "MetaDailyInsight_adAccountId_level_date_idx" ON "MetaDailyInsight"("adAccountId", "level", "date");

-- CreateIndex
CREATE INDEX "MetaDailyInsight_campaignExternalId_date_idx" ON "MetaDailyInsight"("campaignExternalId", "date");

-- CreateIndex
CREATE INDEX "MetaDailyInsight_adSetExternalId_date_idx" ON "MetaDailyInsight"("adSetExternalId", "date");

-- CreateIndex
CREATE INDEX "MetaDailyInsight_adExternalId_date_idx" ON "MetaDailyInsight"("adExternalId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "MetaDailyInsight_adAccountId_level_entityExternalId_date_key" ON "MetaDailyInsight"("adAccountId", "level", "entityExternalId", "date");

-- CreateIndex
CREATE INDEX "Expense_storeId_startDate_idx" ON "Expense"("storeId", "startDate");

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeRate_base_quote_date_key" ON "ExchangeRate"("base", "quote", "date");

-- CreateIndex
CREATE INDEX "DailyBusinessMetric_storeId_date_idx" ON "DailyBusinessMetric"("storeId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "DailyBusinessMetric_storeId_date_key" ON "DailyBusinessMetric"("storeId", "date");

-- CreateIndex
CREATE INDEX "CampaignDailyMetric_storeId_date_idx" ON "CampaignDailyMetric"("storeId", "date");

-- CreateIndex
CREATE INDEX "CampaignDailyMetric_campaignExternalId_idx" ON "CampaignDailyMetric"("campaignExternalId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignDailyMetric_storeId_campaignExternalId_date_key" ON "CampaignDailyMetric"("storeId", "campaignExternalId", "date");

-- CreateIndex
CREATE INDEX "ProductDailyMetric_storeId_date_idx" ON "ProductDailyMetric"("storeId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "ProductDailyMetric_storeId_productExternalId_date_key" ON "ProductDailyMetric"("storeId", "productExternalId", "date");

-- CreateIndex
CREATE INDEX "SyncLog_storeId_startedAt_idx" ON "SyncLog"("storeId", "startedAt");

-- CreateIndex
CREATE INDEX "SyncLog_storeId_platform_status_idx" ON "SyncLog"("storeId", "platform", "status");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_externalId_key" ON "WebhookEvent"("externalId");

-- CreateIndex
CREATE INDEX "WebhookEvent_storeId_receivedAt_idx" ON "WebhookEvent"("storeId", "receivedAt");

-- CreateIndex
CREATE INDEX "AIAnalysis_storeId_kind_createdAt_idx" ON "AIAnalysis"("storeId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "Alert_storeId_date_idx" ON "Alert"("storeId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Alert_storeId_type_key_key" ON "Alert"("storeId", "type", "key");

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreMember" ADD CONSTRAINT "StoreMember_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreMember" ADD CONSTRAINT "StoreMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreSettings" ADD CONSTRAINT "StoreSettings_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopifyConnection" ADD CONSTRAINT "ShopifyConnection_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaConnection" ADD CONSTRAINT "MetaConnection_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopifyOrder" ADD CONSTRAINT "ShopifyOrder_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopifyOrderLineItem" ADD CONSTRAINT "ShopifyOrderLineItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ShopifyOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopifyRefund" ADD CONSTRAINT "ShopifyRefund_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ShopifyOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopifyRefundLineItem" ADD CONSTRAINT "ShopifyRefundLineItem_refundId_fkey" FOREIGN KEY ("refundId") REFERENCES "ShopifyRefund"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopifyRefundLineItem" ADD CONSTRAINT "ShopifyRefundLineItem_lineItemId_fkey" FOREIGN KEY ("lineItemId") REFERENCES "ShopifyOrderLineItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopifyProduct" ADD CONSTRAINT "ShopifyProduct_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopifyVariant" ADD CONSTRAINT "ShopifyVariant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "ShopifyProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCost" ADD CONSTRAINT "ProductCost_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaAdAccount" ADD CONSTRAINT "MetaAdAccount_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaCampaign" ADD CONSTRAINT "MetaCampaign_adAccountId_fkey" FOREIGN KEY ("adAccountId") REFERENCES "MetaAdAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaAdSet" ADD CONSTRAINT "MetaAdSet_adAccountId_fkey" FOREIGN KEY ("adAccountId") REFERENCES "MetaAdAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaAdSet" ADD CONSTRAINT "MetaAdSet_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "MetaCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaAd" ADD CONSTRAINT "MetaAd_adAccountId_fkey" FOREIGN KEY ("adAccountId") REFERENCES "MetaAdAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaAd" ADD CONSTRAINT "MetaAd_adSetId_fkey" FOREIGN KEY ("adSetId") REFERENCES "MetaAdSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaDailyInsight" ADD CONSTRAINT "MetaDailyInsight_adAccountId_fkey" FOREIGN KEY ("adAccountId") REFERENCES "MetaAdAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyBusinessMetric" ADD CONSTRAINT "DailyBusinessMetric_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignDailyMetric" ADD CONSTRAINT "CampaignDailyMetric_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductDailyMetric" ADD CONSTRAINT "ProductDailyMetric_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncLog" ADD CONSTRAINT "SyncLog_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookEvent" ADD CONSTRAINT "WebhookEvent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIAnalysis" ADD CONSTRAINT "AIAnalysis_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
