'use strict';

/**
 * server.js — Express server for the Liverpool Fan Shop demo site.
 *
 * Serves all static files from the /public directory.
 * Exposes a POST /api/capi/purchase route that forwards Purchase events
 * to the Meta Conversions API via the capi.js helper module.
 *
 * Run with: npm start
 */

// Load environment variables from .env (ignored by git — see .gitignore)
require('dotenv').config();

const express = require('express');
const path    = require('path');

const { sendPurchaseEvent } = require('./capi');

const app  = express();
const PORT = process.env.PORT || 3000;

// Parse incoming JSON request bodies
app.use(express.json());

// Serve static files from /public
app.use(express.static(path.join(__dirname, 'public')));

// ─── CAPI: Purchase event ──────────────────────────────────────────────────────
/**
 * POST /api/capi/purchase
 *
 * Expected JSON body:
 * {
 *   eventId:       string,   // unique ID for deduplication (matches browser Pixel eventID)
 *   eventSourceUrl:string,   // full URL of the checkout page
 *   fbp:           string,   // _fbp cookie value (optional but strongly recommended)
 *   fbc:           string,   // _fbc cookie value (optional — present when user clicked a Meta ad)
 *   externalId:    string,   // session/user ID for fallback deduplication (optional)
 *   email:         string,   // optional — from checkout form (will be hashed server-side)
 *   phone:         string,   // optional — from checkout form (will be hashed server-side)
 *   firstName:     string,   // optional — from checkout form (will be hashed server-side)
 *   lastName:      string,   // optional — from checkout form (will be hashed server-side)
 *   city:          string,   // optional — from checkout form (will be hashed server-side)
 *   state:         string,   // optional — from checkout form (will be hashed server-side)
 *   zip:           string,   // optional — from checkout form (will be hashed server-side)
 *   country:       string,   // optional — ISO alpha-2 (will be hashed server-side)
 *   value:         number,   // order total (USD)
 *   contentIds:    string[], // product content IDs
 *   contents:      Array,    // [{ id, quantity }, ...]
 *   numItems:      number    // total item count
 * }
 */
app.post('/api/capi/purchase', async (req, res) => {
    try {
        const {
            eventId,
            eventSourceUrl,
            fbp,
            fbc,
            externalId,
            email,
            phone,
            firstName,
            lastName,
            city,
            state,
            zip,
            country,
            value,
            contentIds,
            contents,
            numItems,
        } = req.body;

        // Prefer X-Forwarded-For (set by proxies/Vercel) over direct socket IP
        const clientIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
                      || req.ip
                      || req.socket.remoteAddress
                      || '';

        const result = await sendPurchaseEvent({
            eventId,
            eventSourceUrl,
            clientIpAddress: clientIp,
            clientUserAgent: req.headers['user-agent'] || '',
            fbp,
            fbc,
            externalId,
            email,
            phone,
            firstName,
            lastName,
            city,
            state,
            zip,
            country,
            value,
            contentIds,
            contents,
            numItems,
        });

        res.json({ success: true, meta: result });
    } catch (err) {
        console.error('[CAPI] Error sending Purchase event:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Fallback: serve index.html for any unmatched route
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Liverpool Fan Shop running at http://localhost:${PORT}`);
});
