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

/**
 * Runs one Admin GraphQL operation and returns its `data`.
 * Throws AdminError on top-level `errors`; a THROTTLED error waits 1000 x attempt ms and retries (3 attempts).
 * `wait` is injectable so tests do not sleep.
 */
export async function gql<T>(
  admin: AdminClient,
  query: string,
  variables?: Record<string, unknown>,
  wait: (ms: number) => Promise<void> = sleep,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    const response = await admin.graphql(query, variables ? { variables } : undefined);
    let body: { data?: T | null; errors?: GqlError[]; message?: string };
    try {
      body = (await response.json()) as typeof body;
    } catch {
      throw new AdminError(`Shopify returned a non-JSON response (HTTP ${response.status}).`);
    }
    if (!body?.errors?.length) {
      if (body?.data == null) {
        const detail = typeof body?.message === 'string' ? `: ${body.message}` : '';
        throw new AdminError(`Shopify returned no data (HTTP ${response.status})${detail}`);
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
