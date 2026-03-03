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
 *   eventId:    string,   // unique ID for deduplication
 *   email:      string,   // optional — from checkout form
 *   city:       string,   // optional — from checkout form
 *   zip:        string,   // optional — from checkout form
 *   value:      number,   // order total (USD)
 *   contentIds: string[], // product content IDs
 *   contents:   Array,    // [{ id, quantity }, ...]
 *   numItems:   number    // total item count
 * }
 */
app.post('/api/capi/purchase', async (req, res) => {
    try {
        const {
            eventId,
            email,
            city,
            zip,
            value,
            contentIds,
            contents,
            numItems,
        } = req.body;

        const result = await sendPurchaseEvent({
            eventId,
            clientIpAddress: req.ip || req.socket.remoteAddress,
            clientUserAgent: req.headers['user-agent'] || '',
            email,
            city,
            zip,
            value,
            contentIds,
            contents,
            numItems,
        });

        console.log('[CAPI] Purchase event sent:', JSON.stringify(result));
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
