import { type Readable } from 'stream';
import { AbstractStartedContainer, GenericContainer, type StartedTestContainer, Wait, type StartedNetwork } from 'testcontainers';

import { logConsumer } from './utils';

export class HasuraGraphQLContainer {
  private databaseUrl?: string;
  private adminSecret = 'adminsecret';

  private readonly PORT = 8080;

  constructor (private readonly container = new GenericContainer('hasura/graphql-engine:latest')) {
    container.withExposedPorts(this.PORT)
      .withWaitStrategy(Wait.forLogMessage(/.*Starting API server.*/i))
      .withLogConsumer(logConsumer)
      .withStartupTimeout(120_000);
  }

  public withNetwork (network: StartedNetwork): this {
    this.container.withNetwork(network);
    return this;
  }

  public withLogConsumer (consumer: (stream: Readable) => unknown): this {
    this.container.withLogConsumer(consumer);
    return this;
  }

  public withDatabaseUrl (databaseUrl: string): this {
    this.databaseUrl = databaseUrl;
    return this;
  }

  public withAdminSecret (adminSecret: string): this {
    this.adminSecret = adminSecret;
    return this;
  }

  public async start (): Promise<StartedHasuraGraphQLContainer> {
    if (!this.databaseUrl) {
      throw new Error('Database URL is required');
    }

    this.container.withEnvironment({
      HASURA_GRAPHQL_DATABASE_URL: this.databaseUrl,
      HASURA_GRAPHQL_ENABLE_CONSOLE: 'true',
      ...(this.adminSecret && { HASURA_GRAPHQL_ADMIN_SECRET: this.adminSecret }),
    });
    return new StartedHasuraGraphQLContainer(await this.container.start(), this.databaseUrl, this.adminSecret, this.PORT);
  }
}

export class StartedHasuraGraphQLContainer extends AbstractStartedContainer {
  constructor (
    startedTestContainer: StartedTestContainer,
    private readonly databaseUrl: string,
    private readonly adminSecret: string,
    private readonly port: number
  ) {
    super(startedTestContainer);
  }

  public getPort (networkName?: string): string {
    return networkName ? this.port.toString() : this.getMappedPort(this.port).toString();
  }

  public getDatabaseUrl (): string {
    return this.databaseUrl;
  }

  public getAdminSecret (): string {
    return this.adminSecret;
  }

  public getIpAddress (networkName?: string): string {
    return networkName ? super.getIpAddress(networkName) : this.getHost();
  }

  public getEndpoint (networkName?: string): string {
    return `http://${this.getIpAddress(networkName)}:${this.getPort(networkName)}`;
  }
}
