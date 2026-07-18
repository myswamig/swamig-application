const ALLOWED_ORIGINS = new Set([
  "https://yourbabalawo.com",
  "https://www.yourbabalawo.com",
  "https://850swamig2.github.io"
]);
const MAX_BODY_BYTES = 30000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function originFor(request) {
  const origin = request.headers.get("Origin") || "";
  return ALLOWED_ORIGINS.has(origin) ? origin : "";
}
function cors(origin) {
  const h = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  };
  if (origin) h["Access-Control-Allow-Origin"] = origin;
  return h;
}
function json(request, data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors(originFor(request)), "Content-Type": "application/json; charset=utf-8" }
  });
}
function oneLine(value, max = 500) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";
}
function longText(value, max = 3000) {
  return typeof value === "string" ? value.trim().replace(/\r\n/g, "\n").slice(0, max) : "";
}
function required(value, label, max, multiline = false) {
  const v = multiline ? longText(value, max) : oneLine(value, max);
  if (!v) throw new Error("REQUIRED:" + label);
  return v;
}
function hostnames(env) {
  const raw = env.TURNSTILE_ALLOWED_HOSTNAMES || env.TURNSTILE_EXPECTED_HOSTNAME || "yourbabalawo.com,www.yourbabalawo.com";
  return new Set(raw.split(",").map(v => v.trim().toLowerCase()).filter(Boolean));
}
async function verifyTurnstile(request, env, token) {
  if (!env.TURNSTILE_SECRET_KEY) return { ok: false, status: 503, error: "Turnstile is not configured on the Cloudflare application." };
  if (!token) return { ok: false, status: 403, error: "Complete the Cloudflare security check." };
  const form = new FormData();
  form.append("secret", env.TURNSTILE_SECRET_KEY);
  form.append("response", token);
  form.append("idempotency_key", crypto.randomUUID());
  const ip = request.headers.get("CF-Connecting-IP");
  if (ip) form.append("remoteip", ip);
  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
    const result = await response.json();
    if (!response.ok || !result.success) {
      console.warn("Turnstile rejected intake", result["error-codes"] || []);
      return { ok: false, status: 403, error: "Security verification failed. Refresh the form and try again." };
    }
    const hostname = oneLine(result.hostname || "", 255).toLowerCase();
    if (!hostnames(env).has(hostname)) return { ok: false, status: 403, error: "Security verification came from an unauthorized hostname." };
    return { ok: true, hostname };
  } catch (error) {
    console.error("Turnstile verification error", error);
    return { ok: false, status: 503, error: "Security verification is temporarily unavailable." };
  }
}

