/*
  Warnings:

  - You are about to drop the column `player1Score` on the `Match` table. All the data in the column will be lost.
  - You are about to drop the column `player2Score` on the `Match` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Match" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "player1Id" INTEGER NOT NULL,
    "player2Id" INTEGER NOT NULL,
    "winnerId" INTEGER,
    "winnerByDefault" BOOLEAN NOT NULL DEFAULT false,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" DATETIME,
    "gameMode" TEXT DEFAULT 'classic',
    "winnerEloChange" INTEGER,
    "loserEloChange" INTEGER,
    "abandonedAt" DATETIME,
    "abandonedBy" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Match_player1Id_fkey" FOREIGN KEY ("player1Id") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Match_player2Id_fkey" FOREIGN KEY ("player2Id") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Match_winnerId_fkey" FOREIGN KEY ("winnerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Match" ("completed", "completedAt", "createdAt", "gameMode", "id", "loserEloChange", "player1Id", "player2Id", "updatedAt", "winnerEloChange", "winnerId") SELECT "completed", "completedAt", "createdAt", "gameMode", "id", "loserEloChange", "player1Id", "player2Id", "updatedAt", "winnerEloChange", "winnerId" FROM "Match";
DROP TABLE "Match";
ALTER TABLE "new_Match" RENAME TO "Match";
CREATE TABLE "new_User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "email" TEXT,
    "googleId" TEXT,
    "role" TEXT NOT NULL DEFAULT 'PLAYER',
    "elo" INTEGER NOT NULL DEFAULT 1200,
    "lastRoom" TEXT,
    "banStatus" TEXT NOT NULL DEFAULT 'CLEAR',
    "banExpiration" DATETIME,
    "disconnectCount" INTEGER NOT NULL DEFAULT 0,
    "lastDisconnectAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_User" ("banStatus", "createdAt", "elo", "email", "googleId", "id", "lastRoom", "password", "role", "updatedAt", "username") SELECT "banStatus", "createdAt", "elo", "email", "googleId", "id", "lastRoom", "password", "role", "updatedAt", "username" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
