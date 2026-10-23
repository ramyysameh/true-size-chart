-- CreateTable
CREATE TABLE "AssignmentRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "chartId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "priority" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ShopState" (
    "shop" TEXT NOT NULL PRIMARY KEY,
    "onboardedAt" DATETIME,
    "sizeOptionNames" TEXT NOT NULL DEFAULT 'Size',
    "syncRequestedAt" DATETIME,
    "syncStartedAt" DATETIME,
    "syncFinishedAt" DATETIME,
    "syncError" TEXT,
    "syncCounts" TEXT
);

-- CreateIndex
CREATE INDEX "AssignmentRule_shop_priority_idx" ON "AssignmentRule"("shop", "priority");
