require('dotenv').config();
const express = require('express');
const basicAuth = require('express-basic-auth');
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const csrf = require('csurf');
const crypto = require('crypto');
const app = express();
const PORT = 3000;
const HOST = '0.0.0.0';
const MUSIC_DIR = '/app/music';
const PUBLISHED_JSON = path.join(__dirname, 'published.json');
const SCHEDULED_JSON = path.join(__dirname, 'scheduled.json');
const ipRangeCheck = require('ip-range-check');
app.set('trust proxy', true);

// ipRangeCheck configuration
const ADMIN_IPS = (process.env.ADMIN_IPS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

// Helper to grab client IP (via X-Forwarded-For or socket)
function getClientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) return xff.split(',')[0].trim();
  return req.socket.remoteAddress;
}

// Middleware
function ipWhitelist(req, res, next) {
  const clientIp = getClientIp(req);
  if (ipRangeCheck(clientIp, ADMIN_IPS)) {
    return next();
  }
  console.warn(`Blocked admin access from IP: ${clientIp}`);
  return res.status(403).send('Forbidden');
}

app.use('/admin', ipWhitelist);




// Security headers middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://fonts.gstatic.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      frameAncestors: ["'none'"]
    }
  },
  referrerPolicy: { policy: 'same-origin' }
}));

// Cookie parser for CSRF protection
app.use(cookieParser(process.env.COOKIE_SECRET || crypto.randomBytes(32).toString('hex')));

// CSRF protection middleware
const csrfProtection = csrf({
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Strict'
  }
});

// Input validation helper
const isValidFilename = (filename) => {
  return typeof filename === 'string' &&
         filename.length > 0 &&
         filename.length <= 255 &&
         !filename.includes('/') &&
         !filename.includes('\\') &&
         !filename.includes('..') &&
         /\.(mp3|wav|flac)$/i.test(filename);
};

// Helper: automatically release any scheduled tracks whose time has come
function releaseDueTracks() {
  const now = new Date();
  console.log('🕐 Checking scheduled tracks at:', now.toISOString());

  let schedList = [];
  try {
    schedList = JSON.parse(fs.readFileSync(SCHEDULED_JSON, 'utf8') || '[]');
    console.log('📋 Found', schedList.length, 'scheduled tracks');
  } catch (err) {
    console.error('Error reading scheduled.json:', err);
    schedList = [];
  }

  const dueFiles = [];
  const futureList = [];

  schedList.forEach(item => {
    const scheduledTime = new Date(item.time);
    console.log(`🎵 Track: ${item.file}, Scheduled: ${scheduledTime.toISOString()}, Due: ${scheduledTime <= now}`);

    if (scheduledTime <= now) {
      dueFiles.push(item.file);
    } else {
      futureList.push(item);
   }
  });

  if (dueFiles.length > 0) {
    let pubList = [];
    try {
      pubList = JSON.parse(fs.readFileSync(PUBLISHED_JSON, 'utf8') || '[]');
    } catch (err) {
      console.error('Error reading published.json:', err);
      pubList = [];
    }
    const merged = Array.from(new Set([...pubList, ...dueFiles]));
    fs.writeFileSync(PUBLISHED_JSON, JSON.stringify(merged, null, 2));
    fs.writeFileSync(SCHEDULED_JSON, JSON.stringify(futureList, null, 2));
    console.log('Released scheduled tracks:', dueFiles);
  }
}

// Middleware: parse JSON/body and run releaseDueTracks on every request
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(express.json({ limit: '10kb' }));
app.use((req, res, next) => {
  releaseDueTracks();
  next();
});

// Favicon
app.get('/favicon.ico', (req, res) => {
  res.sendFile(path.join(__dirname, 'html', 'music.ico'));
});

// Static file serving
app.use('/html', express.static(path.join(__dirname, 'html')));
app.use('/music', express.static(MUSIC_DIR));
app.use('/published.json', express.static(PUBLISHED_JSON));
app.use('/scheduled.json', express.static(SCHEDULED_JSON));

// Rate limiter for /admin routes
const adminLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 5,
  message: 'Too many login attempts. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Basic auth for /admin
app.use('/admin', adminLimiter, (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Basic ')) {
    res.set('WWW-Authenticate', 'Basic realm="EchoRiftSounds Admin Panel"');
    return res.status(401).send('Authentication required.');
  }

  const [user, pass] = Buffer.from(auth.split(' ')[1], 'base64')
    .toString()
    .split(':');

  if (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD_HASH) {
    console.error('ADMIN_USERNAME or ADMIN_PASSWORD_HASH not set');
    return res.status(500).send('Server configuration error');
  }

  const validUser = basicAuth.safeCompare(user, process.env.ADMIN_USERNAME);
  const validPass = bcrypt.compareSync(pass, process.env.ADMIN_PASSWORD_HASH);

  if (validUser && validPass) {
    adminLimiter.resetKey(req.ip);
    return next();
  }

  res.set('WWW-Authenticate', 'Basic realm="EchoRiftSounds Admin Panel"');
  return res.status(401).send('Invalid credentials');
});

// Routes
app.get('/admin.html', (req, res) => {
  res.redirect('/admin');
});

// Public homepage
// Redirect root to canonical /index (use 301 for permanent, change to 302 if you prefer temporary)
app.get('/', (req, res) => {
  return res.redirect(301, '/index');
});

