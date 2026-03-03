'use strict';

/**
 * capi.js — Meta Conversions API (CAPI) helper module.
 *
 * Sends server-side Purchase events to the Meta Graph API.
 * The access token is read exclusively from the META_ACCESS_TOKEN
 * environment variable — it is never hard-coded here.
 *
 * All PII fields are normalized and SHA-256 hashed before transmission,
 * following Meta's hashing requirements:
 *   https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/customer-information-parameters
 *
 * Required environment variables (set in .env):
 *   META_ACCESS_TOKEN  — your Meta system-user access token
 *
 * Optional environment variables:
 *   META_PIXEL_ID        — overrides the default Pixel ID below
 *   META_TEST_EVENT_CODE — overrides the default test event code below
 */

const https  = require('https');
const crypto = require('crypto');

// ─── Configuration ─────────────────────────────────────────────────────────────
const PIXEL_ID        = process.env.META_PIXEL_ID        || '1914070242854182';
const TEST_EVENT_CODE = process.env.META_TEST_EVENT_CODE || 'TEST38406';
const API_VERSION     = 'v19.0';

// ─── PII Normalization & Hashing ───────────────────────────────────────────────

/**
 * Returns the lowercase hex SHA-256 digest of a string, or null if the
 * input is falsy (empty / undefined / null).
 *
 * @param {string} value - Raw string to hash
 * @returns {string|null}
 */
function sha256(value) {
    if (!value) return null;
    return crypto.createHash('sha256').update(value).digest('hex');
}

/**
 * Normalize + hash rules per Meta's documentation:
 *
 * Field  | Normalization before hashing
 * -------|------------------------------------------------------
 * em     | trim, lowercase
 * ct     | trim, lowercase, remove all spaces
 * zp     | trim, lowercase, remove spaces; for US: keep only digits
 * fn/ln  | trim, lowercase, remove punctuation (if added in future)
 */

/**
 * Normalizes an email address and returns its SHA-256 hash.
 * @param {string} email
 * @returns {string|null}
 */
function hashEmail(email) {
    if (!email) return null;
    const normalized = email.trim().toLowerCase();
    return sha256(normalized);
}

/**
 * Normalizes a city name and returns its SHA-256 hash.
 * @param {string} city
 * @returns {string|null}
 */
function hashCity(city) {
    if (!city) return null;
    const normalized = city.trim().toLowerCase().replace(/\s+/g, '');
    return sha256(normalized);
}

/**
 * Normalizes a postal/ZIP code and returns its SHA-256 hash.
 * Strips all spaces and lowercases; for US ZIPs only the 5-digit root is kept.
 * @param {string} zip
 * @returns {string|null}
 */
function hashZip(zip) {
    if (!zip) return null;
    // Remove spaces, lowercase
    let normalized = zip.trim().toLowerCase().replace(/\s+/g, '');
    // For US ZIP+4 (e.g. "90210-1234"), keep only the 5-digit root
    normalized = normalized.replace(/^(\d{5})-?\d{4}$/, '$1');
    return sha256(normalized);
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns the current Unix timestamp in seconds.
 * @returns {number}
 */
function nowInSeconds() {
    return Math.floor(Date.now() / 1000);
}

/**
 * Sends a raw JSON payload to the Meta CAPI endpoint via HTTPS POST.
 *
 * @param {string} accessToken  - Meta system-user access token
 * @param {object} payload      - Full CAPI request body (already serialised)
 * @returns {Promise<object>}   - Parsed JSON response from Meta
 */
function postToMeta(accessToken, payload) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify(payload);
        const options = {
            hostname: 'graph.facebook.com',
            path:     `/${API_VERSION}/${PIXEL_ID}/events?access_token=${encodeURIComponent(accessToken)}`,
            method:   'POST',
            headers: {
                'Content-Type':   'application/json',
                'Content-Length': Buffer.byteLength(body),
            },
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    resolve({ raw: data });
                }
            });
        });

        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

// ─── Public API ────────────────────────────────────────────────────────────────

// ─── Demo token (fallback for workshop use — replace with env var in production) ───────────────
const DEMO_ACCESS_TOKEN = 'EAAUqKAlvZC5EBQ1mUKY2DG1FaMY7eyRiLiRdjWlCzgwFbPXkZCgMDM2SgtLAdTwTOlWJp2sHZBlXof0zMZAZCLOCuQ2zqM3Km2DtDJjlqm6a2Ph2m1QM9vQUhKHkDeAL6632KhVHztSOa9Cz6pEl8RQkvjorEHEabmCCKgj0ZBNiJhOYmr78d5LeaNkBs9fwZDZD';

/**
 * Sends a server-side Purchase event to the Meta Conversions API.
 * All PII fields are normalized and SHA-256 hashed before transmission.
 *
 * @param {object} opts
 * @param {string}   opts.eventId         - Unique event ID (deduplication key shared with browser Pixel)
 * @param {string}   opts.clientIpAddress - Requester IP address (not hashed — sent as-is per Meta spec)
 * @param {string}   opts.clientUserAgent - Requester User-Agent header (not hashed — sent as-is per Meta spec)
 * @param {string}   [opts.email]         - User email — will be normalized & SHA-256 hashed
 * @param {string}   [opts.city]          - User city  — will be normalized & SHA-256 hashed
 * @param {string}   [opts.zip]           - User ZIP   — will be normalized & SHA-256 hashed
 * @param {number}   opts.value           - Order total in USD
 * @param {string[]} opts.contentIds      - Array of product content IDs
 * @param {Array}    opts.contents        - Array of { id, quantity } objects
 * @param {number}   opts.numItems        - Total number of items purchased
 * @returns {Promise<object>}             - Meta API response
 */
async function sendPurchaseEvent(opts) {
    // Use the env var if set, otherwise fall back to the hardcoded demo token
    const accessToken = process.env.META_ACCESS_TOKEN || DEMO_ACCESS_TOKEN;

    // Build user_data — IP and User-Agent are sent in plain text (required by Meta);
    // all other PII fields are normalized then SHA-256 hashed.
    const userData = {
        client_ip_address: opts.clientIpAddress,
        client_user_agent: opts.clientUserAgent,
    };

    const hashedEmail = hashEmail(opts.email);
    const hashedCity  = hashCity(opts.city);
    const hashedZip   = hashZip(opts.zip);

    if (hashedEmail) userData.em = hashedEmail;
    if (hashedCity)  userData.ct = hashedCity;
    if (hashedZip)   userData.zp = hashedZip;

    const payload = {
        data: [
            {
                event_name:    'Purchase',
                event_time:    nowInSeconds(),
                event_id:      opts.eventId,  // deduplication key — must match the browser Pixel eventID
                action_source: 'website',
                user_data:     userData,
                custom_data: {
                    currency:     'USD',
                    value:        opts.value,
                    content_ids:  opts.contentIds,
                    content_type: 'product',
                    contents:     opts.contents,
                    num_items:    opts.numItems,
                },
            },
        ],
        // Test Events Code — remove or set META_TEST_EVENT_CODE='' in .env for production
        test_event_code: TEST_EVENT_CODE,
    };

    return postToMeta(accessToken, payload);
}

module.exports = { sendPurchaseEvent };
