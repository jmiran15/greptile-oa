/*
  Warnings:

  - You are about to drop the column `owner` on the `Repo` table. All the data in the column will be lost.
  - You are about to drop the column `repo` on the `Repo` table. All the data in the column will be lost.
  - You are about to drop the column `repoUrl` on the `Repo` table. All the data in the column will be lost.
  - You are about to drop the `Repository` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Update` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[userId,fullName]` on the table `Repo` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `fullName` to the `Repo` table without a default value. This is not possible if the table is not empty.
  - Added the required column `name` to the `Repo` table without a default value. This is not possible if the table is not empty.
  - Added the required column `userId` to the `Repo` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Repository" DROP CONSTRAINT "Repository_userId_fkey";

-- AlterTable
ALTER TABLE "Repo" DROP COLUMN "owner",
DROP COLUMN "repo",
DROP COLUMN "repoUrl",
ADD COLUMN     "description" TEXT,
ADD COLUMN     "fullName" TEXT NOT NULL,
ADD COLUMN     "name" TEXT NOT NULL,
ADD COLUMN     "stargazersCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "userId" TEXT NOT NULL;

-- DropTable
DROP TABLE "Repository";

-- DropTable
DROP TABLE "Update";

-- CreateIndex
CREATE UNIQUE INDEX "Repo_userId_fullName_key" ON "Repo"("userId", "fullName");

-- AddForeignKey
ALTER TABLE "Repo" ADD CONSTRAINT "Repo_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
