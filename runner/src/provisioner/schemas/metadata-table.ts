export const metadataTableDDL = (dbName: string): string => `
CREATE TABLE IF NOT EXISTS __${dbName}_metadata (
    function_name TEXT NOT NULL,
    attribute TEXT NOT NULL,
    value TEXT NOT NULL,
    PRIMARY KEY (function_name, attribute)
);
`;
