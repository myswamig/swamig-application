const headers = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store'
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers });
}

function authorized(request, env) {
  if (!env.ADMIN_TOKEN) return false;
  const value = request.headers.get('Authorization') || '';
  return value === `Bearer ${env.ADMIN_TOKEN}`;
}

export async function onRequestGet({ request, env }) {
  if (!env.ADMIN_TOKEN) return json({ error: 'ADMIN_TOKEN is not configured for this deployment.' }, 503);
  if (!authorized(request, env)) return json({ error: 'Unauthorized.' }, 401);
  if (!env.DB) return json({ error: 'D1 binding DB is not configured.' }, 503);

  const url = new URL(request.url);
  const requestedLimit = Number.parseInt(url.searchParams.get('limit') || '50', 10);
  const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 100) : 50;

  try {
    const result = await env.DB.prepare(`
      SELECT submission_id, legal_name, preferred_name, email, phone,
             interest, message, created_at
      FROM applications
      ORDER BY id DESC
      LIMIT ?
    `).bind(limit).all();

    const applications = result.results || [];
    return json({ count: applications.length, applications });
  } catch (error) {
    console.error('Unable to list applications:', error);
    return json({ error: 'Unable to query applications. Confirm that schema.sql has been run.' }, 500);
  }
}
