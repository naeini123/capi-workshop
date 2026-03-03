''''use strict';

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
const cookieParser = require('cookie-parser'); // Import cookie-parser
const { ParamBuilder } = require('capi-param-builder-nodejs');

const { sendPurchaseEvent } = require('./capi');

const app  = express();
const PORT = process.env.PORT || 3000;

// Instantiate the ParamBuilder with the eTLD+1 domain
// This should be dynamically determined or configured in a real app
const paramBuilder = new ParamBuilder(['localhost']);

// Parse incoming JSON request bodies and cookies
app.use(express.json());
app.use(cookieParser());

// Middleware to process CAPI params on every request
app.use((req, res, next) => {
    const cookiesToSet = paramBuilder.processRequest(
        req.hostname,
        req.query,
        req.cookies,
        req.get('referer'),
        req.headers['x-forwarded-for'],
        req.ip || req.socket.remoteAddress
    );

    cookiesToSet.forEach(cookie => {
        res.cookie(cookie.name, cookie.value, { 
            maxAge: cookie.maxAge * 1000, // maxAge is in seconds, convert to ms
            domain: cookie.domain,
            path: '/', 
            secure: req.secure, // Only set secure cookies on HTTPS
            httpOnly: false // Set to false to allow client-side script access
        });
    });

    next();
});

// Endpoint for the client-side script to fetch the user's IP
app.get("/api/get-ip", (req, res) => {
    const clientIp = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
                     req.ip ||
                     req.socket.remoteAddress ||
                     "";
    res.send(clientIp);
});

// Serve static files from /public
app.use(express.static(path.join(__dirname, 'public')));

// ─── CAPI: Purchase event ──────────────────────────────────────────────────────
app.post('/api/capi/purchase', async (req, res) => {
    try {
        const {
            eventId,
            eventSourceUrl,
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

        const result = await sendPurchaseEvent({
            paramBuilder, // Pass the paramBuilder instance
            eventId,
            eventSourceUrl,
            clientUserAgent: req.headers['user-agent'] || '',
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
'''
