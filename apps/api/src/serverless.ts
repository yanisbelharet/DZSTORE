// Serverless entry point (test environment on Vercel, ADR-0013): same app as the Node server.
import type { IncomingMessage, ServerResponse } from 'node:http';

import type { App } from './app.ts';
import { createRuntime } from './bootstrap.ts';

export type NodeHandler = (request: IncomingMessage, response: ServerResponse) => Promise<void>;

/** Builds the app lazily once per instance and forwards raw Node requests to it. */
export function createServerlessHandler(getApp: () => Promise<App>): NodeHandler {
  let ready: Promise<App> | undefined;
  return async (request, response) => {
    ready ??= getApp().then(async (app) => {
      await app.ready();
      return app;
    });
    try {
      const app = await ready;
      app.server.emit('request', request, response);
    } catch {
      ready = undefined; // retry initialization on the next invocation
      response.statusCode = 503;
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ status: 'unavailable' }));
    }
  };
}

export default createServerlessHandler(async () => (await createRuntime()).app);
