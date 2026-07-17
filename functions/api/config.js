const HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff'
};

export function onRequestGet(context) {
  return new Response(JSON.stringify({
    turnstileSiteKey: context.env.TURNSTILE_SITE_KEY || ''
  }), {
    status: 200,
    headers: HEADERS
  });
}
