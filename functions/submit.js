const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store'
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function clean(value, maxLength = 500) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

async function readPayload(request) {
  const contentType = request.headers.get('content-type') || '';
  if (contentType.includes('application/json')) return request.json();
  return Object.fromEntries((await request.formData()).entries());
}

async function verifyTurnstile(request, env, token) {
  if (!env.TURNSTILE_SECRET_KEY) return { success: true, skipped: true };
  if (!token) return { success: false, reason: 'Please complete the security check.' };

  const formData = new FormData();
  formData.append('secret', env.TURNSTILE_SECRET_KEY);
  formData.append('response', token);
  const ip = request.headers.get('CF-Connecting-IP');
  if (ip) formData.append('remoteip', ip);

  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: formData
  });
  const outcome = await response.json();
  return outcome.success ? { success: true } : { success: false, reason: 'Security verification failed. Please try again.' };
}

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.DB) return json({ error: 'D1 binding DB is not configured.' }, 503);

  try {
    const payload = await readPayload(request);

    // Quietly accept likely bot submissions without storing them.
    if (clean(payload.website, 200)) {
      return json({ ok: true, submissionId: 'received' });
    }

    const legalName = clean(payload.legal_name, 120);
    const preferredName = clean(payload.preferred_name, 160);
    const email = clean(payload.email, 254).toLowerCase();
    const phone = clean(payload.phone, 40);
    const interest = clean(payload.interest, 160);
    const message = clean(payload.message, 2000);
    const consent = clean(payload.consent, 10);
    const turnstileToken = clean(payload['cf-turnstile-response'], 2048);

    if (!legalName) return json({ error: 'Legal name is required.' }, 400);
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'A valid email address is required.' }, 400);
    if (consent !== 'yes') return json({ error: 'Consent is required before submission.' }, 400);

    const turnstile = await verifyTurnstile(request, env, turnstileToken);
    if (!turnstile.success) return json({ error: turnstile.reason }, 403);

    const submissionId = crypto.randomUUID();
    const country = clean(request.cf?.country || '', 8);

    await env.DB.prepare(`
      INSERT INTO applications (
        submission_id, legal_name, preferred_name, email, phone,
        interest, message, consent, country
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
    `).bind(
      submissionId,
      legalName,
      preferredName,
      email,
      phone,
      interest,
      message,
      country
    ).run();

    return json({
      ok: true,
      message: 'Application received and saved to D1.',
      submissionId
    }, 201);
  } catch (error) {
    console.error('Application submission failed:', error);
    return json({ error: 'The application could not be saved. Check the D1 binding and database schema.' }, 500);
  }
}

export function onRequestGet() {
  return json({ error: 'Use POST to submit an application.' }, 405);
}
