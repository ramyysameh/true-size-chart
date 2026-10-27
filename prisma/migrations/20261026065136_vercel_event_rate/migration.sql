-- CreateTable
CREATE TABLE "EventRate" (
    "shop" TEXT NOT NULL,
    "window" INTEGER NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "EventRate_pkey" PRIMARY KEY ("shop","window")
);