// Serve canonical /index
app.get('/index', (req, res) => {
  // Read the HTML file
  const htmlPath = path.join(__dirname, 'html', 'index.html');
  fs.readFile(htmlPath, 'utf8', (err, html) => {
    if (err) {
      return res.status(500).send('Error loading page');
    }

    // Replace placeholders with environment variables
    const siteName = process.env.SITE_NAME;
    const siteSubtitle = 'Retro Vibes';
    const youtubeUrl = process.env.YOUTUBE_URL;
    const youtubeLabel ='VISIT OUR YOUTUBE CHANNEL';

    // Replace placeholders in HTML
    const updatedHtml = html
      .replace(/\{\{SITE_NAME\}\}/g, siteName)
      .replace(/\{\{SITE_SUBTITLE\}\}/g, siteSubtitle)
      .replace(/\{\{YOUTUBE_URL\}\}/g, youtubeUrl)
      .replace(/\{\{YOUTUBE_LABEL\}\}/g, youtubeLabel);

    res.setHeader('Content-Type', 'text/html');
    res.send(updatedHtml);
  });
});

// Canonicalize /index.html -> /index
app.get('/index.html', (req, res) => {
  return res.redirect(301, '/index');
});



// Admin panel UI with CSRF protection
app.get('/admin', csrfProtection, (req, res) => {
  res.cookie('XSRF-TOKEN', req.csrfToken(), {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: false,  // Must be false for client-side access
    sameSite: 'Strict'
  });
  res.sendFile(path.join(__dirname, 'html/admin.html'));
});

// List all music files
app.get('/admin/files', (req, res) => {
  fs.readdir(MUSIC_DIR, (err, files) => {
    if (err) {
      console.error('Error reading music directory:', err);
      return res.status(500).json([]);
    }
    const audioFiles = files.filter(f => /\.(mp3|wav|flac)$/i.test(f));
    res.json(audioFiles);
  });
});

// Publish & Schedule handler with CSRF and input validation
app.post('/admin/publish', express.json(), csrfProtection, (req, res) => {
  // Input validation
  if (!req.body.files && !req.body.scheduled) {
    return res.status(400).send('No files to publish or schedule');
  }

  // Immediate publishes
  let immed = req.body.files || [];
  if (!Array.isArray(immed)) immed = [immed];

  // Validate filenames
  const invalidFiles = immed.filter(f => !isValidFilename(f));
  if (invalidFiles.length > 0) {
    return res.status(400).send(`Invalid filenames: ${invalidFiles.join(', ')}`);
  }

  // Scheduled publishes
  const sched = Array.isArray(req.body.scheduled)
    ? req.body.scheduled
    : req.body.scheduled ? [req.body.scheduled] : [];

  // Validate scheduled items
  const invalidScheduled = sched.filter(item =>
    !item || !item.file || !item.time ||
    !isValidFilename(item.file) ||
    isNaN(new Date(item.time).getTime())
  );

  if (invalidScheduled.length > 0) {
    return res.status(400).send('Invalid scheduled items');
  }

  // Merge immed into published.json
  let pubList = [];
  try {
    pubList = JSON.parse(fs.readFileSync(PUBLISHED_JSON, 'utf8') || '[]');
  } catch {
    pubList = [];
  }
  const merged = Array.from(new Set([...pubList, ...immed]));
  fs.writeFileSync(PUBLISHED_JSON, JSON.stringify(merged, null, 2));

  // Append sched into scheduled.json
  let schedList = [];
  try {
    schedList = JSON.parse(fs.readFileSync(SCHEDULED_JSON, 'utf8') || '[]');
  } catch {
    schedList = [];
  }
  const updatedSched = schedList.concat(sched);
  fs.writeFileSync(SCHEDULED_JSON, JSON.stringify(updatedSched, null, 2));

  res.redirect('/admin');
});

// Unpublish tracks with CSRF and input validation
app.post('/admin/delete', express.urlencoded({ extended: true }), csrfProtection, (req, res) => {
  let toDelete = req.body.filesToDelete || [];
  if (!Array.isArray(toDelete)) toDelete = [toDelete];

  // Validate filenames
  const invalidFiles = toDelete.filter(f => !isValidFilename(f));
  if (invalidFiles.length > 0) {
    return res.status(400).send(`Invalid filenames: ${invalidFiles.join(', ')}`);
  }

  let pubList = [];
  try {
    pubList = JSON.parse(fs.readFileSync(PUBLISHED_JSON, 'utf8') || '[]');
  } catch {
    pubList = [];
  }
  const filtered = pubList.filter(f => !toDelete.includes(f));
  fs.writeFileSync(PUBLISHED_JSON, JSON.stringify(filtered, null, 2));

  res.redirect('/admin');
});

// Remove scheduled tracks with CSRF and input validation
app.post('/admin/scheduled/delete', express.urlencoded({ extended: true }), csrfProtection, (req, res) => {
  let toDelete = req.body.scheduledToDelete || [];
  if (!Array.isArray(toDelete)) toDelete = [toDelete];

  // Validate filenames
  const invalidFiles = toDelete.filter(f => !isValidFilename(f));
  if (invalidFiles.length > 0) {
    return res.status(400).send(`Invalid filenames: ${invalidFiles.join(', ')}`);
  }

  let schedList = [];
  try {
    schedList = JSON.parse(fs.readFileSync(SCHEDULED_JSON, 'utf8') || '[]');
  } catch {
    schedList = [];
  }
  const filtered = schedList.filter(item => !toDelete.includes(item.file));
  fs.writeFileSync(SCHEDULED_JSON, JSON.stringify(filtered, null, 2));

  res.redirect('/admin');
});

// CSRF token refresh endpoint
app.get('/admin/token', csrfProtection, (req, res) => {
  res.json({ token: req.csrfToken() });
});

// CSRF error handler
app.use((err, req, res, next) => {
  if (err.code === 'EBADCSRFTOKEN') {
    return res.status(403).send('Invalid CSRF token');
  }
  next(err);
});

// Start server
app.listen(PORT, HOST,  () => {
  console.log(`🎵 EchoRiftSounds server runs at cluster mode`);
});
