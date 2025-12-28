// server.js — Express server with API routes and static serving
const express = require('express');
const path = require('path');
const roomsRouter = require('./api/rooms');
const lightsRouter = require('./api/lights');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API routes
app.use('/api/rooms', roomsRouter);
app.use('/api/lights', lightsRouter);

// Fallback for SPA (serve index.html for non-API routes)
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}/`);
  console.log('API: http://localhost:' + PORT + '/api/rooms');
});
