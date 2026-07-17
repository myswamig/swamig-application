const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff'
};

const MAX_REQUEST_BYTES = 40_000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders }
  });
}

function firstValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function cleanText(value, maxLength = 500) {
  const scalar = firstValue(value);
  if (typeof scalar !== 'string') return '';
  return scalar.trim().slice(0, maxLength);
}

function formDataToObject(formData) {
  const result = {};

  for (const [key, value] of formData.entries()) {
    if (typeof value !== 'string') continue;

    if (Object.prototype.hasOwnProperty.call(result, key)) {
      if (!Array.isArray(result[key])) result[key] = [result[key]];
      result[key].push(value);
    } else {
      result[key] = value;
    }
  }

  return result;
}

async function readPayload(request) {
  const contentType = request.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('INVALID_PAYLOAD');
    }
    return parsed;
  }

  if (
    contentType.includes('application/x-www-form-urlencoded') ||
    contentType.includes('multipart/form-data')
  ) {
    return formDataToObject(await request.formData());
  }

  throw new Error('UNSUPPORTED_CONTENT_TYPE');
}

function requireText(value, label, maxLength) {
  const cleaned = cleanText(value, maxLength);
  if (!cleaned) throw new Error(`REQUIRED:${label}`);
  return cleaned;
}

async function verifyTurnstile(request, env, token) {
  if (!env.TURNSTILE_SECRET_KEY) {
    return {
      success: false,
      status: 503,
      reason: 'Security verification is not configured on the server.'
    };
  }

  if (!token) {
    return {
      success: false,
      status: 403,
      reason: 'Please complete the security verification.'
    };
  }

  const data = new FormData();
  data.append('secret', env.TURNSTILE_SECRET_KEY);
  data.append('response', token);
  data.append('idempotency_key', crypto.randomUUID());

  const remoteIp = request.headers.get('CF-Connecting-IP');
  if (remoteIp) data.append('remoteip', remoteIp);

  try {
    const response = await fetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      { method: 'POST', body: data }
    );
    const result = await response.json();

    if (!response.ok || !result?.success) {
      console.warn('Turnstile rejected request:', result?.['error-codes'] || []);
      return {
        success: false,
        status: 403,
        reason: 'Security verification failed. Refresh the page and try again.'
      };
    }

    const expectedHostname = cleanText(env.TURNSTILE_EXPECTED_HOSTNAME, 255);
    if (expectedHostname && result.hostname !== expectedHostname) {
      console.warn('Turnstile hostname mismatch:', {
        expected: expectedHostname,
        received: result.hostname
      });
      return {
        success: false,
        status: 403,
        reason: 'Security verification was issued for the wrong website.'
      };
    }

    return { success: true };
  } catch (error) {
    console.error('Turnstile verification failed:', error);
    return {
      success: false,
      status: 503,
      reason: 'Security verification is temporarily unavailable.'
    };
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.DB) {
    return json({ error: 'D1 binding DB is not configured.' }, 503);
  }

  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > MAX_REQUEST_BYTES) {
    return json({ error: 'The request is too large to process.' }, 413);
  }

  try {
    const payload = await readPayload(request);

    // Honeypot: quietly discard obvious automated submissions.
    if (cleanText(payload.website, 200)) {
      return json({ ok: true, submissionId: 'received' }, 201);
    }

    const legalName = requireText(payload.legal_name, 'Full name', 120);
    const preferredName = cleanText(payload.preferred_name, 120);
    const email = requireText(payload.email, 'Email', 254).toLowerCase();
    const phone = cleanText(payload.phone, 40);
    const contactMethod = requireText(payload.contact_method, 'Preferred contact method', 40);
    const country = cleanText(payload.country, 100);
    const interest = requireText(payload.interest, 'Divination service', 160);
    const concernArea = requireText(payload.concern_area, 'Primary area', 160);
    const sessionFormat = cleanText(payload.session_format, 80);
    const message = requireText(payload.message, 'Main divination matter', 2500);
    const availability = cleanText(payload.availability, 300);
    const guidanceAcknowledgment = cleanText(payload.guidance_acknowledgment, 10);
    const consent = cleanText(payload.consent, 10);
    const turnstileToken = cleanText(payload['cf-turnstile-response'], 2048);

    if (!EMAIL_PATTERN.test(email)) {
      return json({ error: 'Enter a valid email address.' }, 400);
    }

    if (guidanceAcknowledgment !== 'yes' || consent !== 'yes') {
      return json({ error: 'Both agreements must be accepted.' }, 400);
    }

    const turnstile = await verifyTurnstile(request, env, turnstileToken);
    if (!turnstile.success) {
      return json({ error: turnstile.reason }, turnstile.status);
    }

    const submissionId = crypto.randomUUID();
    const submittedAt = new Date().toISOString();

    const applicationData = JSON.stringify({
      form_version: 'SGI-DIVINATION-2026-07',
      request_type: 'Divination Service',
      submitted_at: submittedAt,
      applicant: {
        legal_name: legalName,
        preferred_name: preferredName,
        email,
        phone,
        contact_method: contactMethod,
        country
      },
      divination_request: {
        service: interest,
        concern_area: concernArea,
        main_matter: message,
        preferred_session_format: sessionFormat,
        availability
      },
      agreements: {
        spiritual_guidance_acknowledgment: true,
        storage_and_follow_up_consent: true
      },
      submission_metadata: {
        network_country: cleanText(request.cf?.country || '', 8),
        user_agent: cleanText(request.headers.get('user-agent') || '', 500)
      }
    });

    const result = await env.DB.prepare(`
      INSERT INTO applications (
        submission_id,
        legal_name,
        preferred_name,
        email,
        phone,
        interest,
        message,
        consent,
        country,
        application_data
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).bind(
      submissionId,
      legalName,
      preferredName,
      email,
      phone,
      interest,
      message,
      country,
      applicationData
    ).run();

    if (!result.success) {
      throw new Error('D1_INSERT_FAILED');
    }

    return json({
      ok: true,
      message: 'Divination request received and saved.',
      submissionId
    }, 201);
  } catch (error) {
    if (typeof error?.message === 'string' && error.message.startsWith('REQUIRED:')) {
      const label = error.message.slice('REQUIRED:'.length);
      return json({ error: `${label} is required.` }, 400);
    }

    if (error?.message === 'INVALID_PAYLOAD') {
      return json({ error: 'The submitted data is invalid.' }, 400);
    }

    if (error?.message === 'UNSUPPORTED_CONTENT_TYPE') {
      return json({ error: 'Unsupported submission format.' }, 415);
    }

    console.error('Divination request failed:', error);
    return json({
      error: 'The divination request could not be saved. Confirm that the D1 application_data migration has been run.'
    }, 500);
  }
}

export function onRequestGet() {
  return json(
    { error: 'Use POST to submit a divination request.' },
    405,
    { Allow: 'POST' }
  );
}
