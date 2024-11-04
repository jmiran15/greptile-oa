/*
  Warnings:

  - You are about to drop the `Changelog` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `owner` to the `Repo` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "LogStatus" AS ENUM ('draft', 'published', 'archived');

-- CreateEnum
CREATE TYPE "ChangelogGenerationStatus" AS ENUM ('pending', 'summarizing', 'context', 'updating', 'completed', 'error');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Status" ADD VALUE 'summarizing';
ALTER TYPE "Status" ADD VALUE 'embedding';

-- DropForeignKey
ALTER TABLE "Changelog" DROP CONSTRAINT "Changelog_repoId_fkey";

-- AlterTable
ALTER TABLE "Repo" ADD COLUMN     "croppedLogoFilepath" TEXT,
ADD COLUMN     "finishedInitialization" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ingested" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastCrop" JSONB,
ADD COLUMN     "originalLogoFilepath" TEXT,
ADD COLUMN     "owner" TEXT NOT NULL,
ADD COLUMN     "themeDescription" TEXT DEFAULT 'A changelog for your project',
ADD COLUMN     "themeHeaderBg" TEXT DEFAULT '#e4e4e7',
ADD COLUMN     "themeHeading" TEXT DEFAULT 'Changelog',
ADD COLUMN     "themeLinkPath" TEXT DEFAULT 'https://github.com/your-repo',
ADD COLUMN     "themeLinkText" TEXT DEFAULT 'View on GitHub';

-- DropTable
DROP TABLE "Changelog";

-- CreateTable
CREATE TABLE "Log" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "repoId" TEXT NOT NULL,
    "prNumber" INTEGER,
    "prTitle" TEXT,
    "prDescription" TEXT,
    "baseBranch" TEXT,
    "headBranch" TEXT,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "content" TEXT,
    "publishedDate" TIMESTAMP(3),
    "status" "LogStatus" NOT NULL DEFAULT 'draft',
    "generationStatus" "ChangelogGenerationStatus" DEFAULT 'pending',

    CONSTRAINT "Log_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Log" ADD CONSTRAINT "Log_repoId_fkey" FOREIGN KEY ("repoId") REFERENCES "Repo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
