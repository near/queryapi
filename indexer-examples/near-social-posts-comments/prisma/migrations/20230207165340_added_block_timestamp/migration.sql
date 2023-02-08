-- AlterTable
ALTER TABLE "comments" ADD COLUMN     "block_timestamp" DECIMAL(20,0) NOT NULL;

-- AlterTable
ALTER TABLE "post_likes" ADD COLUMN     "block_timestamp" DECIMAL(20,0) NOT NULL;

-- AlterTable
ALTER TABLE "posts" ADD COLUMN     "block_timestamp" DECIMAL(20,0) NOT NULL;
