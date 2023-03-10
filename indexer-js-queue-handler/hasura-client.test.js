import { jest } from '@jest/globals';

import HasuraClient from './hasura-client'

describe('HasuraClient', () => {
    const oldEnv = process.env;

    const HASURA_ENDPOINT = 'mock-hasura-endpoint';
    const HASURA_ADMIN_SECRET = 'mock-hasura-admin-secret';

    beforeAll(() => {
        process.env = {
            ...oldEnv,
            HASURA_ENDPOINT,
            HASURA_ADMIN_SECRET,
        };
    });

    afterAll(() => {
        process.env = oldEnv;
    });

    it('creates a schema', async () => {
        const fetch = jest
            .fn()
            .mockResolvedValue({
                status: 200,
                json: () => ({})
            });
        const client = new HasuraClient({ fetch })

        await client.createSchema('name');

        expect(fetch).toBeCalledWith(
            `${HASURA_ENDPOINT}/v2/query`,
            {
                body: JSON.stringify({
                    type: 'run_sql',
                    args: {
                        sql: 'CREATE schema name',
                        read_only: false,
                        source: 'default'
                    },
                }),
                headers: {
                    'X-Hasura-Admin-Secret': HASURA_ADMIN_SECRET
                },
                method: 'POST'
            }
        );
    });

    it('checks if a schema exists', async () => {
        const fetch = jest
            .fn()
            .mockResolvedValue({
                status: 200,
                json: () => ({
                    result: [['schema_name'], ['name']]
                })
            });
        const client = new HasuraClient({ fetch })

        const result = await client.isSchemaCreated('name');

        expect(result).toBe(true);
        expect(fetch).toBeCalledWith(
            `${HASURA_ENDPOINT}/v2/query`,
            {
                body: JSON.stringify({
                    type: 'run_sql',
                    args: {
                        sql: 'SELECT schema_name FROM information_schema.schemata WHERE schema_name = \'name\'',
                        read_only: true,
                        source: 'default'
                    }
                }),
                headers: {
                    'X-Hasura-Admin-Secret': HASURA_ADMIN_SECRET
                },
                method: 'POST'
            }
        );
    });

    it('runs migrations for the specified schema', async () => {
        const fetch = jest
            .fn()
            .mockResolvedValue({
                status: 200,
                json: () => ({})
            });
        const client = new HasuraClient({ fetch })

        await client.runMigrations('schema', 'CREATE TABLE blocks (height numeric)');

        expect(fetch).toBeCalledWith(
            `${HASURA_ENDPOINT}/v2/query`,
            {
                body: JSON.stringify({
                    type: 'run_sql',
                    args: {
                        sql: 
      `
      set schema 'schema';
      CREATE TABLE blocks (height numeric)
      `,
                        read_only: false,
                        source: 'default'
                    }
                }),
                headers: {
                    'X-Hasura-Admin-Secret': HASURA_ADMIN_SECRET
                },
                method: 'POST'
            }
        );
    });

    it('gets table names within a schema', async () => {
        const fetch = jest
            .fn()
            .mockResolvedValue({
                status: 200,
                json: () => ({
                    result: [
                        ['table_name'],
                        ['height'],
                        ['width']
                    ]
                })
            });
        const client = new HasuraClient({ fetch })

        const names = await client.getTableNames('schema');

        expect(names).toEqual(['height', 'width']);
        expect(fetch).toBeCalledWith(
            `${HASURA_ENDPOINT}/v2/query`,
            {
                body: JSON.stringify({
                    type: 'run_sql',
                    args: {
                        sql: 'SELECT table_name FROM information_schema.tables WHERE table_schema = \'schema\'',
                        read_only: true,
                        source: 'default'
                    }
                }),
                headers: {
                    'X-Hasura-Admin-Secret': HASURA_ADMIN_SECRET
                },
                method: 'POST'
            }
        );
    });

    it('tracks the specified tables for a specified schema', async () => {
        const fetch = jest
            .fn()
            .mockResolvedValue({
                status: 200,
                json: () => ({})
            });
        const client = new HasuraClient({ fetch })

        await client.trackTables('schema', ['height', 'width']);

        expect(fetch).toBeCalledWith(
            `${HASURA_ENDPOINT}/v1/metadata`,
            {
                body: JSON.stringify({
                    type: 'bulk',
                    args: [
                        {
                            type: 'pg_track_table',
                            args: {
                                table: {
                                    name: 'height',
                                    schema: 'schema'
                                }
                            }
                        },
                        {
                            type: 'pg_track_table',
                            args: {
                                table: {
                                    name: 'width',
                                    schema: 'schema'
                                }
                            }
                        }
                    ]
                }),
                headers: {
                    'X-Hasura-Admin-Secret': HASURA_ADMIN_SECRET
                },
                method: 'POST'
            }
        );
    });

    it('adds the specified permissions for the specified roles/table/schema', async () => {
        const fetch = jest
            .fn()
            .mockResolvedValue({
                status: 200,
                json: () => ({})
            });
        const client = new HasuraClient({ fetch })

        await client.addPermissionsToTables('schema', ['height', 'width'], 'role', ['select', 'insert']);

        expect(fetch).toBeCalledWith(
            `${HASURA_ENDPOINT}/v1/metadata`,
            {
                body: JSON.stringify({
                    type: 'bulk',
                    args: [
                        {
                            type: 'pg_create_select_permission',
                            args: {
                                table: {
                                    name: 'height',
                                    schema: 'schema', 
                                },
                                role: 'role',
                                permission: {
                                    columns: '*',
                                    check: {},
                                    computed_fields: [],
                                    filter: {},
                                },
                                source: 'default'
                            },
                        },
                        {
                            type: 'pg_create_insert_permission',
                            args: {
                                table: {
                                    name: 'height',
                                    schema: 'schema', 
                                },
                                role: 'role',
                                permission: {
                                    columns: '*',
                                    check: {},
                                    computed_fields: [],
                                    filter: {},
                                },
                                source: 'default'
                            },
                        },
                        {
                            type: 'pg_create_select_permission',
                            args: {
                                table: {
                                    name: 'width',
                                    schema: 'schema', 
                                },
                                role: 'role',
                                permission: {
                                    columns: '*',
                                    check: {},
                                    computed_fields: [],
                                    filter: {},
                                },
                                source: 'default'
                            },
                        },
                        {
                            type: 'pg_create_insert_permission',
                            args: {
                                table: {
                                    name: 'width',
                                    schema: 'schema', 
                                },
                                role: 'role',
                                permission: {
                                    columns: '*',
                                    check: {},
                                    computed_fields: [],
                                    filter: {},
                                },
                                source: 'default'
                            },
                        },
                    ]
                }),
                headers: {
                    'X-Hasura-Admin-Secret': HASURA_ADMIN_SECRET
                },
                method: 'POST'
            }
        );
    });
});
