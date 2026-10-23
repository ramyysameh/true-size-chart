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
    "rulesManaged" BOOLEAN NOT NULL DEFAULT false
);
INSERT INTO "new_ShopState" ("onboardedAt", "shop", "sizeOptionNames", "syncCounts", "syncError", "syncFinishedAt", "syncRequestedAt", "syncStartedAt") SELECT "onboardedAt", "shop", "sizeOptionNames", "syncCounts", "syncError", "syncFinishedAt", "syncRequestedAt", "syncStartedAt" FROM "ShopState";
DROP TABLE "ShopState";
ALTER TABLE "new_ShopState" RENAME TO "ShopState";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- Shops that already have rules are managed, so deleting their last rule later clears products.
INSERT OR IGNORE INTO "ShopState" ("shop") SELECT DISTINCT "shop" FROM "AssignmentRule";
UPDATE "ShopState" SET "rulesManaged" = true WHERE "shop" IN (SELECT "shop" FROM "AssignmentRule");
