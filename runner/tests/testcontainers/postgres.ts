import { AbstractStartedContainer, GenericContainer, type StartedTestContainer, Wait, type StartedNetwork } from 'testcontainers';

import { logConsumer } from './utils';

export class PostgreSqlContainer {
  private database = 'postgres';
  private username = 'postgres';
  private password = 'postgres';

  private readonly PORT = 5432;

  private constructor (private readonly container: GenericContainer) {
    container.withExposedPorts(this.PORT)
      .withWaitStrategy(Wait.forLogMessage(/.*database system is ready to accept connections.*/, 2))
      .withLogConsumer(logConsumer)
      .withStartupTimeout(120_000);
  }

  public static async build (): Promise<PostgreSqlContainer> {
    const container = await GenericContainer.fromDockerfile('../postgres').build();

    return new PostgreSqlContainer(container);
  }

  public withNetwork (network: StartedNetwork): this {
    this.container.withNetwork(network);
    return this;
  }

  public withDatabase (database: string): this {
    this.database = database;
    return this;
  }

  public withUsername (username: string): this {
    this.username = username;
    return this;
  }

  public withPassword (password: string): this {
    this.password = password;
    return this;
  }

  public async start (): Promise<StartedPostgreSqlContainer> {
    this.container.withEnvironment({
      POSTGRES_DB: this.database,
      POSTGRES_USER: this.username,
      POSTGRES_PASSWORD: this.password,
    });
    return new StartedPostgreSqlContainer(await this.container.start(), this.database, this.username, this.password, this.PORT);
  }
}

export class StartedPostgreSqlContainer extends AbstractStartedContainer {
  constructor (
    startedTestContainer: StartedTestContainer,
    private readonly database: string,
    private readonly username: string,
    private readonly password: string,
    private readonly port: number
  ) {
    super(startedTestContainer);
  }

  public getPort (networkName?: string): string {
    return networkName ? this.port.toString() : this.getMappedPort(this.port).toString();
  }

  public getDatabase (): string {
    return this.database;
  }

  public getUsername (): string {
    return this.username;
  }

  public getPassword (): string {
    return this.password;
  }

  public override getHost (): string {
    return 'localhost';
  }

  public getIpAddress (networkName?: string): string {
    return networkName ? super.getIpAddress(networkName) : this.getHost();
  }

  public getConnectionUri (networkName?: string): string {
    const url = new URL('', 'postgres://');
    url.hostname = this.getIpAddress(networkName);
    url.port = this.getPort(networkName).toString();
    url.pathname = this.getDatabase();
    url.username = this.getUsername();
    url.password = this.getPassword();
    return url.toString();
  }
}
