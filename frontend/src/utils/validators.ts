import { defaultSchema, formatIndexingCode, formatSQL } from "./formatters";
import { PgSchemaTypeGen } from "./pgSchemaTypeGen";
import { CONTRACT_NAME_REGEX, WILD_CARD_REGEX, WILD_CARD } from "../constants/RegexExp";
import { ValidationError } from '../classes/ValidationError';
import { FORMATTING_ERROR_TYPE, TYPE_GENERATION_ERROR_TYPE } from "../constants/Strings";

export const validateContractId = (accountId: string): boolean => {
  accountId = accountId.trim();
  if (accountId === WILD_CARD) return true;

  const isLengthValid = accountId.length >= 2 && accountId.length <= 64;
  if (!isLengthValid) return false;

  const isWildCard = WILD_CARD_REGEX.test(accountId);
  accountId = isWildCard ? accountId.slice(2) : accountId;

  const isRegexValid = CONTRACT_NAME_REGEX.test(accountId);
  return isRegexValid;
};

export const validateContractIds = (accountIds: string): boolean => {
  const ids = accountIds.split(',').map(id => id.trim());
  return ids.every(accountId => validateContractId(accountId));
};

export function validateSQLSchema(schema: string): { data: string | null, error: ValidationError | null } {
  if (!schema) return { data: null, error: null };
  if (schema === formatSQL(defaultSchema)) return { data: schema, error: null };

  const pgSchemaTypeGen = new PgSchemaTypeGen();
  let formattedSchema;

  try {
    formattedSchema = formatSQL(schema);
  } catch (error: any) {
    return { data: schema, error: new ValidationError(error.message, FORMATTING_ERROR_TYPE) };
  }

  if (formattedSchema) {
    try {
      pgSchemaTypeGen.generateTypes(formattedSchema);
      return { data: formattedSchema, error: null };
    } catch (error: any) {
      console.log(error);
      return { data: schema, error: new ValidationError(error.message, TYPE_GENERATION_ERROR_TYPE) };
    }
  }

  return { data: schema, error: null };
}

export function validateJSCode(code: string): { data: string | null, error: Error | null } {
  if (!code) return { data: null, error: null };

  try {
    const formattedCode = formatIndexingCode(code);
    return { data: formattedCode, error: null };
  } catch (error: any) {
    console.error(error.message);
    return { data: code, error };
  }
}

