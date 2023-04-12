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

        expect(fetch.mock.calls[0][1].headers['X-Hasura-Admin-Secret']).toBe(HASURA_ADMIN_SECRET)
        expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchSnapshot();
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
        expect(fetch.mock.calls[0][1].headers['X-Hasura-Admin-Secret']).toBe(HASURA_ADMIN_SECRET)
        expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchSnapshot();
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

        expect(fetch.mock.calls[0][1].headers['X-Hasura-Admin-Secret']).toBe(HASURA_ADMIN_SECRET)
        expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchSnapshot();
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
        expect(fetch.mock.calls[0][1].headers['X-Hasura-Admin-Secret']).toBe(HASURA_ADMIN_SECRET)
        expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchSnapshot();
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

        expect(fetch.mock.calls[0][1].headers['X-Hasura-Admin-Secret']).toBe(HASURA_ADMIN_SECRET)
        expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchSnapshot();
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

        expect(fetch.mock.calls[0][1].headers['X-Hasura-Admin-Secret']).toBe(HASURA_ADMIN_SECRET)
        expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchSnapshot();
    });

    it('tracks foreign key relationships', async () => {
        const fetch = jest
            .fn()
            .mockResolvedValue({
                status: 200,
                json: () => ({
                    result: [
                        [
                            "coalesce"
                        ],
                        [
                            JSON.stringify([
                                {
                                    table_schema: "public",
                                    table_name: "comments",
                                    constraint_name: "comments_post_id_fkey",
                                    ref_table_table_schema: "public",
                                    ref_table: "posts",
                                    column_mapping: {
                                        post_id: "id"
                                    },
                                    on_update: "a",
                                    on_delete: "a"
                                },
                                {
                                    table_schema: "public",
                                    table_name: "post_likes",
                                    constraint_name: "post_likes_post_id_fkey",
                                    ref_table_table_schema: "public",
                                    ref_table: "posts",
                                    column_mapping: {
                                        post_id: "id"
                                    },
                                    on_update: "a",
                                    on_delete: "c"
                                }
                            ])
                        ]
                    ] 
                }),
            });
        const client = new HasuraClient({ fetch })

        const result = await client.trackForeignKeyRelationships('public');

        expect(fetch.mock.calls[0][1].headers['X-Hasura-Admin-Secret']).toBe(HASURA_ADMIN_SECRET)
        expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchSnapshot();

        expect(fetch.mock.calls[1][1].headers['X-Hasura-Admin-Secret']).toBe(HASURA_ADMIN_SECRET)
        expect(JSON.parse(fetch.mock.calls[1][1].body)).toMatchSnapshot();
    });
});
