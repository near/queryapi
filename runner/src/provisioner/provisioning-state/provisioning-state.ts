import { type ProvisioningConfig } from '../../indexer-config';
import { type HasuraTableMetadata, type HasuraMetadata, type HasuraSource, HASURA_PERMISSION_TYPES } from '../hasura-client';
import type HasuraClient from '../hasura-client';

export default class ProvisioningState {
  constructor (
    private readonly config: ProvisioningConfig,
    private readonly hasuraMetadata: HasuraMetadata,
    private readonly tablesInSource: string[],
  ) {}

  static async loadProvisioningState (hasuraClient: HasuraClient, provisioningConfig: ProvisioningConfig): Promise<ProvisioningState> {
    const hasuraMetadata = await hasuraClient.exportMetadata();
    const tablesInSource = await hasuraClient.getTableNames(provisioningConfig.schemaName(), provisioningConfig.databaseName());
    return new ProvisioningState(provisioningConfig, hasuraMetadata, tablesInSource);
  }

  doesSourceExist (): boolean {
    return this.hasuraMetadata.sources.some(source => source.name === this.config.databaseName());
  }

  doesSchemaExist (): boolean {
    return this.hasuraMetadata.sources.some(
      source => source.name === this.config.databaseName() &&
        source.tables.some(
          table => table.table.schema === this.config.schemaName()
        )
    );
  }

  getCreatedTables (): string[] {
    return this.tablesInSource;
  }

  getSourceMetadata (): HasuraSource {
    const matchedSource = this.hasuraMetadata.sources.filter(source => source.name === this.config.databaseName());
    if (matchedSource.length !== 1) {
      throw new Error(`Expected exactly one source with name ${this.config.databaseName()}`);
    };
    return matchedSource[0];
  }

  getMetadataForTables (): HasuraTableMetadata[] {
    return this.getSourceMetadata().tables.filter(tableMetadata => tableMetadata.table.schema === this.config.schemaName());
  }

  getTrackedTables (): string[] {
    return this.getMetadataForTables().map(tableMetadata => tableMetadata.table.name);
  }

  private tableContainsAllPermissions (tableMetadata: HasuraTableMetadata): boolean {
    const allPermissions: string[] = HASURA_PERMISSION_TYPES.map(permission => `${permission}_permissions`);
    const metadataKeys = Object.keys(tableMetadata);
    return allPermissions.every(permission => metadataKeys.includes(permission));
  }

  // Does not check for partial permissions
  getTablesWithPermissions (): string[] {
    const tableMetadataList = this.getMetadataForTables();
    return tableMetadataList
      .filter(metadata => this.tableContainsAllPermissions(metadata))
      .map(metadata => metadata.table.name);
  }
}
