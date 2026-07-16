const headers = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store'
};

export async function onRequestGet({ env }) {
  if (!env.DB) {
    return new Response(JSON.stringify({
      ok: false,
      d1: 'not-bound',
      error: 'Add a D1 binding named DB to this Pages project.'
    }), { status: 503, headers });
  }

  try {
    await env.DB.prepare('SELECT 1 AS connected').first();
    const countRow = await env.DB.prepare('SELECT COUNT(*) AS count FROM applications').first();
    return new Response(JSON.stringify({
      ok: true,
      d1: 'connected',
      table: 'applications',
      applicationCount: Number(countRow?.count || 0),
      checkedAt: new Date().toISOString()
    }), { status: 200, headers });
  } catch (error) {
    return new Response(JSON.stringify({
      ok: false,
      d1: 'binding-found-but-query-failed',
      error: 'Run schema.sql against the bound database, then redeploy.',
      detail: error.message
    }), { status: 500, headers });
  }
}
