declare namespace NodeJS {
  export interface ProcessEnv {
    HASURA_ENDPOINT: string
    HASURA_ADMIN_SECRET: string
    PG_HOST: string
    PG_PORT: string
    PG_ADMIN_USER: string
    PG_ADMIN_PASSWORD: string
    PG_ADMIN_DATABASE: string
  }
}
