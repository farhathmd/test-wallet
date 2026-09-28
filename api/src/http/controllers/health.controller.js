/**
 * Liveness / readiness probe.
 *
 * It touches the database on purpose: an API that answers but cannot reach Postgres is not usable,
 * and a container orchestrator should restart or stop routing to it rather than serve 500s.
 *
 * @param {{ pool: import('pg').Pool }} dependencies
 */
export function createHealthController({ pool }) {
  return {
    /** GET /health → 200 when the API and its database respond, 503 otherwise. */
    async check(_req, res) {
      const base = { uptime_seconds: Math.round(process.uptime()) };
      try {
        await pool.query('SELECT 1');
        res.status(200).json({ status: 'ok', db: 'up', ...base });
      } catch {
        res.status(503).json({ status: 'degraded', db: 'down', ...base });
      }
    },
  };
}
