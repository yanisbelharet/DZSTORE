import type { APIRoute } from 'astro';

/** Liveness probe (no store, no API call). */
export const GET: APIRoute = () =>
  new Response(JSON.stringify({ status: 'ok' }), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
