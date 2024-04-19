export const metadataTableDDL = (): string => `
CREATE TABLE IF NOT EXISTS _metadata (
    attribute TEXT NOT NULL,
    value TEXT NOT NULL,
    PRIMARY KEY (attribute)
);
`;
