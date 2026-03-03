
'use strict';

/**
 * capi.js — Meta Conversions API (CAPI) helper module.
 *
 * Sends server-side Purchase and AddToCart events to the Meta Graph API.
 * The access token is read exclusively from the META_ACCESS_TOKEN
 * environment variable — it is never hard-coded here.
 *
 * This version is refactored to use the CAPI Parameter Builder library.
 *
 * Required environment variables (set in .env):
 *   META_ACCESS_TOKEN  — your Meta system-user access token
 *
 * Optional environment variables:
 *   META_PIXEL_ID        — overrides the default Pixel ID below
 *   META_TEST_EVENT_CODE — overrides the default test event code below
 */

const https  = require('https');

// ─── Configuration ─────────────────────────────────────────────────────────────
const PIXEL_ID        = process.env.META_PIXEL_ID        || '1914070242854182';
const TEST_EVENT_CODE = process.env.META_TEST_EVENT_CODE || 'TEST38406';
const API_VERSION     = 'v19.0';

// ─── Demo token (fallback for workshop use — replace with env var in production) ───────────────
const DEMO_ACCESS_TOKEN = 'EAAUqKAlvZC5EBQ1mUKY2DG1FaMY7eyRiLiRdjWlCzgwFbPXkZCgMDM2SgtLAdTwTOlWJp2sHZBlXof0zMZAZCLOCuQ2zqM3Km2DtDJjlqm6a2Ph2m1QM9vQUhKHkDeAL6632KhVHztSOa9Cz6pEl8RQkvjorEHEabmCCKgj0ZBNiJhOYmr78d5LeaNkBs9fwZDZD';

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

/**
 * Builds a user_data object from a ParamBuilder instance and optional PII fields.
 * Removes any null/undefined fields before returning.
 *
 * @param {ParamBuilder} paramBuilder
 * @param {object} opts
 * @returns {object}
 */
function buildUserData(paramBuilder, opts) {
    const userData = {
        fbc:               paramBuilder.getFbc(),
        fbp:               paramBuilder.getFbp(),
        client_ip_address: paramBuilder.getClientIpAddress(),
        client_user_agent: opts.clientUserAgent,
        external_id:       opts.externalId,
        em:                paramBuilder.getNormalizedAndHashedPII(opts.email, 'email'),
        ph:                paramBuilder.getNormalizedAndHashedPII(opts.phone, 'phone'),
        fn:                paramBuilder.getNormalizedAndHashedPII(opts.firstName, 'first_name'),
        ln:                paramBuilder.getNormalizedAndHashedPII(opts.lastName, 'last_name'),
        ct:                paramBuilder.getNormalizedAndHashedPII(opts.city, 'city'),
        st:                paramBuilder.getNormalizedAndHashedPII(opts.state, 'state'),
        zp:                paramBuilder.getNormalizedAndHashedPII(opts.zip, 'zip_code'),
        country:           paramBuilder.getNormalizedAndHashedPII(opts.country, 'country'),
    };

    // Remove null/undefined fields
    Object.keys(userData).forEach(key => userData[key] == null && delete userData[key]);

    return userData;
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Sends a server-side Purchase event to the Meta Conversions API.
 * No event_id is included — deduplication against the browser Pixel is disabled.
 *
 * @param {object} opts
 * @param {ParamBuilder} opts.paramBuilder      - An initialized CAPI Parameter Builder instance
 * @param {string}   opts.eventSourceUrl    - Full URL of the page where the purchase occurred
 * @param {string}   opts.clientUserAgent   - Requester User-Agent header (plain text — required by Meta)
 * @param {string}   [opts.externalId]      - Unique user/session ID
 * @param {string}   [opts.email]           - User email — will be normalized & hashed by ParamBuilder
 * @param {string}   [opts.phone]           - User phone — will be normalized & hashed by ParamBuilder
 * @param {string}   [opts.firstName]       - User first name — will be normalized & hashed by ParamBuilder
 * @param {string}   [opts.lastName]        - User last name — will be normalized & hashed by ParamBuilder
 * @param {string}   [opts.city]            - User city — will be normalized & hashed by ParamBuilder
 * @param {string}   [opts.state]           - User state (2-char) — will be normalized & hashed by ParamBuilder
 * @param {string}   [opts.zip]             - User ZIP — will be normalized & hashed by ParamBuilder
 * @param {string}   [opts.country]         - User country (ISO alpha-2) — will be normalized & hashed by ParamBuilder
 * @param {number}   opts.value             - Order total in USD
 * @param {string[]} opts.contentIds        - Array of product content IDs
 * @param {Array}    opts.contents          - Array of { id, quantity } objects
 * @param {number}   opts.numItems          - Total number of items purchased
 * @returns {Promise<object>}               - Meta API response
 */
async function sendPurchaseEvent(opts) {
    const accessToken = process.env.META_ACCESS_TOKEN || DEMO_ACCESS_TOKEN;
    const userData = buildUserData(opts.paramBuilder, opts);

    const payload = {
        data: [
            {
                event_name:       'Purchase',
                event_time:       nowInSeconds(),
                // No event_id — deduplication with browser Pixel is intentionally disabled
                event_source_url: opts.eventSourceUrl,
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
        test_event_code: TEST_EVENT_CODE,
    };

    return postToMeta(accessToken, payload);
}

/**
 * Sends a server-side AddToCart event to the Meta Conversions API.
 * No event_id is included — deduplication against the browser Pixel is disabled.
 *
 * @param {object} opts
 * @param {ParamBuilder} opts.paramBuilder      - An initialized CAPI Parameter Builder instance
 * @param {string}   opts.eventSourceUrl    - Full URL of the page where the add-to-cart occurred
 * @param {string}   opts.clientUserAgent   - Requester User-Agent header (plain text — required by Meta)
 * @param {string}   [opts.externalId]      - Unique user/session ID
 * @param {number}   opts.value             - Price of the item added
 * @param {string}   opts.contentId         - Product content ID
 * @param {string}   opts.contentName       - Product name
 * @returns {Promise<object>}               - Meta API response
 */
async function sendAddToCartEvent(opts) {
    const accessToken = process.env.META_ACCESS_TOKEN || DEMO_ACCESS_TOKEN;
    const userData = buildUserData(opts.paramBuilder, opts);

    const payload = {
        data: [
            {
                event_name:       'AddToCart',
                event_time:       nowInSeconds(),
                // No event_id — deduplication with browser Pixel is intentionally disabled
                event_source_url: opts.eventSourceUrl,
                action_source:    'website',
                user_data:        userData,
                custom_data: {
                    currency:     'USD',
                    value:        opts.value,
                    content_ids:  [opts.contentId],
                    content_type: 'product',
                    contents:     [{ id: opts.contentId, quantity: 1 }],
                    content_name: opts.contentName,
                },
            },
        ],
        test_event_code: TEST_EVENT_CODE,
    };

    return postToMeta(accessToken, payload);
}

module.exports = { sendPurchaseEvent, sendAddToCartEvent };
