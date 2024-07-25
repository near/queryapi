const config = {
  hasuraEndpoint: 'mock-hasura-endpoint',
  hasuraAdminSecret: 'mock-hasura-secret',
};

const SIMPLE_SCHEMA = `CREATE TABLE
    "posts" (
      "id" SERIAL NOT NULL,
      "account_id" VARCHAR NOT NULL,
      "block_height" DECIMAL(58, 0) NOT NULL,
      "receipt_id" VARCHAR NOT NULL,
      "content" TEXT NOT NULL,
      "block_timestamp" DECIMAL(20, 0) NOT NULL,
      "accounts_liked" JSONB NOT NULL DEFAULT '[]',
      "last_comment_timestamp" DECIMAL(20, 0),
      CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
    );`;

const SOCIAL_SCHEMA = `
    CREATE TABLE
      "posts" (
        "id" SERIAL NOT NULL,
        "account_id" VARCHAR NOT NULL,
        "block_height" DECIMAL(58, 0) NOT NULL,
        "receipt_id" VARCHAR NOT NULL,
        "content" TEXT NOT NULL,
        "block_timestamp" DECIMAL(20, 0) NOT NULL,
        "accounts_liked" JSONB NOT NULL DEFAULT '[]',
        "last_comment_timestamp" DECIMAL(20, 0),
        CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
      );

    CREATE TABLE
      "comments" (
        "id" SERIAL NOT NULL,
        "post_id" SERIAL NOT NULL,
        "account_id" VARCHAR NOT NULL,
        "block_height" DECIMAL(58, 0) NOT NULL,
        "content" TEXT NOT NULL,
        "block_timestamp" DECIMAL(20, 0) NOT NULL,
        "receipt_id" VARCHAR NOT NULL,
        CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
      );

    CREATE TABLE
      "post_likes" (
        "post_id" SERIAL NOT NULL,
        "account_id" VARCHAR NOT NULL,
        "block_height" DECIMAL(58, 0),
        "block_timestamp" DECIMAL(20, 0) NOT NULL,
        "receipt_id" VARCHAR NOT NULL,
        CONSTRAINT "post_likes_pkey" PRIMARY KEY ("post_id", "account_id")
      );`;

const CASE_SENSITIVE_SCHEMA = `
    CREATE TABLE
      Posts (
        "id" SERIAL NOT NULL,
        "AccountId" VARCHAR NOT NULL,
        BlockHeight DECIMAL(58, 0) NOT NULL,
        "receiptId" VARCHAR NOT NULL,
        content TEXT NOT NULL,
        block_Timestamp DECIMAL(20, 0) NOT NULL,
        "Accounts_Liked" JSONB NOT NULL DEFAULT '[]',
        "LastCommentTimestamp" DECIMAL(20, 0),
        CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
      );

    CREATE TABLE
      "CommentsTable" (
        "id" SERIAL NOT NULL,
        PostId SERIAL NOT NULL,
        "accountId" VARCHAR NOT NULL,
        blockHeight DECIMAL(58, 0) NOT NULL,
        CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
      );`;

