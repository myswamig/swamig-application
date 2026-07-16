const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff'
};

const MAX_REQUEST_BYTES = 150_000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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

function cleanList(value, maxItems = 30, maxItemLength = 160) {
  const values = Array.isArray(value)
    ? value
    : typeof value === 'string' && value
      ? [value]
      : [];

  return [...new Set(
    values
      .filter(item => typeof item === 'string')
      .map(item => item.trim().slice(0, maxItemLength))
      .filter(Boolean)
  )].slice(0, maxItems);
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

async function verifyTurnstile(request, env, token) {
  if (!env.TURNSTILE_SECRET_KEY) {
    return {
      success: false,
      status: 503,
      reason: 'Turnstile is not configured on the server.'
    };
  }

  if (!token) {
    return {
      success: false,
      status: 403,
      reason: 'Please complete the security check.'
    };
  }

  const verificationData = new FormData();
  verificationData.append('secret', env.TURNSTILE_SECRET_KEY);
  verificationData.append('response', token);
  verificationData.append('idempotency_key', crypto.randomUUID());

  const remoteIp = request.headers.get('CF-Connecting-IP');
  if (remoteIp) verificationData.append('remoteip', remoteIp);

  let response;
  let outcome;

  try {
    response = await fetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      { method: 'POST', body: verificationData }
    );
    outcome = await response.json();
  } catch (error) {
    console.error('Turnstile Siteverify request failed:', error);
    return {
      success: false,
      status: 503,
      reason: 'The security check could not be verified. Please try again.'
    };
  }

  if (!response.ok || !outcome?.success) {
    console.warn('Turnstile rejected a submission:', outcome?.['error-codes'] || []);
    return {
      success: false,
      status: 403,
      reason: 'Security verification failed. Please refresh the page and try again.'
    };
  }

  const expectedHostname = cleanText(env.TURNSTILE_EXPECTED_HOSTNAME, 255);
  if (expectedHostname && outcome.hostname !== expectedHostname) {
    console.warn('Turnstile hostname mismatch:', {
      expected: expectedHostname,
      received: outcome.hostname
    });
    return {
      success: false,
      status: 403,
      reason: 'Security verification was issued for the wrong website.'
    };
  }

  return { success: true };
}

function requireText(value, label, maxLength) {
  const cleaned = cleanText(value, maxLength);
  if (!cleaned) throw new Error(`REQUIRED:${label}`);
  return cleaned;
}

