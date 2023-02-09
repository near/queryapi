-- AlterTable
ALTER TABLE "posts" ADD COLUMN     "accounts_liked" JSONB NOT NULL DEFAULT '[]';
