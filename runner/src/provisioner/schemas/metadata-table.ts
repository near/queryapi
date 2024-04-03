export const metadataTableDDL = (): string => `
CREATE TABLE IF NOT EXISTS __metadata (
    function_name TEXT NOT NULL,
    attribute TEXT NOT NULL,
    value TEXT NOT NULL,
    PRIMARY KEY (function_name, attribute)
);
`;
