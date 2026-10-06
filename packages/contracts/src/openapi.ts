import type { JSONSchema } from 'json-schema-to-ts';
import {
  contractSchemas,
  routeContracts,
  type ContractSchemaName,
  type RouteContract,
} from './routes.js';
import { timestampSchema, uuidSchema, uuidV7Schema } from './transport.js';
import { createSchemaValidator } from './decode.js';

type Parameter = {
  name: string;
  in: 'path' | 'query' | 'header';
  required: boolean;
  schema: JSONSchema;
  description?: string;
};
function fields(schema: JSONSchema, location: Parameter['in']): Parameter[] {
  if (typeof schema === 'boolean') return [];
  return Object.entries(schema.properties ?? {}).map(([name, field]) => ({
    name,
    in: location,
    required: schema.required?.includes(name) ?? false,
    schema: field,
  }));
}
function reference(name: ContractSchemaName) {
  return { $ref: `#/components/schemas/${name}` };
}

function componentSchemas(): Readonly<Record<string, JSONSchema>> {
  const names = new Map<JSONSchema, ContractSchemaName>(
    Object.entries(contractSchemas).map(([name, schema]) => [
      schema,
      name as ContractSchemaName,
    ]),
  );
  function compact(schema: JSONSchema, root: JSONSchema): JSONSchema {
    if (typeof schema === 'boolean') return schema;
    const name = names.get(schema);
    if (name && schema !== root) return reference(name);
    return {
      ...schema,
      ...(schema.properties
        ? {
            properties: Object.fromEntries(
              Object.entries(schema.properties).map(([key, child]) => [
                key,
                compact(child, root),
              ]),
            ),
          }
        : {}),
      ...(schema.items !== undefined && !Array.isArray(schema.items)
        ? { items: compact(schema.items as JSONSchema, root) }
        : {}),
      ...(schema.anyOf
        ? { anyOf: schema.anyOf.map((child) => compact(child, root)) }
        : {}),
      ...(schema.oneOf
        ? { oneOf: schema.oneOf.map((child) => compact(child, root)) }
        : {}),
      ...(schema.allOf
        ? { allOf: schema.allOf.map((child) => compact(child, root)) }
        : {}),
      ...(schema.if ? { if: compact(schema.if, root) } : {}),
      ...(schema.then ? { then: compact(schema.then, root) } : {}),
      ...(schema.else ? { else: compact(schema.else, root) } : {}),
      ...(schema.not ? { not: compact(schema.not, root) } : {}),
      ...(typeof schema.additionalProperties === 'object'
        ? { additionalProperties: compact(schema.additionalProperties, root) }
        : {}),
    };
  }
  return Object.fromEntries(
    Object.entries(contractSchemas).map(([name, schema]) => [
      name,
      compact(schema, schema),
    ]),
  );
}
const pathIdentitySchemas: Readonly<Record<string, JSONSchema>> = {
  inventoryId: uuidSchema,
  productId: uuidSchema,
  saleId: uuidSchema,
  purchaseId: uuidSchema,
  operationId: uuidV7Schema,
  importId: uuidV7Schema,
  snapshotId: uuidV7Schema,
};
function parameters(route: RouteContract): Parameter[] {
  const result: Parameter[] = [];
  for (const match of route.path.matchAll(/\{([^}]+)\}/g)) {
    const name = match[1];
    if (!name) continue;
    const declared = route.params
      ? fields(contractSchemas[route.params], 'path').find(
          (parameter) => parameter.name === name,
        )?.schema
      : undefined;
    const schema =
      declared ??
      (name === 'index'
        ? ({
            type: 'integer',
            minimum: 0,
            maximum: Number.MAX_SAFE_INTEGER,
          } as const)
        : pathIdentitySchemas[name]);
    if (!schema) throw new Error(`Unclassified path parameter: ${name}`);
    result.push({ name, in: 'path', required: true, schema });
  }
  if (route.query)
    result.push(...fields(contractSchemas[route.query], 'query'));
  if (route.command || route.idempotency)
    result.push({
      name: 'Idempotency-Key',
      in: 'header',
      required: true,
      schema: uuidV7Schema,
      description: route.command
        ? 'Must equal body.operationId. Receipt and same-key retry behavior will be implemented in API-01.'
        : 'Stable UUIDv7 for the same request intention; future implementation owns receipt behavior.',
    });
  return result;
}
function operation(route: RouteContract) {
  const mutation = route.method !== 'get';
  const publicRoute = route.auth === 'public';
  const security = publicRoute
    ? []
    : [
        { SessionCookie: [], ...(mutation ? { CsrfToken: [] } : {}) },
        { SecureSessionCookie: [], ...(mutation ? { CsrfToken: [] } : {}) },
      ];
  return {
    operationId: route.operationId,
    summary: route.summary,
    'x-stockapp-implementation-status': route.implementationStatus,
    'x-stockapp-auth-level': route.auth,
    ...(route.auth.startsWith('recent-')
      ? { 'x-stockapp-session-max-age-seconds': 300 }
      : {}),
    ...(route.command
      ? {
          'x-stockapp-command-contract':
            'Path identifiers must match payload identifiers. Preconditions and expected results are evidence; Domain derives authoritative financial state.',
        }
      : {}),
    security,
    parameters: parameters(route),
    ...(route.body
      ? {
          requestBody: {
            required: true,
            content: { 'application/json': { schema: reference(route.body) } },
          },
        }
      : {}),
    responses: Object.fromEntries(
      Object.entries(route.responses).map(([status, schema]) => [
        status,
        {
          description:
            Number(status) < 400 ? 'Successful result' : 'Sanitized API error',
          headers: {
            'X-Request-Id': {
              description: 'Server-generated correlation identifier',
              schema: { type: 'string' },
            },
            ...(route.path.startsWith('/v1/')
              ? {
                  'Cache-Control': {
                    schema: { type: 'string', const: 'no-store' },
                  },
                }
              : {}),
            ...(status === '429'
              ? {
                  'Retry-After': {
                    description: 'Delay in seconds',
                    schema: { type: 'string', pattern: '^[0-9]+$' },
                  },
                }
              : {}),
          },
          content: { 'application/json': { schema: reference(schema) } },
        },
      ]),
    ),
  };
}

