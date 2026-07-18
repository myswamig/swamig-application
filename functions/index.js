export async function onRequestGet(context) {
  const url = new URL(context.request.url);

  if (url.hostname === "secure.yourbabalawo.com") {
    return Response.redirect("https://yourbabalawo.com/intake.html", 302);
  }

  return context.next();
}
