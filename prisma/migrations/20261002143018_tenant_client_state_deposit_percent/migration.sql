-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "state" TEXT;

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "defaultDepositPercent" INTEGER NOT NULL DEFAULT 50,
ADD COLUMN     "state" TEXT;
