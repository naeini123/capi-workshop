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

// ─── Demo token (fallback for workshop use — replace with env var in production) ───────────────
const DEMO_ACCESS_TOKEN = 'EAAUqKAlvZC5EBQ1mUKY2DG1FaMY7eyRiLiRdjWlCzgwFbPXkZCgMDM2SgtLAdTwTOlWJp2sHZBlXof0zMZAZCLOCuQ2zqM3Km2DtDJjlqm6a2Ph2m1QM9vQUhKHkDeAL6632KhVHztSOa9Cz6pEl8RQkvjorEHEabmCCKgj0ZBNiJhOYmr78d5LeaNkBs9fwZDZD';

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
 * ph     | remove symbols/letters/leading zeros, include country code
 * fn/ln  | trim, lowercase, no punctuation
 * ct     | trim, lowercase, remove all spaces
 * st     | trim, lowercase, 2-char ANSI code
 * zp     | trim, lowercase, no dash; US: first 5 digits only
 * country| trim, lowercase, ISO 3166-1 alpha-2
 */

function hashEmail(email) {
    if (!email) return null;
    return sha256(email.trim().toLowerCase());
}

function hashPhone(phone) {
    if (!phone) return null;
    // Remove all non-digit characters except leading +
    const normalized = phone.trim().replace(/[^\d]/g, '');
    return sha256(normalized);
}

function hashFirstName(fn) {
    if (!fn) return null;
    return sha256(fn.trim().toLowerCase().replace(/[^\p{L}\p{N}]/gu, ''));
}

function hashLastName(ln) {
    if (!ln) return null;
    return sha256(ln.trim().toLowerCase().replace(/[^\p{L}\p{N}]/gu, ''));
}

function hashCity(city) {
    if (!city) return null;
    return sha256(city.trim().toLowerCase().replace(/\s+/g, ''));
}

function hashState(state) {
    if (!state) return null;
    // Use 2-char ANSI abbreviation, lowercase
    return sha256(state.trim().toLowerCase().replace(/\s+/g, '').slice(0, 2));
}

function hashZip(zip) {
    if (!zip) return null;
    let normalized = zip.trim().toLowerCase().replace(/\s+/g, '');
    // For US ZIP+4 (e.g. "90210-1234"), keep only the 5-digit root
    normalized = normalized.replace(/^(\d{5})-?\d{4}$/, '$1');
    return sha256(normalized);
}

function hashCountry(country) {
    if (!country) return null;
    // Expect ISO 3166-1 alpha-2, lowercase
    return sha256(country.trim().toLowerCase().slice(0, 2));
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
 * @param {object} payload      - Full CAPI request body
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
                    const parsed = JSON.parse(data);
                    // Log Meta API errors to the server console for visibility
                    if (parsed.error) {
                        console.error('[CAPI] Meta API error:', JSON.stringify(parsed.error));
                    } else {
                        console.log('[CAPI] Meta response:', JSON.stringify(parsed));
                    }
                    resolve(parsed);
                } catch (e) {
                    resolve({ raw: data });
                }
            });
        });

        req.on('error', (err) => {
            console.error('[CAPI] HTTPS request error:', err.message);
            reject(err);
        });
        req.write(body);
        req.end();
    });
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Sends a server-side Purchase event to the Meta Conversions API.
 * All PII fields are normalized and SHA-256 hashed before transmission.
 *
 * @param {object} opts
 * @param {string}   opts.eventId           - Unique event ID (deduplication key shared with browser Pixel)
 * @param {string}   opts.eventSourceUrl    - Full URL of the page where the purchase occurred
 * @param {string}   opts.clientIpAddress   - Requester IP address (plain text — required by Meta)
 * @param {string}   opts.clientUserAgent   - Requester User-Agent header (plain text — required by Meta)
 * @param {string}   [opts.fbp]             - _fbp cookie value (plain text — do not hash)
 * @param {string}   [opts.fbc]             - _fbc cookie value (plain text — do not hash)
 * @param {string}   [opts.externalId]      - Unique user/session ID for deduplication fallback
 * @param {string}   [opts.email]           - User email — normalized & SHA-256 hashed
 * @param {string}   [opts.phone]           - User phone — normalized & SHA-256 hashed
 * @param {string}   [opts.firstName]       - User first name — normalized & SHA-256 hashed
 * @param {string}   [opts.lastName]        - User last name — normalized & SHA-256 hashed
 * @param {string}   [opts.city]            - User city — normalized & SHA-256 hashed
 * @param {string}   [opts.state]           - User state (2-char) — normalized & SHA-256 hashed
 * @param {string}   [opts.zip]             - User ZIP — normalized & SHA-256 hashed
 * @param {string}   [opts.country]         - User country (ISO alpha-2) — normalized & SHA-256 hashed
 * @param {number}   opts.value             - Order total in USD
 * @param {string[]} opts.contentIds        - Array of product content IDs
 * @param {Array}    opts.contents          - Array of { id, quantity } objects
 * @param {number}   opts.numItems          - Total number of items purchased
 * @returns {Promise<object>}               - Meta API response
 */
async function sendPurchaseEvent(opts) {
    // Use the env var if set, otherwise fall back to the hardcoded demo token
    const accessToken = process.env.META_ACCESS_TOKEN || DEMO_ACCESS_TOKEN;

    // ── user_data ─────────────────────────────────────────────────────────────
    // client_ip_address and client_user_agent are sent in plain text (Meta spec).
    // fbp and fbc are browser cookie values — do NOT hash them.
    // All other PII is normalized then SHA-256 hashed.
    const userData = {
        client_ip_address: opts.clientIpAddress,
        client_user_agent: opts.clientUserAgent,
    };

    // Hashed PII fields
    const hashedEmail     = hashEmail(opts.email);
    const hashedPhone     = hashPhone(opts.phone);
    const hashedFirstName = hashFirstName(opts.firstName);
    const hashedLastName  = hashLastName(opts.lastName);
    const hashedCity      = hashCity(opts.city);
    const hashedState     = hashState(opts.state);
    const hashedZip       = hashZip(opts.zip);
    const hashedCountry   = hashCountry(opts.country);

    if (hashedEmail)     userData.em      = hashedEmail;
    if (hashedPhone)     userData.ph      = hashedPhone;
    if (hashedFirstName) userData.fn      = hashedFirstName;
    if (hashedLastName)  userData.ln      = hashedLastName;
    if (hashedCity)      userData.ct      = hashedCity;
    if (hashedState)     userData.st      = hashedState;
    if (hashedZip)       userData.zp      = hashedZip;
    if (hashedCountry)   userData.country = hashedCountry;

    // Plain-text identifiers (do NOT hash)
    if (opts.fbp)        userData.fbp        = opts.fbp;
    if (opts.fbc)        userData.fbc        = opts.fbc;
    if (opts.externalId) userData.external_id = opts.externalId;

    const payload = {
        data: [
            {
                event_name:       'Purchase',
                event_time:       nowInSeconds(),
                event_id:         opts.eventId,       // deduplication key — must match browser Pixel eventID
                event_source_url: opts.eventSourceUrl, // required for all website events
                action_source:    'website',
                user_data:        userData,
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
