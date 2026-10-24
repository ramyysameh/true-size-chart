-- AlterTable
ALTER TABLE "ShopState" ADD COLUMN "timezone" TEXT;

-- CreateTable
CREATE TABLE "EventDaily" (
    "shop" TEXT NOT NULL,
    "chartKey" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "opens" INTEGER NOT NULL DEFAULT 0,
    "completions" INTEGER NOT NULL DEFAULT 0,
    "addToCarts" INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY ("shop", "chartKey", "date")
);

-- CreateTable
CREATE TABLE "EventSizeDaily" (
    "shop" TEXT NOT NULL,
    "chartKey" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "size" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY ("shop", "chartKey", "date", "size")
);
