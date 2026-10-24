-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ShopState" (
    "shop" TEXT NOT NULL PRIMARY KEY,
    "onboardedAt" DATETIME,
    "sizeOptionNames" TEXT NOT NULL DEFAULT 'Size',
    "syncRequestedAt" DATETIME,
    "syncStartedAt" DATETIME,
    "syncFinishedAt" DATETIME,
    "syncError" TEXT,
    "syncCounts" TEXT,
    "rulesManaged" BOOLEAN NOT NULL DEFAULT false,
    "timezone" TEXT,
    "shopGid" TEXT,
    "installationId" TEXT,
    "planHandle" TEXT,
    "billingPeriod" TEXT,
    "trialEndsAt" DATETIME,
    "entitled" BOOLEAN NOT NULL DEFAULT false,
    "entitlementCheckedAt" DATETIME,
    "entitlementWritten" BOOLEAN
);
INSERT INTO "new_ShopState" ("onboardedAt", "rulesManaged", "shop", "sizeOptionNames", "syncCounts", "syncError", "syncFinishedAt", "syncRequestedAt", "syncStartedAt", "timezone") SELECT "onboardedAt", "rulesManaged", "shop", "sizeOptionNames", "syncCounts", "syncError", "syncFinishedAt", "syncRequestedAt", "syncStartedAt", "timezone" FROM "ShopState";
DROP TABLE "ShopState";
ALTER TABLE "new_ShopState" RENAME TO "ShopState";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
