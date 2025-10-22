export default {
  async fetch(request, env, ctx) {
    // --- CORS setup (for GitHub Pages + Cloudflare Pages + localhost) ---
    const origin = request.headers.get("Origin") || "";
    const allowed = [
      "https://swamiginstitute.com",
      "https://www.swamiginstitute.com",
      "https://myswamig.github.io",
      "https://www.myswamig.github.io",
      "http://localhost:3000",
      "http://127.0.0.1:3000"
    ];
    const corsHeaders = {
      "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    };

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // Handle form submissions only
    if (request.method === "POST") {
      try {
        const formData = await request.formData();

        // Build a readable email message
        let body = "";
        for (const [key, value] of formData.entries()) {
          if (key === "website" && value) {
            // Honeypot spam protection
            return new Response("Spam detected", { status: 400, headers: corsHeaders });
          }
          body += `${key}: ${value}\n`;
        }

        // --- Compose the email for MailChannels ---
        const mailPayload = {
          personalizations: [
            { to: [{ email: "app@swamiginstitute.com", name: "SwamiG Institute" }] }
          ],
          from: { email: "no-reply@swamiginstitute.com", name: "Divination Application" },
          subject: "New Divination Application Submission",
          content: [
            {
              type: "text/plain",
              value: `A new application was submitted:\n\n${body}`
            }
          ]
        };

        const mailResponse = await fetch("https://api.mailchannels.net/tx/v1/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(mailPayload)
        });

        if (mailResponse.ok) {
          return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        } else {
          const text = await mailResponse.text();
          return new Response(`Mail error: ${text}`, {
            status: 500,
            headers: corsHeaders
          });
        }
      } catch (err) {
        return new Response(`Server error: ${err.message}`, {
          status: 500,
          headers: corsHeaders
        });
      }
    }

    // All other routes
    return new Response("Not found", { status: 404, headers: corsHeaders });
  }
};
