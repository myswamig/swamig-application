submit_js = """export async function onRequestPost(context) {
  try {
    const formData = await context.request.formData();
    const name = formData.get("name");
    const email = formData.get("email");
    const interest = formData.get("interest");

    const mailPayload = {
      personalizations: [
        {
          to: [{ email: email }],
          cc: [{ email: "app@swamiginstitute.com" }],
          subject: "🌀 SwamiG Institute Application Received"
        }
      ],
      from: {
        email: "noreply@swamiginstitute.com",
        name: "SwamiG Institute"
      },
      content: [
        {
          type: "text/plain",
          value: `Dear ${name},\\n\\nThank you for applying to the SwamiG Institute.\\n\\nYou selected: ${interest}\\n\\nWe will review your application and contact you soon.\\n\\nAse,\\nSwamiG Institute`
        }
      ]
    };

    const sendEmail = await fetch("https://api.mailchannels.net/tx/v1/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mailPayload)
    });

    if (!sendEmail.ok) {
      throw new Error("Email failed to send");
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (err) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
"""
