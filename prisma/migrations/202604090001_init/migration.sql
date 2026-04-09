-- CreateTable
CREATE TABLE "GoogleConnection" (
    "id" TEXT NOT NULL,
    "googleUserId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "picture" TEXT,
    "encryptedAccess" TEXT NOT NULL,
    "encryptedRefresh" TEXT,
    "tokenExpiry" TIMESTAMP(3),
    "scope" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoogleConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GscProperty" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "siteUrl" TEXT NOT NULL,
    "permissionLevel" TEXT,
    "label" TEXT,
    "isSelected" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GscProperty_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GoogleConnection_googleUserId_key" ON "GoogleConnection"("googleUserId");

-- CreateIndex
CREATE UNIQUE INDEX "GscProperty_connectionId_siteUrl_key" ON "GscProperty"("connectionId", "siteUrl");

-- AddForeignKey
ALTER TABLE "GscProperty" ADD CONSTRAINT "GscProperty_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "GoogleConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
