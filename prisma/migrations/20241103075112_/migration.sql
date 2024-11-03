-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "Status" AS ENUM ('pending', 'processing', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "Type" AS ENUM ('file', 'folder');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "avatarUrl" TEXT,
ADD COLUMN     "displayName" TEXT;

-- CreateTable
CREATE TABLE "Repo" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "repoUrl" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "repo" TEXT NOT NULL,
    "defaultBranch" TEXT NOT NULL,
    "isPending" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Repo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepoNode" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "path" TEXT NOT NULL,
    "type" "Type" NOT NULL DEFAULT 'file',
    "status" "Status" NOT NULL DEFAULT 'pending',
    "url" TEXT NOT NULL,
    "sha" TEXT NOT NULL,
    "repoId" TEXT NOT NULL,
    "parentId" TEXT,
    "upstreamSummary" TEXT,
    "downstreamSummary" TEXT,

    CONSTRAINT "RepoNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Embedding" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "embedding" vector(1536) NOT NULL,
    "chunkContent" TEXT NOT NULL,
    "embeddedContent" TEXT NOT NULL,
    "repoId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,

    CONSTRAINT "Embedding_pkey" PRIMARY KEY ("id","repoId")
);

-- CreateTable
CREATE TABLE "Changelog" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "repoId" TEXT NOT NULL,

    CONSTRAINT "Changelog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RepoNode_repoId_status_idx" ON "RepoNode"("repoId", "status");

-- CreateIndex
CREATE INDEX "RepoNode_parentId_idx" ON "RepoNode"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "RepoNode_repoId_path_key" ON "RepoNode"("repoId", "path");

-- CreateIndex
CREATE INDEX "Embedding_repoId_idx" ON "Embedding"("repoId");

-- AddForeignKey
ALTER TABLE "RepoNode" ADD CONSTRAINT "RepoNode_repoId_fkey" FOREIGN KEY ("repoId") REFERENCES "Repo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepoNode" ADD CONSTRAINT "RepoNode_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "RepoNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Embedding" ADD CONSTRAINT "Embedding_repoId_fkey" FOREIGN KEY ("repoId") REFERENCES "Repo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Embedding" ADD CONSTRAINT "Embedding_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "RepoNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Changelog" ADD CONSTRAINT "Changelog_repoId_fkey" FOREIGN KEY ("repoId") REFERENCES "Repo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
