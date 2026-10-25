export interface AdminClient {
  graphql(
    query: string,
    options?: { variables?: Record<string, unknown> },
  ): Promise<Response>;
}

export class AdminError extends Error {
  constructor(
    message: string,
    readonly userErrors?: { field?: string[] | null; message: string }[],
  ) {
    super(message);
    this.name = 'AdminError';
  }
}

const MAX_ATTEMPTS = 3;
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

interface GqlError {
  message?: string;
  extensions?: { code?: string };
}

type GqlBody<T> = { data?: T | null; errors?: GqlError[]; message?: string };

/**
 * The real admin client throws GraphqlQueryError on top-level errors, with
 * `body.errors.graphQLErrors` holding them (shopify-api throwFailedRequest).
 */
function thrownBody<T>(e: unknown): GqlBody<T> | null {
  const body = (e as { body?: { data?: T | null; errors?: { graphQLErrors?: unknown } } } | null)?.body;
  const errors = body?.errors?.graphQLErrors;
  return Array.isArray(errors) && errors.length ? { data: body?.data, errors: errors as GqlError[] } : null;
}

async function send<T>(
  admin: AdminClient,
  query: string,
  variables?: Record<string, unknown>,
): Promise<GqlBody<T>> {
  let response: Response;
  try {
    response = await admin.graphql(query, variables ? { variables } : undefined);
  } catch (e) {
    const body = thrownBody<T>(e);
    if (body) return body;
    throw e;
  }
  try {
    return (await response.json()) as GqlBody<T>;
  } catch {
    throw new AdminError(`Shopify returned a non-JSON response (HTTP ${response.status}).`);
  }
}

/**
 * Runs one Admin GraphQL operation and returns its `data`.
 * Throws AdminError on top-level `errors`, whether returned or thrown by the client;
 * a THROTTLED error waits 1000 x attempt ms and retries (3 attempts).
 * `wait` is injectable so tests do not sleep.
 */
export async function gql<T>(
  admin: AdminClient,
  query: string,
  variables?: Record<string, unknown>,
  wait: (ms: number) => Promise<void> = sleep,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    const body = await send<T>(admin, query, variables);
    if (!body?.errors?.length) {
      if (body?.data == null) {
        const detail = typeof body?.message === 'string' ? `: ${body.message}` : '';
        throw new AdminError(`Shopify returned no data${detail}`);
      }
      return body.data;
    }

    const throttled = body.errors.some((e) => e.extensions?.code === 'THROTTLED');
    if (throttled && attempt < MAX_ATTEMPTS) {
      await wait(1000 * attempt);
      continue;
    }
    throw new AdminError(body.errors.map((e) => e.message ?? 'Unknown error').join('; '));
  }
}