export function onRequestOptions(context) {
  const origin = originFor(context.request);
  if (!origin) return new Response(null, { status: 403 });
  return new Response(null, { status: 204, headers: cors(origin) });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const sourceOrigin = originFor(request);
  if (!sourceOrigin) return json(request, { ok: false, error: "This intake source is not authorized." }, 403);
  if (!env.DB) return json(request, { ok: false, error: "D1 binding DB is not configured." }, 503);
  if (Number(request.headers.get("Content-Length") || 0) > MAX_BODY_BYTES) return json(request, { ok: false, error: "The intake is too large." }, 413);
  if (!(request.headers.get("Content-Type") || "").includes("application/json")) return json(request, { ok: false, error: "Unsupported submission format." }, 415);

  try {
    const p = await request.json();
    if (!p || typeof p !== "object" || Array.isArray(p)) return json(request, { ok: false, error: "Invalid intake data." }, 400);
    if (oneLine(p.website, 200)) return json(request, { ok: true, intakeId: "received" }, 201);

    const fullName = required(p.fullName, "Full name", 120);
    const email = required(p.email, "Email", 254).toLowerCase();
    const phone = required(p.phone, "Phone or text number", 40);
    const location = oneLine(p.location, 180);
    const contactMethod = required(p.contactMethod, "Preferred contact method", 40);
    const ifaBefore = required(p.ifaBefore, "Previous Ifá divination answer", 20);
    const tehutiBefore = oneLine(p.tehutiBefore, 20);
    const initiationStatus = oneLine(p.initiationStatus, 100);
    const spiritualHouse = longText(p.house, 1500);
    const concernType = required(p.concernType, "Primary concern category", 120);
    const mainConcern = required(p.mainConcern, "Primary reason", 3000, true);
    const whyNow = longText(p.timing, 2000);
    const question1 = required(p.question1, "Question 1", 1500, true);
    const question2 = longText(p.question2, 1500);
    const question3 = longText(p.question3, 1500);
    const consentSpiritual = p.consentSpiritualConsultation === true;
    const consentDisclaimer = p.consentNotMedicalLegalFinancial === true;
    const consentEbo = p.consentEboCorrection === true;
    const consentPayment = p.consentPaymentRequired === true;

    if (!EMAIL_PATTERN.test(email)) return json(request, { ok: false, error: "Enter a valid email address." }, 400);
    if (!consentSpiritual || !consentDisclaimer || !consentEbo || !consentPayment) return json(request, { ok: false, error: "All consent statements must be accepted." }, 400);

    const turnstile = await verifyTurnstile(request, env, oneLine(p.turnstileToken, 2048));
    if (!turnstile.ok) return json(request, { ok: false, error: turnstile.error }, turnstile.status);

    const intakeId = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const sourcePage = oneLine(p.sourcePage, 500);
    const payloadJson = JSON.stringify({
      form_version: "KOLEOSO-INTAKE-2026-07",
      intake_id: intakeId,
      created_at: createdAt,
      source: { origin: sourceOrigin, page: sourcePage, turnstile_hostname: turnstile.hostname, network_country: oneLine(request.cf?.country || "", 8) },
      client: { full_name: fullName, email, phone, location, preferred_contact_method: contactMethod },
      spiritual_background: { received_ifa_divination_before: ifaBefore, received_tehuti_divination_before: tehutiBefore, initiation_status: initiationStatus, godparent_elder_or_spiritual_house: spiritualHouse },
      divination_request: { concern_category: concernType, primary_reason: mainConcern, why_now: whyNow, questions: [question1, question2, question3].filter(Boolean) },
      consent: { spiritual_consultation: true, not_medical_legal_financial_or_mental_health: true, ebo_or_correction_may_be_recommended: true, payment_required_before_confirmation: true }
    });

    const result = await env.DB.prepare(`
      INSERT INTO divination_intakes (
        intake_id, created_at, status, full_name, email, phone, location, contact_method,
        ifa_before, tehuti_before, initiation_status, spiritual_house, concern_type,
        main_concern, why_now, question_1, question_2, question_3,
        consent_spiritual, consent_disclaimer, consent_ebo, consent_payment,
        source_origin, source_page, payload_json
      ) VALUES (?, ?, 'New', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, 1, 1, ?, ?, ?)
    `).bind(
      intakeId, createdAt, fullName, email, phone, location, contactMethod, ifaBefore,
      tehutiBefore, initiationStatus, spiritualHouse, concernType, mainConcern, whyNow,
      question1, question2, question3, sourceOrigin, sourcePage, payloadJson
    ).run();

    if (!result.success) throw new Error("D1_INSERT_FAILED");
    return json(request, { ok: true, message: "Divination intake received and saved.", intakeId }, 201);
  } catch (error) {
    if (typeof error?.message === "string" && error.message.startsWith("REQUIRED:")) {
      return json(request, { ok: false, error: error.message.slice(9) + " is required." }, 400);
    }
    if (error instanceof SyntaxError) return json(request, { ok: false, error: "The submitted JSON is invalid." }, 400);
    console.error("Divination intake failed", error);
    return json(request, { ok: false, error: "The intake could not be saved. Confirm the DB binding and divination_intakes table." }, 500);
  }
}

export function onRequestGet(context) {
  return json(context.request, { ok: false, error: "Use POST to submit a divination intake." }, 405);
}
