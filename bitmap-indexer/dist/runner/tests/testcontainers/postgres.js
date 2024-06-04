"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StartedPostgreSqlContainer = exports.PostgreSqlContainer = void 0;
const testcontainers_1 = require("testcontainers");
const utils_1 = require("./utils");
class PostgreSqlContainer {
    constructor(container) {
        this.container = container;
        this.database = 'postgres';
        this.username = 'postgres';
        this.password = 'postgres';
        this.PORT = 5432;
        container.withExposedPorts(this.PORT)
            .withWaitStrategy(testcontainers_1.Wait.forLogMessage(/.*database system is ready to accept connections.*/, 2))
            .withLogConsumer(utils_1.logConsumer)
            .withStartupTimeout(120000);
    }
    static async build() {
        const container = await testcontainers_1.GenericContainer.fromDockerfile('../postgres').build();
        return new PostgreSqlContainer(container);
    }
    withNetwork(network) {
        this.container.withNetwork(network);
        return this;
    }
    withDatabase(database) {
        this.database = database;
        return this;
    }
    withUsername(username) {
        this.username = username;
        return this;
    }
    withPassword(password) {
        this.password = password;
        return this;
    }
    async start() {
        this.container.withEnvironment({
            POSTGRES_DB: this.database,
            POSTGRES_USER: this.username,
            POSTGRES_PASSWORD: this.password,
        });
        return new StartedPostgreSqlContainer(await this.container.start(), this.database, this.username, this.password, this.PORT);
    }
}
exports.PostgreSqlContainer = PostgreSqlContainer;
class StartedPostgreSqlContainer extends testcontainers_1.AbstractStartedContainer {
    constructor(startedTestContainer, database, username, password, port) {
        super(startedTestContainer);
        this.database = database;
        this.username = username;
        this.password = password;
        this.port = port;
    }
    getPort(networkName) {
        return networkName ? this.port.toString() : this.getMappedPort(this.port).toString();
    }
    getDatabase() {
        return this.database;
    }
    getUsername() {
        return this.username;
    }
    getPassword() {
        return this.password;
    }
    getHost() {
        return 'localhost';
    }
    getIpAddress(networkName) {
        return networkName ? super.getIpAddress(networkName) : this.getHost();
    }
    getConnectionUri(networkName) {
        const url = new URL('', 'postgres://');
        url.hostname = this.getIpAddress(networkName);
        url.port = this.getPort(networkName).toString();
        url.pathname = this.getDatabase();
        url.username = this.getUsername();
        url.password = this.getPassword();
        return url.toString();
    }
}
exports.StartedPostgreSqlContainer = StartedPostgreSqlContainer;
