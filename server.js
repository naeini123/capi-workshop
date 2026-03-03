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
const cookie  = require('cookie'); // Built-in transitive dep via Express — no extra install needed
const { ParamBuilder } = require('capi-param-builder-nodejs');

const { sendPurchaseEvent } = require('./capi');

const app  = express();
const PORT = process.env.PORT || 3000;

// Instantiate the ParamBuilder once at startup.
// The eTLD+1 list is used for cookie domain scoping.
// In production, replace 'localhost' with your actual domain (e.g. 'example.com').
const paramBuilder = new ParamBuilder([
    process.env.COOKIE_DOMAIN || 'localhost',
]);

// Parse incoming JSON request bodies
app.use(express.json());

// Middleware: process CAPI params on every request and set recommended cookies
app.use((req, res, next) => {
    // Parse cookies from the Cookie header using the built-in 'cookie' package
    const rawCookies = req.headers.cookie || '';
    const parsedCookies = cookie.parse(rawCookies);

    const cookiesToSet = paramBuilder.processRequest(
        req.hostname,
        req.query,
        parsedCookies,
        req.get('referer') || null,
        req.headers['x-forwarded-for'] || null,
        req.ip || (req.socket && req.socket.remoteAddress) || null
    );

    cookiesToSet.forEach(c => {
        res.cookie(c.name, c.value, {
            maxAge:   c.maxAge * 1000, // library returns seconds; Express expects ms
            domain:   c.domain,
            path:     '/',
            secure:   req.secure,
            httpOnly: false, // must be readable by the client-side script
        });
    });

    next();
});

// Endpoint for the client-side script to fetch the user's IP (used for IPv6 capture)
app.get('/api/get-ip', (req, res) => {
    const clientIp =
        (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
        req.ip ||
        (req.socket && req.socket.remoteAddress) ||
        '';
    res.send(clientIp);
});

// Serve static files from /public
app.use(express.static(path.join(__dirname, 'public')));

// ─── CAPI: Purchase event ──────────────────────────────────────────────────────
/**
 * POST /api/capi/purchase
 *
 * Expected JSON body:
 * {
 *   eventId:       string,
 *   eventSourceUrl:string,
 *   externalId:    string,   // optional
 *   email:         string,   // optional — hashed server-side by ParamBuilder
 *   phone:         string,   // optional — hashed server-side by ParamBuilder
 *   firstName:     string,   // optional
 *   lastName:      string,   // optional
 *   city:          string,   // optional
 *   state:         string,   // optional
 *   zip:           string,   // optional
 *   country:       string,   // optional
 *   value:         number,
 *   contentIds:    string[],
 *   contents:      Array,
 *   numItems:      number
 * }
 */
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
            paramBuilder,
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
