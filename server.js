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
    } = req.body;

    // Forward the client's real IP and User-Agent for better match quality
    const clientIpAddress = (
      req.headers['x-forwarded-for'] ||
      req.socket.remoteAddress ||
      ''
    ).split(',')[0].trim();

    const clientUserAgent = req.headers['user-agent'] || '';

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
      fbp,
      fbc,
      eventId,
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
