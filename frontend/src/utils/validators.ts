import { ValidationError } from '../classes/ValidationError';
import { CONTRACT_NAME_REGEX, WILD_CARD, WILD_CARD_REGEX } from '../constants/RegexExp';
import { FORMATTING_ERROR_TYPE, TYPE_GENERATION_ERROR_TYPE } from '../constants/Strings';
import { defaultSchema, formatIndexingCode, formatSQL } from './formatters';
import { PgSchemaTypeGen } from './pgSchemaTypeGen';

interface ValidationResult {
  data: string | null;
  error: ValidationError | null;
  location?: string;
}

interface FormatResult {
  data: string | null;
  error: ValidationError | null;
}

interface GenerateTypesResult {
  error: ValidationError | null;
  location?: string;
}

export const validateContractId = (accountId: string) => {
  accountId = accountId.trim();
  if (accountId === WILD_CARD) return true;

  const isLengthValid = accountId.length >= 2 && accountId.length <= 64;
  if (!isLengthValid) return false;

  //test if the string starts with a '*.' and remove it if it does
  const isWildCard = WILD_CARD_REGEX.test(accountId);
  accountId = isWildCard ? accountId.slice(2) : accountId;

  //test if rest of string is valid accounting for/not isWildCard
  const isRegexValid = CONTRACT_NAME_REGEX.test(accountId);
  return isRegexValid;
};

export const validateContractIds = (accountIds: string) => {
  const ids = accountIds.split(',').map((id) => id.trim());
  return ids.every((accountId) => validateContractId(accountId));
};

export function validateJSCode(code: string): { data: string | null; error: Error | null } {
  if (!code) return { data: null, error: null };

  try {
    const formattedCode = formatIndexingCode(code);
    return { data: formattedCode, error: null };
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error(error.message);
      return { data: code, error };
    } else {
      throw error;
    }
  }
}

export function validateSQLSchema(schema: string): ValidationResult {
  try {
    if (!schema || isDefaultSchema(schema)) return { data: null, error: null };
    const formattedSchemaResult = formatSchema(schema);
    if (formattedSchemaResult.error) return { data: formattedSchemaResult.data, error: formattedSchemaResult.error };

    const validationResult = generateTypes(formattedSchemaResult.data);
    if (validationResult.error)
      return { data: schema, error: validationResult.error, location: validationResult.location };

    return { data: formattedSchemaResult.data, error: null };
  } catch (error: any) {
    return { data: schema, error: new ValidationError(error.message, FORMATTING_ERROR_TYPE) };
  }
}

export const formatSchema = (schema: string): FormatResult => {
  try {
    const formattedSchema = formatSQL(schema);
    return { data: formattedSchema, error: null };
  } catch (error: any) {
    return {
      data: schema,
      error: new ValidationError(error.message, FORMATTING_ERROR_TYPE),
    };
  }
};

function generateTypes(formattedSchema: string | null): GenerateTypesResult {
  if (!formattedSchema) return { error: null };

  const pgSchemaTypeGen = new PgSchemaTypeGen();

  try {
    pgSchemaTypeGen.generateTypes(formattedSchema);
    return { error: null };
  } catch (error: any) {
    const location = error.location ? error.location : undefined;
    return {
      error: new ValidationError(error.message, TYPE_GENERATION_ERROR_TYPE, error.location),
      location: location,
    };
  }
}

export const isDefaultSchema = (schema: string): boolean => {
  return schema === formatSQL(defaultSchema);
};