export function generateOpenApi() {
  const paths: Record<
    string,
    Partial<Record<RouteContract['method'], ReturnType<typeof operation>>>
  > = {};
  for (const route of routeContracts) {
    const path = paths[route.path] ?? {};
    if (path[route.method]) throw new Error('Duplicate route contract.');
    path[route.method] = operation(route);
    paths[route.path] = path;
  }
  return {
    openapi: '3.1.1',
    jsonSchemaDialect: 'https://json-schema.org/draft/2020-12/schema',
    info: {
      title: 'StockApp API',
      version: '1',
      description:
        'V1 target contract and existing local routes. Planned operations are unavailable. No deployment is asserted. /api/auth/* is owned separately by Better Auth 1.7.7, including email/password and official session responses.',
    },
    'x-stockapp-auth-contract': {
      path: '/api/auth/*',
      owner: 'Better Auth',
      version: '1.7.7',
      deleteUserEnabled: false,
    },
    paths,
    components: {
      securitySchemes: {
        SessionCookie: {
          type: 'apiKey',
          in: 'cookie',
          name: 'better-auth.session_token',
          description:
            'Official opaque Better Auth cookie in local HTTP. HttpOnly, SameSite=Lax, no JWT bearer.',
        },
        SecureSessionCookie: {
          type: 'apiKey',
          in: 'cookie',
          name: '__Secure-better-auth.session_token',
          description:
            'Official opaque Better Auth cookie when secureCookies=true; Secure and HttpOnly.',
        },
        CsrfToken: {
          type: 'apiKey',
          in: 'header',
          name: 'X-CSRF-Token',
          description:
            'Session-bound token from GET /v1/session/csrf, required for /v1 mutations.',
        },
      },
      schemas: componentSchemas(),
    },
  };
}

export function validateContractRegistry(): void {
  const operations = new Set<string>();
  const routes = new Set<string>();
  for (const route of routeContracts) {
    if (
      operations.has(route.operationId) ||
      routes.has(`${route.method} ${route.path}`)
    )
      throw new Error('Duplicate operation identity or route.');
    operations.add(route.operationId);
    routes.add(`${route.method} ${route.path}`);
    if (
      !route.path.startsWith('/') ||
      Object.keys(route.responses).length === 0
    )
      throw new Error('Invalid route contract.');
    if (
      route.command &&
      (!route.body || route.implementationStatus !== 'planned')
    )
      throw new Error('Invalid command route boundary.');
  }
  for (const schema of Object.values(contractSchemas))
    createSchemaValidator(schema);
  // Validates the generated document's own schema references without remote/network resolution.
  const document = generateOpenApi();
  function visit(value: unknown): void {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (typeof value !== 'object' || value === null) return;
    if ('$ref' in value) {
      const ref = value.$ref;
      if (
        typeof ref !== 'string' ||
        !ref.startsWith('#/components/schemas/') ||
        !(ref.slice('#/components/schemas/'.length) in contractSchemas)
      )
        throw new Error('Unresolved contract schema reference.');
    }
    Object.values(value).forEach(visit);
  }
  visit(document);
  createSchemaValidator(timestampSchema);
}

export function serializeOpenApi(): string {
  validateContractRegistry();
  return `${JSON.stringify(generateOpenApi(), null, 2)}\n`;
}

export function assertOpenApiCurrent(current: string): void {
  if (current !== serializeOpenApi())
    throw new Error(
      'OpenAPI is stale. Run pnpm contracts:openapi and commit the result.',
    );
}
