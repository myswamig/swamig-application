export async function onRequestPost(context) {
  try {
    const formData = await context.request.formData();
    const name = formData.get("name");
    const email = formData.get("email");
    const interest = formData.get("interest");

    // Email content
    const subject = `New Application from ${name}`;
    const body = `
      A new applicant has submitted the form:\n
      Name: ${name}\n
      Email: ${email}\n
      Interest: ${interest}
    `;

    const response = await fetch("https://api.mailchannels.net/tx/v1/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        personalizations: [{
          to: [{ email: "app@swamiginstitute.com" }],
          cc: [{ email }],
          subject
        }],
        from: {
          email: "no-reply@swamiginstitute.com",  // Must be a domain you control via Cloudflare
          name: "SwamiG Institute"
        },
        content: [{
          type: "text/plain",
          value: body
        }]
      })
    });

    if (!response.ok) {
      console.error("MailChannels failed", await response.text());
    }

    return new Response(JSON.stringify({ message: "Application received" }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (err) {
    console.error("Error processing form:", err);
    return new Response(JSON.stringify({ error: "Form processing failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
