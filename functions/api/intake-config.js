const ALLOWED_ORIGINS = new Set([
  "https://yourbabalawo.com",
  "https://www.yourbabalawo.com",
  "https://850swamig2.github.io"
]);
function originFor(request){const o=request.headers.get("Origin")||"";return ALLOWED_ORIGINS.has(o)?o:""}
function headers(origin){const h={"Access-Control-Allow-Methods":"GET, OPTIONS","Access-Control-Allow-Headers":"Accept","Access-Control-Max-Age":"86400","Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","Vary":"Origin","X-Content-Type-Options":"nosniff"};if(origin)h["Access-Control-Allow-Origin"]=origin;return h}
export function onRequestOptions(context){const o=originFor(context.request);if(!o)return new Response(null,{status:403});return new Response(null,{status:204,headers:headers(o)})}
export function onRequestGet(context){const o=originFor(context.request);if(!o)return new Response(JSON.stringify({ok:false,error:"This configuration source is not authorized."}),{status:403,headers:headers("")});return new Response(JSON.stringify({ok:true,turnstileSiteKey:context.env.TURNSTILE_SITE_KEY||""}),{status:200,headers:headers(o)})}
