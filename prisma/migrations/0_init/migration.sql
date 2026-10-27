-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssignmentRule" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "chartId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "priority" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssignmentRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopState" (
    "shop" TEXT NOT NULL,
    "onboardedAt" TIMESTAMP(3),
    "sizeOptionNames" TEXT NOT NULL DEFAULT 'Size',
    "syncRequestedAt" TIMESTAMP(3),
    "syncStartedAt" TIMESTAMP(3),
    "syncFinishedAt" TIMESTAMP(3),
    "syncError" TEXT,
    "syncCounts" TEXT,
    "rulesManaged" BOOLEAN NOT NULL DEFAULT false,
    "timezone" TEXT,
    "shopGid" TEXT,
    "installationId" TEXT,
    "planHandle" TEXT,
    "billingPeriod" TEXT,
    "trialEndsAt" TIMESTAMP(3),
    "entitled" BOOLEAN NOT NULL DEFAULT false,
    "entitlementCheckedAt" TIMESTAMP(3),
    "entitlementWritten" BOOLEAN,

    CONSTRAINT "ShopState_pkey" PRIMARY KEY ("shop")
);

-- CreateTable
CREATE TABLE "EventDaily" (
    "shop" TEXT NOT NULL,
    "chartKey" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "opens" INTEGER NOT NULL DEFAULT 0,
    "completions" INTEGER NOT NULL DEFAULT 0,
    "addToCarts" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "EventDaily_pkey" PRIMARY KEY ("shop","chartKey","date")
);

-- CreateTable
CREATE TABLE "EventSizeDaily" (
    "shop" TEXT NOT NULL,
    "chartKey" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "size" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "EventSizeDaily_pkey" PRIMARY KEY ("shop","chartKey","date","size")
);

-- CreateTable
CREATE TABLE "JobLease" (
    "name" TEXT NOT NULL,
    "holder" TEXT NOT NULL,
    "lockedUntil" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobLease_pkey" PRIMARY KEY ("name")
);

-- CreateIndex
CREATE INDEX "AssignmentRule_shop_priority_idx" ON "AssignmentRule"("shop", "priority");
