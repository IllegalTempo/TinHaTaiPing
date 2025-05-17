-- AlterTable
ALTER TABLE "Match" ADD COLUMN "completedAt" DATETIME;
ALTER TABLE "Match" ADD COLUMN "loserEloChange" INTEGER;
ALTER TABLE "Match" ADD COLUMN "winnerEloChange" INTEGER;
