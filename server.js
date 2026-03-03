/**
 * server.js — Express server for the CAPI Workshop demo site.
 *
 * Serves all static files (HTML, CSS, JS, images) from the project root
 * and exposes a single API route for server-side Meta CAPI events:
 *
 *   POST /capi/purchase
 *     Receives purchase event data from the browser and forwards it to
 *     Meta's Conversions API via capi.js.
 *
 * Environment variables (loaded from .env via dotenv):
 *   PORT              - HTTP port to listen on (default: 3000)
 *   META_ACCESS_TOKEN - Meta system user access token (required for CAPI)
 */

'use strict';

require('dotenv').config();

const express = require('express');
const path    = require('path');

const { sendPurchaseEvent } = require('./capi');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ───────────────────────────────────────────────────────────────

// Parse JSON request bodies (needed for the CAPI route)
app.use(express.json());

// Serve all static files (HTML, CSS, JS, images) from the root directory
app.use(express.static(path.join(__dirname)));

// ─── CAPI Route ───────────────────────────────────────────────────────────────

/**
 * POST /capi/purchase
 *
 * Expected JSON body:
 * {
 *   value:       number,    // order total
 *   currency:    string,    // e.g. "USD"
 *   contentIds:  string[],  // product content_ids
 *   contents:    object[],  // [{ id, quantity }, ...]
 *   numItems:    number,
 *   email:       string,    // optional — will be SHA-256 hashed server-side
 *   city:        string,    // optional — will be SHA-256 hashed server-side
 *   zip:         string,    // optional — will be SHA-256 hashed server-side
 *   fbp:         string,    // optional — _fbp cookie value
 *   fbc:         string,    // optional — _fbc cookie value
 *   eventId:     string,    // optional — deduplication ID (should match browser Pixel)
 * }
 */
app.post('/capi/purchase', async (req, res) => {
  try {
    const {
      value,
      currency,
      contentIds,
      contents,
      numItems,
      email,
      city,
      zip,
      fbp,
      fbc,
      eventId,
      // The browser can optionally pass _fbp/_fbc cookie values it read client-side
      fbpCookie,
      fbcCookie,
    } = req.body;

    // ── Client IP ──────────────────────────────────────────────────────────
    // Prefer X-Forwarded-For (set by proxies/load-balancers) over the socket
    // address. Strip IPv6-mapped IPv4 prefix (::ffff:) and skip loopback
    // addresses (127.x / ::1) which Meta cannot use for matching.
    const rawIp = (
      req.headers['x-forwarded-for'] ||
      req.socket.remoteAddress ||
      ''
    ).split(',')[0].trim().replace(/^::ffff:/, '');

    const isLoopback = rawIp === '::1' || rawIp.startsWith('127.');
    const clientIpAddress = isLoopback ? '' : rawIp;

    const clientUserAgent = req.headers['user-agent'] || '';

    // event_source_url: the page where the purchase occurred.
    // The browser sends the checkout page URL in the Referer header.
    const eventSourceUrl = req.headers['referer'] || '';

    const result = await sendPurchaseEvent({
      value,
      currency,
      contentIds,
      contents,
      numItems,
      email,
      city,
      zip,
      clientIpAddress,
      clientUserAgent,
      fbp:  fbp  || fbpCookie,   // accept from body (browser read _fbp cookie)
      fbc:  fbc  || fbcCookie,   // accept from body (browser read _fbc cookie)
      eventId,
      eventSourceUrl,
    });

    console.log('[CAPI] Purchase event sent successfully:', JSON.stringify(result));
    res.json({ success: true, result });

  } catch (err) {
    console.error('[CAPI] Error sending Purchase event:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Fallback ─────────────────────────────────────────────────────────────────

// Serve index.html for any unmatched route (SPA-style fallback)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
