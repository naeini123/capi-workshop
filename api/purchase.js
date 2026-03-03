/**
 * api/purchase.js — Vercel Serverless Function
 *
 * Receives a Purchase event payload from the browser and forwards it to
 * Meta's Conversions API (CAPI). This replaces the Express POST /capi/purchase
 * route from server.js.
 *
 * Vercel automatically serves this file at:
 *   POST /api/purchase
 *
 * Environment variables (set in Vercel dashboard → Settings → Environment Variables):
 *   META_ACCESS_TOKEN - Meta system user access token (required for CAPI)
 */

'use strict';

const crypto = require('crypto');
const https  = require('https');

// ─── Constants ────────────────────────────────────────────────────────────────

const PIXEL_ID         = '1914070242854182';
const CAPI_API_VERSION = 'v21.0';
const CAPI_ENDPOINT    = `https://graph.facebook.com/${CAPI_API_VERSION}/${PIXEL_ID}/events`;
const TEST_EVENT_CODE  = 'TEST38406';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * SHA-256 hash a normalised string value.
 * Returns the hex digest, or undefined if the value is falsy.
 */
function sha256(value) {
  if (!value) return undefined;
  return crypto.createHash('sha256').update(value).digest('hex');
}

/** Current Unix timestamp in seconds (GMT). */
function unixTimestamp() {
  return Math.floor(Date.now() / 1000);
}

/**
 * Send a POST request to Meta's CAPI endpoint.
 * Returns a Promise that resolves with the parsed JSON response.
 */
function postToMeta(payload) {
  return new Promise((resolve, reject) => {
    const body    = JSON.stringify(payload);
    const url     = new URL(CAPI_ENDPOINT);
    const options = {
      hostname: url.hostname,
      path:     url.pathname + url.search,
      method:   'POST',
      headers:  {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            reject(new Error(`Meta CAPI returned ${res.statusCode}: ${data}`));
          }
        } catch (e) {
          reject(new Error(`Failed to parse Meta CAPI response: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ─── Serverless handler ───────────────────────────────────────────────────────

/**
 * Vercel serverless function handler.
 * Only accepts POST requests.
 */
module.exports = async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // DEMO ONLY — hardcoded access token fallback.
  // In production, set META_ACCESS_TOKEN in Vercel dashboard → Environment Variables.
  const accessToken = process.env.META_ACCESS_TOKEN ||
    'EAAUqKAlvZC5EBQ8IRdoFYZAEzZAPQGpKee60NsRYTHPi5ONfA8wOfXrR6zC1bSDap0xLWAGmJyAZCo5ZAKlyMBUUkgjHnQLjtDS98SxkcpZAcXmnDrTbQOBacB4hwvGj21L55whZBtGqPfLMY7IGxPEdJRZBJEOpZCLXQDQyYUcCSpp3ZATAqRTbJZBLVHZByLdIjwZDZD';

  try {
    const {
      value,
      currency     = 'USD',
      contentIds   = [],
      contents     = [],
      numItems     = 0,
      email,
      city,
      zip,
      fbpCookie,
      fbcCookie,
      eventId,
    } = req.body;

    // ── Client IP ────────────────────────────────────────────────────────────
    // Vercel sets x-forwarded-for to the real browser IP automatically.
    // Strip IPv6-mapped prefix and skip loopback addresses.
    const rawIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim().replace(/^::ffff:/, '');
    const isLoopback = rawIp === '::1' || rawIp.startsWith('127.');
    const clientIpAddress = isLoopback ? '' : rawIp;

    const clientUserAgent = req.headers['user-agent'] || '';

    // event_source_url: the page the purchase occurred on (sent in Referer header)
    const eventSourceUrl = req.headers['referer'] || '';

    // ── User data (all PII hashed per Meta spec) ─────────────────────────────
    // Normalisation:
    //   email  → trim + lowercase → SHA-256
    //   city   → lowercase, strip non-alphanumeric → SHA-256
    //   zip    → lowercase, strip spaces/dashes, first 5 chars → SHA-256
    //   client_ip_address / client_user_agent → must NOT be hashed
    const userData = {
      ...(email           && { em: sha256(email.trim().toLowerCase()) }),
      ...(city            && { ct: sha256(city.trim().toLowerCase().replace(/[^a-z0-9]/g, '')) }),
      ...(zip             && { zp: sha256(zip.trim().toLowerCase().replace(/[\s-]/g, '').slice(0, 5)) }),
      ...(clientIpAddress && { client_ip_address: clientIpAddress }),
      ...(clientUserAgent && { client_user_agent: clientUserAgent }),
      ...(fbpCookie       && { fbp: fbpCookie }),
      ...(fbcCookie       && { fbc: fbcCookie }),
    };

    // ── Custom data ──────────────────────────────────────────────────────────
    const customData = {
      value:        parseFloat(value) || 0,
      currency,
      content_ids:  contentIds,
      content_type: 'product',
      contents,
      num_items:    numItems,
    };

    // ── Event payload ────────────────────────────────────────────────────────
    const event = {
      event_name:    'Purchase',
      event_time:    unixTimestamp(),
      action_source: 'website',
      user_data:     userData,
      custom_data:   customData,
      ...(eventSourceUrl && { event_source_url: eventSourceUrl }),
      ...(eventId        && { event_id: eventId }),
    };

    const payload = {
      data:            [event],
      test_event_code: TEST_EVENT_CODE,
      access_token:    accessToken,
    };

    const result = await postToMeta(payload);
    console.log('[CAPI] Purchase event sent:', JSON.stringify(result));
    return res.status(200).json({ success: true, result });

  } catch (err) {
    console.error('[CAPI] Error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
};