function hasEvery(list, requiredValues) {
  return requiredValues.every(value => list.includes(value));
}

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.DB) {
    return json({ error: 'D1 binding DB is not configured.' }, 503);
  }

  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > MAX_REQUEST_BYTES) {
    return json({ error: 'The application is too large to process.' }, 413);
  }

  try {
    const payload = await readPayload(request);

    // Honeypot: return a normal-looking success response but do not store the entry.
    if (cleanText(payload.website, 200)) {
      return json({ ok: true, submissionId: 'received' }, 201);
    }

    const legalName = requireText(payload.legal_name, 'Legal name', 120);
    const preferredName = cleanText(payload.preferred_name, 160);
    const nameMeaning = cleanText(payload.name_meaning, 300);
    const email = requireText(payload.email, 'Email address', 254).toLowerCase();
    const phone = requireText(payload.phone, 'Telephone number', 40);
    const city = requireText(payload.city, 'City', 100);
    const stateRegion = requireText(payload.state_region, 'State or region', 100);
    const applicantCountry = requireText(payload.applicant_country, 'Country', 100);
    const timezone = requireText(payload.timezone, 'Time zone', 100);
    const contactMethod = requireText(payload.contact_method, 'Preferred contact method', 40);
    const ageConfirmed = cleanText(payload.age_confirmed, 10);

    const currentPath = cleanText(payload.current_path, 300);
    const yearsPractice = cleanText(payload.years_practice, 80);
    const initiations = cleanList(payload.initiations, 20, 120);
    const initiationDetails = cleanText(payload.initiation_details, 3000);
    const divinationSystems = cleanList(payload.divination_systems, 20, 120);
    const trainingDetails = cleanText(payload.training_details, 3500);
    const dailyPractice = cleanText(payload.daily_practice, 2500);

    const interest = requireText(payload.interest, 'Primary area of interest', 160);
    const additionalInterests = cleanList(payload.additional_interests, 20, 160);
    const message = requireText(payload.message, 'Reason for applying', 2000);
    const desiredOutcome = cleanText(payload.desired_outcome, 2500);
    const previousSgi = cleanText(payload.previous_sgi, 20);
    const previousSgiDetails = cleanText(payload.previous_sgi_details, 2200);
    const referralSource = cleanText(payload.referral_source, 160);

    const weeklyHours = requireText(payload.weekly_hours, 'Weekly study commitment', 80);
    const startTiming = cleanText(payload.start_timing, 100);
    const sundayZoom = requireText(payload.sunday_zoom, 'Sunday Zoom availability', 40);
    const technology = cleanList(payload.technology, 10, 120);
    const readiness = cleanList(payload.readiness, 10, 160);
    const schedulingLimits = cleanText(payload.scheduling_limits, 2200);
    const barriers = cleanText(payload.barriers, 2200);

    const strengths = cleanText(payload.strengths, 2500);
    const growthAreas = cleanText(payload.growth_areas, 2500);
    const serviceVision = cleanText(payload.service_vision, 2800);
    const ethicalChallenge = cleanText(payload.ethical_challenge, 3000);
    const questionsForSgi = cleanText(payload.questions_for_sgi, 2500);
    const anythingElse = cleanText(payload.anything_else, 2500);

    const accuracyAgreement = cleanText(payload.accuracy_agreement, 10);
    const conductAgreement = cleanText(payload.conduct_agreement, 10);
    const divinationAgreement = cleanText(payload.divination_agreement, 10);
    const noGuaranteeAgreement = cleanText(payload.no_guarantee_agreement, 10);
    const consent = cleanText(payload.consent, 10);
    const signatureName = requireText(payload.signature_name, 'Typed signature', 120);
    const signatureDate = requireText(payload.signature_date, 'Signature date', 10);
    const turnstileToken = cleanText(payload['cf-turnstile-response'], 2048);

    if (!EMAIL_PATTERN.test(email)) {
      return json({ error: 'A valid email address is required.' }, 400);
    }

    if (ageConfirmed !== 'yes') {
      return json({ error: 'You must confirm that you are at least 18 years old.' }, 400);
    }

    const requiredReadiness = [
      'Study',
      'Practice',
      'Communication',
      'Financial responsibility'
    ];

    if (!hasEvery(readiness, requiredReadiness)) {
      return json({ error: 'All program-readiness statements must be accepted.' }, 400);
    }

    if (
      accuracyAgreement !== 'yes' ||
      conductAgreement !== 'yes' ||
      divinationAgreement !== 'yes' ||
      noGuaranteeAgreement !== 'yes' ||
      consent !== 'yes'
    ) {
      return json({ error: 'All required agreements and consent statements must be accepted.' }, 400);
    }

    if (!DATE_PATTERN.test(signatureDate)) {
      return json({ error: 'A valid signature date is required.' }, 400);
    }

    const turnstile = await verifyTurnstile(request, env, turnstileToken);
    if (!turnstile.success) {
      return json({ error: turnstile.reason }, turnstile.status);
    }

    const submissionId = crypto.randomUUID();
    const submittedAt = new Date().toISOString();
    const networkCountry = cleanText(request.cf?.country || '', 8);
    const userAgent = cleanText(request.headers.get('user-agent') || '', 500);

    // Build the stored JSON on the server rather than trusting the hidden
    // application_data field supplied by the browser.
    const applicationData = JSON.stringify({
      form_version: 'SGI-LONG-2026-07',
      submitted_at: submittedAt,
      applicant: {
        legal_name: legalName,
        preferred_name: preferredName,
        name_meaning: nameMeaning,
        email,
        phone,
        city,
        state_region: stateRegion,
        country: applicantCountry,
        timezone,
        contact_method: contactMethod,
        age_confirmed: true
      },
      spiritual_background: {
        current_path: currentPath,
        years_practice: yearsPractice,
        initiations,
        initiation_details: initiationDetails,
        divination_systems: divinationSystems,
        training_details: trainingDetails,
        daily_practice: dailyPractice
      },
      program_interest: {
        primary_interest: interest,
        additional_interests: additionalInterests,
        reason_for_applying: message,
        desired_outcome: desiredOutcome,
        previous_sgi: previousSgi,
        previous_sgi_details: previousSgiDetails,
        referral_source: referralSource
      },
      commitment: {
        weekly_hours: weeklyHours,
        start_timing: startTiming,
        sunday_zoom: sundayZoom,
        technology,
        readiness,
        scheduling_limits: schedulingLimits,
        barriers
      },
      personal_statements: {
        strengths,
        growth_areas: growthAreas,
        service_vision: serviceVision,
        ethical_challenge: ethicalChallenge,
        questions_for_sgi: questionsForSgi,
        anything_else: anythingElse
      },
      agreements: {
        accuracy: true,
        conduct: true,
        divination_confirmation: true,
        no_guarantee: true,
        consent: true,
        signature_name: signatureName,
        signature_date: signatureDate
      },
      submission_metadata: {
        network_country: networkCountry,
        user_agent: userAgent
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
      applicantCountry,
      applicationData
    ).run();

    if (!result.success) {
      throw new Error('D1_INSERT_FAILED');
    }

    return json({
      ok: true,
      message: 'Application received and saved to D1.',
      submissionId
    }, 201);
  } catch (error) {
    if (typeof error?.message === 'string' && error.message.startsWith('REQUIRED:')) {
      const label = error.message.slice('REQUIRED:'.length);
      return json({ error: `${label} is required.` }, 400);
    }

    if (error?.message === 'INVALID_PAYLOAD') {
      return json({ error: 'The submitted application data is invalid.' }, 400);
    }

    if (error?.message === 'UNSUPPORTED_CONTENT_TYPE') {
      return json({ error: 'Unsupported submission format.' }, 415);
    }

    console.error('Application submission failed:', error);
    return json({
      error: 'The application could not be saved. Confirm that the D1 application_data migration has been run.'
    }, 500);
  }
}

export function onRequestGet() {
  return json(
    { error: 'Use POST to submit an application.' },
    405,
    { Allow: 'POST' }
  );
}
