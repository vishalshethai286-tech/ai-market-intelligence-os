import { QUERY_CATEGORIES, MAX_QUERIES_PER_CATEGORY } from "./constants";

/** Shape of a single generated query, validated against buildQueryGeneratorJsonSchema(). */
export type GeneratedQuery = { query: string; basedOn: string };

/** Keyed by each category's `key` (see QUERY_CATEGORIES), e.g. `{ targetCustomers: [...] }`. */
export type GeneratedQueriesByCategory = Record<string, GeneratedQuery[]>;

/**
 * Builds the `output_config.format` JSON Schema for a query-generation run —
 * one array property per category in `QUERY_CATEGORIES`, each holding
 * `{ query, basedOn }` objects.
 */
export function buildQueryGeneratorJsonSchema() {
  const properties: Record<string, unknown> = {};

  for (const { key, description } of QUERY_CATEGORIES) {
    properties[key] = {
      type: "array",
      items: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "A realistic, specific search-engine query string a salesperson could actually type.",
          },
          basedOn: {
            type: "string",
            description: 'Which given fact(s) this query is grounded in, e.g. "Industry: Manufacturing".',
          },
        },
        required: ["query", "basedOn"],
        additionalProperties: false,
      },
      description: `${description} Return at most ${MAX_QUERIES_PER_CATEGORY}. Return an empty array if there isn't enough given information to ground a query for this category — never invent facts not provided.`,
    };
  }

  return {
    type: "object",
    properties,
    required: QUERY_CATEGORIES.map((c) => c.key),
    additionalProperties: false,
  } as const;
}
