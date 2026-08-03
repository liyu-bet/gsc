-- AlterEnum
CREATE TYPE "GoogleConnectionStatus" AS ENUM ('ACTIVE', 'REVOKED', 'ERROR', 'REAUTH_REQUIRED');

-- AlterTable
ALTER TABLE "GoogleConnection"
ADD COLUMN "status" "GoogleConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN "lastErrorCode" TEXT,
ADD COLUMN "lastErrorMessage" TEXT,
ADD COLUMN "lastErrorAt" TIMESTAMP(3),
ADD COLUMN "lastSuccessAt" TIMESTAMP(3);
