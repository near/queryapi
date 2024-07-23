CREATE TABLE
  "receivers" (
    "id" BIGSERIAL NOT NULL PRIMARY KEY,
    "receiver" TEXT NOT NULL
  );

CREATE UNIQUE INDEX idx_receivers_by_receiver ON receivers (receiver);

CREATE TABLE
  "bitmaps" (
    "receiver_id" bigint NOT NULL,
    "block_date" date NOT NULL,
    "first_block_height" int NOT NULL,
    "last_elias_gamma_start_bit" int NOT NULL,
    "max_index" int NOT NULL,
    "bitmap" TEXT NOT NULL,
    PRIMARY KEY ("block_date", "receiver_id"),
    CONSTRAINT "bitmaps_receiver_id_fkey" FOREIGN KEY ("receiver_id") REFERENCES "receivers" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION
  );

