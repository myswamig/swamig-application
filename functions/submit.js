export async function onRequestPost(context) {
  try {
    const formData = await context.request.formData();
    const name = formData.get("name");
    const email = formData.get("email");
    const interest = formData.get("interest");

    // Log or forward data (can integrate with MailChannels, SendGrid, etc.)
    console.log("New Submission:", { name, email, interest });

    // Example JSON response
    return new Response(JSON.stringify({
      message: "Application received",
      data: { name, email, interest }
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Failed to process submission" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
