import type { StaffUser } from '@conciergeiq/contracts';
import type { FastifyInstance } from 'fastify';

export interface ApiResponse {
  status: number;
  // Tests read whatever fields they assert on, so the body is deliberately loosely typed.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any;
  headers: Record<string, unknown>;
}

/** Calls the API as one signed-in staff member. Paths are relative to /api/v1. */
export class StaffClient {
  constructor(
    private readonly server: FastifyInstance,
    readonly user: StaffUser,
    readonly accessToken: string,
    readonly refreshToken: string,
  ) {}

  get(path: string, query?: Record<string, string>): Promise<ApiResponse> {
    return this.send('GET', path, undefined, query);
  }

  post(path: string, body: object = {}): Promise<ApiResponse> {
    return this.send('POST', path, body);
  }

  patch(path: string, body: object): Promise<ApiResponse> {
    return this.send('PATCH', path, body);
  }

  delete(path: string): Promise<ApiResponse> {
    return this.send('DELETE', path);
  }

  private async send(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    body?: object,
    query?: Record<string, string>,
  ): Promise<ApiResponse> {
    const response = await this.server.inject({
      method,
      url: `/api/v1${path}`,
      query,
      payload: body,
      headers: { authorization: `Bearer ${this.accessToken}` },
    });
    return { status: response.statusCode, body: parseBody(response.body), headers: response.headers };
  }
}

/** Calls the API without signing in. */
export async function callAnonymously(
  server: FastifyInstance,
  method: 'GET' | 'POST',
  path: string,
  body?: object,
): Promise<ApiResponse> {
  const response = await server.inject({ method, url: `/api/v1${path}`, payload: body });
  return { status: response.statusCode, body: parseBody(response.body), headers: response.headers };
}

function parseBody(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}
