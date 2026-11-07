-- AlterTable
ALTER TABLE "OutreachMessage" ADD COLUMN "bouncedAt" DATETIME;
ALTER TABLE "OutreachMessage" ADD COLUMN "meetingAt" DATETIME;
ALTER TABLE "OutreachMessage" ADD COLUMN "outcomeNote" TEXT;
ALTER TABLE "OutreachMessage" ADD COLUMN "repliedAt" DATETIME;
