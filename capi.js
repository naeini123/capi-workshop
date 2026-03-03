/**
 * capi.js — Meta Conversions API (CAPI) helper
 *
 * Sends server-side Purchase events to Meta's Graph API endpoint.
 * The access token is read exclusively from the META_ACCESS_TOKEN
 * environment variable (loaded from .env via dotenv in server.js).
 *
 * Reference:
 *   https://developers.facebook.com/docs/marketing-api/conversions-api
 */

'use strict';

const https = require('https');
const crypto = require('crypto');

// ─── Constants ────────────────────────────────────────────────────────────────

const PIXEL_ID          = '1914070242854182';
const CAPI_API_VERSION  = 'v21.0';
const CAPI_ENDPOINT     = `https://graph.facebook.com/${CAPI_API_VERSION}/${PIXEL_ID}/events`;
const TEST_EVENT_CODE   = 'TEST38406';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * SHA-256 hash a string value (used for PII normalisation required by Meta).
 * Returns the hex digest, or undefined if the value is falsy.
 *
 * @param {string} value
 * @returns {string|undefined}
 */
function sha256(value) {
  if (!value) return undefined;
  return crypto.createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
}

/**
 * Build a Unix timestamp (seconds) for the current moment.
 * @returns {number}
 */
function unixTimestamp() {
  return Math.floor(Date.now() / 1000);
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * sendPurchaseEvent — fires a server-side Purchase event to Meta CAPI.
 *
 * @param {object} params
 * @param {number}   params.value             - Order total (e.g. 49.99)
 * @param {string}   params.currency          - ISO 4217 currency code (e.g. 'USD')
 * @param {string[]} params.contentIds        - Array of product content_ids
 * @param {object[]} params.contents          - Array of { id, quantity } objects
 * @param {number}   params.numItems          - Total number of items purchased
 * @param {string}   [params.email]           - Customer email (will be hashed)
 * @param {string}   [params.city]            - Customer city (will be hashed)
 * @param {string}   [params.zip]             - Customer postal code (will be hashed)
 * @param {string}   [params.clientIpAddress] - Browser IP forwarded from the request
 * @param {string}   [params.clientUserAgent] - Browser User-Agent forwarded from the request
 * @param {string}   [params.fbp]             - _fbp cookie value (if available)
 * @param {string}   [params.fbc]             - _fbc cookie value (if available)
 * @param {string}   [params.eventId]         - Deduplication event_id (should match browser Pixel)
 * @param {string}   [params.eventSourceUrl]  - The page URL where the purchase occurred
 * @returns {Promise<object>} Resolves with the parsed JSON response from Meta
 */
async function sendPurchaseEvent(params) {
  // DEMO ONLY — hardcoded access token. In production, use process.env.META_ACCESS_TOKEN instead.
  const accessToken = process.env.META_ACCESS_TOKEN ||
    'EAAUqKAlvZC5EBQ8IRdoFYZAEzZAPQGpKee60NsRYTHPi5ONfA8wOfXrR6zC1bSDap0xLWAGmJyAZCo5ZAKlyMBUUkgjHnQLjtDS98SxkcpZAcXmnDrTbQOBacB4hwvGj21L55whZBtGqPfLMY7IGxPEdJRZBJEOpZCLXQDQyYUcCSpp3ZATAqRTbJZBLVHZByLdIjwZDZD';

  if (!accessToken) {
    throw new Error(
      'META_ACCESS_TOKEN is not set. ' +
      'Add it to your .env file and ensure dotenv is loaded before calling sendPurchaseEvent().'
    );
  }

  const {
    value,
    currency         = 'USD',
    contentIds       = [],
    contents         = [],
    numItems         = 0,
    email,
    city,
    zip,
    clientIpAddress,
    clientUserAgent,
    fbp,
    fbc,
    eventId,
    eventSourceUrl,
  } = params;

  // ── User data object (all PII must be hashed per Meta spec) ─────────────────
  // Normalisation rules from:
  //   https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/customer-information-parameters
  //
  // email  → trim + lowercase, then SHA-256
  // city   → lowercase, remove all spaces/punctuation, then SHA-256
  // zip    → lowercase, no spaces or dashes (first 5 digits for US), then SHA-256
  // client_ip_address / client_user_agent → MUST NOT be hashed
  const userData = {
    ...(email           && { em: sha256(email.trim().toLowerCase()) }),
    ...(city            && { ct: sha256(city.trim().toLowerCase().replace(/[^a-z0-9]/g, '')) }),
    ...(zip             && { zp: sha256(zip.trim().toLowerCase().replace(/[\s-]/g, '').slice(0, 5)) }),
    ...(clientIpAddress && { client_ip_address: clientIpAddress }),   // do NOT hash
    ...(clientUserAgent && { client_user_agent: clientUserAgent }),   // do NOT hash
    ...(fbp             && { fbp }),
    ...(fbc             && { fbc }),
  };

  // ── Custom data object ─────────────────────────────────────────────────────
  const customData = {
    value:        parseFloat(value) || 0,
    currency,
    content_ids:  contentIds,
    content_type: 'product',
    contents,
    num_items:    numItems,
  };

  // ── Event payload ──────────────────────────────────────────────────────────
  // Required fields per spec:
  //   event_name, event_time, user_data, action_source (required for website events)
  // Strongly recommended:
  //   event_source_url (required for all website events per best-practices table)
  //   event_id         (required for deduplication with browser Pixel)
  const event = {
    event_name:       'Purchase',
    event_time:       unixTimestamp(),
    action_source:    'website',
    user_data:        userData,
    custom_data:      customData,
    ...(eventSourceUrl && { event_source_url: eventSourceUrl }),
    ...(eventId        && { event_id: eventId }),
  };

  const body = JSON.stringify({
    data: [event],
    test_event_code: TEST_EVENT_CODE,
    access_token: accessToken,
  });

  // ── Send request ───────────────────────────────────────────────────────────
  return new Promise((resolve, reject) => {
    const url = new URL(CAPI_ENDPOINT);
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

module.exports = { sendPurchaseEvent };
