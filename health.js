const HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff'
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: HEADERS });
}

export async function onRequestGet({ env }) {
  if (!env.DB) {
    return json({ ok: false, d1: 'not-bound', error: 'D1 binding DB is not configured.' }, 503);
  }

  try {
    const table = await env.DB.prepare(`
      SELECT name FROM sqlite_schema
      WHERE type = 'table' AND name = 'applications'
    `).first();

    if (!table) {
      return json({
        ok: false,
        d1: 'connected',
        schema: 'missing',
        error: 'The applications table does not exist. Run schema.sql.'
      }, 503);
    }

    const columnsResult = await env.DB.prepare('PRAGMA table_info(applications)').all();
    const columns = (columnsResult.results || []).map(row => row.name);
    const hasApplicationData = columns.includes('application_data');
    const hasStatus = columns.includes('status');

    if (!hasApplicationData || !hasStatus) {
      const basicSummary = await env.DB.prepare(`
        SELECT COUNT(*) AS total, MAX(created_at) AS latest_created_at
        FROM applications
      `).first();

      return json({
        ok: false,
        d1: 'connected',
        schema: 'upgrade-required',
        totalApplications: Number(basicSummary?.total || 0),
        latestCreatedAt: basicSummary?.latest_created_at || null,
        applicationDataColumn: hasApplicationData,
        statusColumn: hasStatus,
        error: 'Run migrations/0002_expand_long_application.sql once.'
      }, 503);
    }

    const summary = await env.DB.prepare(`
      SELECT COUNT(*) AS total,
             MAX(created_at) AS latest_created_at,
             SUM(CASE WHEN application_data IS NOT NULL AND application_data <> '{}' THEN 1 ELSE 0 END) AS full_application_rows
      FROM applications
    `).first();

    return json({
      ok: true,
      d1: 'connected',
      schema: 'ready',
      table: 'applications',
      totalApplications: Number(summary?.total || 0),
      fullApplicationRows: Number(summary?.full_application_rows || 0),
      latestCreatedAt: summary?.latest_created_at || null,
      applicationDataColumn: hasApplicationData,
      statusColumn: hasStatus,
      turnstileSiteKeyConfigured: Boolean(env.TURNSTILE_SITE_KEY),
      turnstileSecretConfigured: Boolean(env.TURNSTILE_SECRET_KEY),
      adminTokenConfigured: Boolean(env.ADMIN_TOKEN)
    });
  } catch (error) {
    console.error('D1 health check failed:', error);
    return json({ ok: false, d1: 'error', error: error.message || 'D1 query failed.' }, 500);
  }
}
