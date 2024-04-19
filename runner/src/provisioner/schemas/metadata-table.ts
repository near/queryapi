export const metadataTableDDL = (): string => `
CREATE TABLE IF NOT EXISTS sys_metadata (
    attribute TEXT NOT NULL,
    value TEXT NOT NULL,
    PRIMARY KEY (attribute)
);
`;
