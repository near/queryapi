declare namespace NodeJS {
  export interface ProcessEnv {
    HASURA_ENDPOINT: string
    HASURA_ADMIN_SECRET: string
    PGHOST: string
    PGPORT: string
    PGUSER: string
    PGPASSWORD: string
    PGDATABASE: string
  }
}
