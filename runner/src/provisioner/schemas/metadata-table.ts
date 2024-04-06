export const metadataTableDDL = (): string => `
CREATE TABLE IF NOT EXISTS __metadata (
    instance TEXT NOT NULL,
    attribute TEXT NOT NULL,
    value TEXT NOT NULL,
    PRIMARY KEY (instance, attribute)
);
`;
