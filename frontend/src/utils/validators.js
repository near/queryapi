import { formatSQL } from "./formatters";
import { PgSchemaTypeGen } from "./pgSchemaTypeGen";
import { CONTRACT_NAME_REGEX } from '../constants/RegexExp';

export function validateContractId(accountId) {
  return (
    accountId.length >= 2 &&
    accountId.length <= 64 &&
    CONTRACT_NAME_REGEX.test(accountId)
  );
}

export function validateContractIds(accountIds) {
  const ids = accountIds.split(',').map(id => id.trim());
  return ids.every(accountId => validateContractId(accountId));
}

/**
 * Validates formatting and type generation from a SQL schema.
 *
 * @param {string} schema - The SQL schema to validate and format.
 * @returns {{ data: string | null, error: string | null }} - An object containing the formatted schema and error (if any).
 */
export async function validateSQLSchema(schema) {
  const pgSchemaTypeGen = new PgSchemaTypeGen();

  try {
    const formattedSchema = await formatSQL(schema);
    pgSchemaTypeGen.generateTypes(formattedSchema); // Sanity check

    return { data: formattedSchema, error: null }
  } catch (error) {

    console.error(error.message)
    return { data: schema, error };
  }
};