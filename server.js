'use strict';

/**
 * server.js — Express server for the Liverpool Fan Shop demo site.
 *
 * Serves all static files from the /public directory.
 * Run with: npm start
 */

const express = require('express');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

// Serve static files from /public
app.use(express.static(path.join(__dirname, 'public')));

// Fallback: serve index.html for any unmatched route
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Liverpool Fan Shop running at http://localhost:${PORT}`);
});
