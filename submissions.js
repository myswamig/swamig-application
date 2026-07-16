const HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff'
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: HEADERS });
}

function bearerToken(request) {
  const value = request.headers.get('Authorization') || '';
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

async function digest(value) {
  const bytes = new TextEncoder().encode(value);
  return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
}

async function tokenMatches(provided, expected) {
  if (!provided || !expected) return false;
  const [a, b] = await Promise.all([digest(provided), digest(expected)]);
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i += 1) difference |= a[i] ^ b[i];
  return difference === 0;
}

function parseStoredJson(value) {
  if (!value) return {};
  try { return JSON.parse(value); } catch { return { _raw: value, _parse_error: true }; }
}

export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ error: 'D1 binding DB is not configured.' }, 503);
  if (!env.ADMIN_TOKEN) return json({ error: 'ADMIN_TOKEN is not configured.' }, 503);
  if (!(await tokenMatches(bearerToken(request), env.ADMIN_TOKEN))) {
    return json({ error: 'Unauthorized.' }, 401);
  }

  const url = new URL(request.url);
  const requestedLimit = Number.parseInt(url.searchParams.get('limit') || '50', 10);
  const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 100) : 50;

  try {
    const result = await env.DB.prepare(`
      SELECT id, submission_id, legal_name, preferred_name, email, phone,
             interest, message, consent, country, status, application_data, created_at
      FROM applications
      ORDER BY id DESC
      LIMIT ?
    `).bind(limit).all();

    const applications = (result.results || []).map(row => ({
      ...row,
      application_data: parseStoredJson(row.application_data)
    }));

    return json({ ok: true, count: applications.length, applications });
  } catch (error) {
    console.error('Admin submissions query failed:', error);
    return json({ error: error.message || 'Unable to load applications.' }, 500);
  }
}
