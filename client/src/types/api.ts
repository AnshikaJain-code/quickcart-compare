/** Standard error body returned by every API error (see CLAUDE.md "API"). */
export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

export interface HealthResponse {
  status: 'ok';
  version: string;
}
