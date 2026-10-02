/*
  Warnings:

  - You are about to drop the column `email` on the `otp_codes` table. All the data in the column will be lost.
  - Added the required column `identifier` to the `otp_codes` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "otp_codes_email_idx";

-- AlterTable
ALTER TABLE "otp_codes" DROP COLUMN "email",
ADD COLUMN     "identifier" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "otp_codes_identifier_idx" ON "otp_codes"("identifier");
