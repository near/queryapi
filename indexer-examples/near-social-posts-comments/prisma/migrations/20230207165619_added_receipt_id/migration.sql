/*
  Warnings:

  - Added the required column `receipt_id` to the `comments` table without a default value. This is not possible if the table is not empty.
  - Added the required column `receipt_id` to the `posts` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "comments" ADD COLUMN     "receipt_id" VARCHAR NOT NULL;

-- AlterTable
ALTER TABLE "posts" ADD COLUMN     "receipt_id" VARCHAR NOT NULL;
