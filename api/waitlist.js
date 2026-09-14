const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_SOURCES = new Set([
  'Homepage hero',
  'Advisor section',
  'Closing waitlist'
]);

module.exports = async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const notificationEmail = process.env.WAITLIST_NOTIFICATION_EMAIL;

  if (!apiKey || !notificationEmail) {
    console.error('Missing waitlist email environment variables');
    return response.status(500).json({ error: 'Notification service is not configured' });
  }

  const body = typeof request.body === 'string'
    ? JSON.parse(request.body || '{}')
    : (request.body || {});

  const email = String(body.email || '').trim().toLowerCase();
  const source = ALLOWED_SOURCES.has(body.source) ? body.source : 'Website';
  const website = String(body.website || '').trim();

  // Honeypot fields are invisible to genuine visitors.
  if (website) {
    return response.status(200).json({ ok: true });
  }

  if (!EMAIL_PATTERN.test(email) || email.length > 254) {
    return response.status(400).json({ error: 'Enter a valid email address' });
  }

  const submittedAt = new Date().toISOString();
  const resendResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL || 'Mosaic Waitlist <onboarding@resend.dev>',
      to: [notificationEmail],
      reply_to: email,
      subject: `New Mosaic waitlist signup — ${source}`,
      text: [
        'A new visitor joined the Mosaic waitlist.',
        '',
        `Email: ${email}`,
        `Source: ${source}`,
        `Submitted: ${submittedAt}`
      ].join('\n')
    })
  });

  if (!resendResponse.ok) {
    const errorText = await resendResponse.text();
    console.error('Resend API error:', resendResponse.status, errorText);
    return response.status(502).json({ error: 'Unable to send notification' });
  }

  response.setHeader('Cache-Control', 'no-store');
  return response.status(200).json({ ok: true });
};
