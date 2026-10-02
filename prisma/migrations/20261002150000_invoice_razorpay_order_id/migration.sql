-- AlterTable
ALTER TABLE "invoices" ADD COLUMN "razorpayOrderId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "invoices_razorpayOrderId_key" ON "invoices"("razorpayOrderId");
