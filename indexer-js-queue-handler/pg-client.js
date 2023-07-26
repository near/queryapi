import pg from "pg";
import pgFormatModule from "pg-format";

export default class PgClient {
    constructor(
        connectionParams,
        poolConfig = { max: 10, idleTimeoutMillis: 30000 },
        pgPool = pg.Pool,
        pgFormat = pgFormatModule
    ) {
        this.pgPool = new pgPool({
            user: connectionParams.user,
            password: connectionParams.password,
            host: connectionParams.host,
            port: connectionParams.port,
            database: connectionParams.database,
            ...poolConfig,
        });
        this.format = pgFormat;
    }

    async query(query, params = []) {
        const client = await this.pgPool.connect();
        try {
            await client.query(query, params);
        } finally {
            client.release();
        }
    }
}
