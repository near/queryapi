declare namespace NodeJS {
  export interface ProcessEnv {
    HASURA_ENDPOINT: string
    HASURA_ADMIN_SECRET: string
    PGHOST: string
    PGHOST_HASURA?: string
    PGPORT: string
    PGUSER: string
    PGPASSWORD: string
    PGDATABASE: string
    PORT: string
    CRON_DATABASE: string
  }
}
