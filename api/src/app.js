import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { createErrorHandler, notFoundHandler } from './http/middleware/error-handler.js';
import { createRouter } from './http/routes/index.js';

/**
 * Express application factory.
 *
 * Everything it needs is injected (config, controllers, middleware), which keeps this file about
 * *HTTP concerns only*: security headers, CORS, body parsing, routing, error translation. No SQL, no
 * business rules.
 *
 * @param {{ config: object, controllers: object, middleware: object, logger?: Console }} deps
 * @returns {import('express').Express}
 */
export function createApp({ config, controllers, middleware, logger = console }) {
  const app = express();

  // Don't advertise the framework; helmet already strips the rest of the fingerprint headers.
  app.disable('x-powered-by');
  app.use(helmet());

  // `*` (or a comma separated list) keeps local development and preview deployments easy while still
  // refusing browser requests from unknown origins in production, where CORS_ORIGIN is set.
  const origins = config.corsOrigin === '*' ? true : config.corsOrigin.split(',').map((o) => o.trim());
  app.use(
    cors({
      origin: origins,
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      maxAge: 600,
    }),
  );

  // Small limit: every request body in this API is a handful of fields, so a large payload is either
  // a mistake or an attack. Malformed JSON is turned into a 400 by the error handler.
  app.use(express.json({ limit: '16kb' }));

  app.use('/api/v1', createRouter({ controllers, middleware }));

  app.use(notFoundHandler);
  app.use(createErrorHandler({ logger }));

  return app;
}
