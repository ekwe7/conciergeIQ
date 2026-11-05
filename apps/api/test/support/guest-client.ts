import type { FastifyInstance } from 'fastify';
import type { ApiResponse } from './staff-client.js';

function parseBody(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/**
 * Guest HTTP client executing authenticated requests against /api/v1 as a verified guest.
 */
export class GuestClient {
  constructor(
    private readonly server: FastifyInstance,
    readonly token: string
  ) {}

  get(path: string, query?: Record<string, string>): Promise<ApiResponse> {
    return this.send('GET', path, undefined, query);
  }

  post(
    path: string,
    body?: object,
    headers?: Record<string, string>
  ): Promise<ApiResponse> {
    return this.send('POST', path, body, undefined, headers);
  }

  private async send(
    method: 'GET' | 'POST',
    path: string,
    body?: object,
    query?: Record<string, string>,
    extraHeaders?: Record<string, string>
  ): Promise<ApiResponse> {
    const response = await this.server.inject({
      method,
      url: `/api/v1${path}`,
      query,
      payload: body,
      headers: {
        authorization: `Bearer ${this.token}`,
        ...extraHeaders,
      },
    });

    return {
      status: response.statusCode,
      body: parseBody(response.body),
      headers: response.headers,
    };
  }
}
