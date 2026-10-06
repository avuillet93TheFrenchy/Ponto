// Local types (no @cloudflare/workers-types) so the root `tsc` can check the Worker.
export interface Env {
  ASSETS: { fetch(req: Request): Promise<Response> };
  RATE_LIMITER?: { limit(o: { key: string }): Promise<{ success: boolean }> };
}
