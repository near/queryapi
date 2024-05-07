CREATE TABLE
    "actions_index" (
                        "block_date" TEXT NOT NULL,
                        "receiver_id" TEXT NOT NULL,
                        "first_block_height" NUMERIC(20) NOT NULL,
                        "bitmap" TEXT NOT NULL,
                        PRIMARY KEY ("block_date", "receiver_id")
)
