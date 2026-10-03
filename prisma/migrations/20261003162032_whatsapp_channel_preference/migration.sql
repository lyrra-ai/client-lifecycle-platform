-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('whatsapp_first', 'email_first');

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "notificationChannel" "NotificationChannel" NOT NULL DEFAULT 'email_first';
