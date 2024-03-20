import { AbstractStartedContainer, GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';

export class HasuraGraphQLContainer extends GenericContainer {
  private databaseUrl?: string;
  private adminSecret = 'adminsecret';

  private readonly PORT = 8080;

  constructor (image = 'hasura/graphql-engine:latest') {
    super(image);

    this.withExposedPorts(this.PORT)
      .withWaitStrategy(Wait.forLogMessage(/.*starting API server*/))
      .withStartupTimeout(120_000);
  }

  public withDatabaseUrl (databaseUrl: string): this {
    this.databaseUrl = databaseUrl;
    return this;
  }

  public withAdminSecret (adminSecret: string): this {
    this.adminSecret = adminSecret;
    return this;
  }

  public override async start (): Promise<StartedHasuraGraphQLContainer> {
    if (!this.databaseUrl) {
      throw new Error('Database URL is required');
    }

    this.withEnvironment({
      HASURA_GRAPHQL_DATABASE_URL: this.databaseUrl,
      ...(this.adminSecret && { HASURA_GRAPHQL_ADMIN_SECRET: this.adminSecret }),
    });
    return new StartedHasuraGraphQLContainer(await super.start(), this.databaseUrl, this.adminSecret, this.PORT);
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