const STRESS_TEST_SCHEMA = `
    CREATE TABLE creator_quest (
        account_id VARCHAR PRIMARY KEY,
        num_components_created INTEGER NOT NULL DEFAULT 0,
        completed BOOLEAN NOT NULL DEFAULT FALSE
      );

    CREATE TABLE
      composer_quest (
        account_id VARCHAR PRIMARY KEY,
        num_widgets_composed INTEGER NOT NULL DEFAULT 0,
        completed BOOLEAN NOT NULL DEFAULT FALSE
      );

    CREATE TABLE
      "contractor - quest" (
        account_id VARCHAR PRIMARY KEY,
        num_contracts_deployed INTEGER NOT NULL DEFAULT 0,
        completed BOOLEAN NOT NULL DEFAULT FALSE
      );

    CREATE TABLE
      "posts" (
        "id" SERIAL NOT NULL,
        "account_id" VARCHAR NOT NULL,
        "block_height" DECIMAL(58, 0) NOT NULL,
        "receipt_id" VARCHAR NOT NULL,
        "content" TEXT NOT NULL,
        "block_timestamp" DECIMAL(20, 0) NOT NULL,
        "accounts_liked" JSONB NOT NULL DEFAULT '[]',
        "last_comment_timestamp" DECIMAL(20, 0),
        CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
      );

    CREATE TABLE
      "comments" (
        "id" SERIAL NOT NULL,
        "post_id" SERIAL NOT NULL,
        "account_id" VARCHAR NOT NULL,
        "block_height" DECIMAL(58, 0) NOT NULL,
        "content" TEXT NOT NULL,
        "block_timestamp" DECIMAL(20, 0) NOT NULL,
        "receipt_id" VARCHAR NOT NULL,
        CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
      );

    CREATE TABLE
      "post_likes" (
        "post_id" SERIAL NOT NULL,
        "account_id" VARCHAR NOT NULL,
        "block_height" DECIMAL(58, 0),
        "block_timestamp" DECIMAL(20, 0) NOT NULL,
        "receipt_id" VARCHAR NOT NULL,
        CONSTRAINT "post_likes_pkey" PRIMARY KEY ("post_id", "account_id")
      );

    CREATE UNIQUE INDEX "posts_account_id_block_height_key" ON "posts" ("account_id" ASC, "block_height" ASC);

    CREATE UNIQUE INDEX "comments_post_id_account_id_block_height_key" ON "comments" (
      "post_id" ASC,
      "account_id" ASC,
      "block_height" ASC
    );

    CREATE INDEX
      "posts_last_comment_timestamp_idx" ON "posts" ("last_comment_timestamp" DESC);

    ALTER TABLE
      "comments"
    ADD
      CONSTRAINT "comments_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

    ALTER TABLE
      "post_likes"
    ADD
      CONSTRAINT "post_likes_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts" ("id") ON DELETE CASCADE ON UPDATE NO ACTION;

    CREATE TABLE IF NOT EXISTS
      "My Table1" (id serial PRIMARY KEY);

    CREATE TABLE
      "Another-Table" (id serial PRIMARY KEY);

    CREATE TABLE
    IF NOT EXISTS
      "Third-Table" (id serial PRIMARY KEY);

    CREATE TABLE
      yet_another_table (id serial PRIMARY KEY);
    `;

const SIMPLE_REDIS_STREAM = 'test:stream';
const SIMPLE_ACCOUNT_ID = 'morgs.near';
const SIMPLE_FUNCTION_NAME = 'test_indexer';
const SIMPLE_CODE = 'const a = 1;';
const simpleSchemaConfig: IndexerConfig = new IndexerConfig(SIMPLE_REDIS_STREAM, SIMPLE_ACCOUNT_ID, SIMPLE_FUNCTION_NAME, 0, SIMPLE_CODE, SIMPLE_SCHEMA, LogLevel.INFO);
const socialSchemaConfig: IndexerConfig = new IndexerConfig(SIMPLE_REDIS_STREAM, SIMPLE_ACCOUNT_ID, SIMPLE_FUNCTION_NAME, 0, SIMPLE_CODE, SOCIAL_SCHEMA, LogLevel.INFO);
const caseSensitiveConfig: IndexerConfig = new IndexerConfig(SIMPLE_REDIS_STREAM, SIMPLE_ACCOUNT_ID, SIMPLE_FUNCTION_NAME, 0, SIMPLE_CODE, CASE_SENSITIVE_SCHEMA, LogLevel.INFO);
const stressTestConfig: IndexerConfig = new IndexerConfig(SIMPLE_REDIS_STREAM, SIMPLE_ACCOUNT_ID, SIMPLE_FUNCTION_NAME, 0, SIMPLE_CODE, STRESS_TEST_SCHEMA, LogLevel.INFO);
const genericDbCredentials: PostgresConnectionParams = {
  database: 'test_near',
  host: 'postgres',
  password: 'test_pass',
  port: 5432,
  user: 'test_near'
};

const genericMockFetch = jest.fn()
  .mockResolvedValue({
    status: 200,
    json: async () => ({
      data: 'mock',
    }),
  }) as unknown as typeof fetch;
