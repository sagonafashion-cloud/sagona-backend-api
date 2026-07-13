import multer from 'multer';

export const notFound = (req, res, next) => {
    const error = new Error(`Not Found - ${req.originalUrl}`);
    res.status(404);
    next(error);
};

// Centralised error handler — this is the last line of defense for anything
// that wasn't already caught and handled inside a controller's own try/catch.
// Rules:
//   1. Always log the full error server-side (message + stack), regardless
//      of environment, so it's diagnosable via server/Sentry logs.
//   2. Never leak a stack trace to the client.
//   3. Never leak a raw/unclassified error message to the client in
//      production — only well-known, "safe" error shapes (validation,
//      duplicate key, bad ObjectId, upload errors, CORS) get a specific,
//      client-appropriate message. Everything else becomes a generic
//      "something went wrong" in production (full detail still shown in
//      development for debugging).
export const errorHandler = (err, req, res, next) => {
    // Always log server-side — full detail, never sent to the client.
    console.error(`[error] ${req.method} ${req.originalUrl}:`, err.message, '\n', err.stack);

    const isProd = process.env.NODE_ENV === 'production';
    let statusCode = res.statusCode && res.statusCode !== 200 ? res.statusCode : 500;
    let message = 'Something went wrong. Please try again.';
    let details;

    // Mongoose validation error — safe to expose per-field messages.
    if (err.name === 'ValidationError' && err.errors) {
        statusCode = 400;
        details = Object.values(err.errors).map((e) => e.message);
        message = 'Validation failed';
    }
    // Mongoose bad ObjectId cast (e.g. malformed :id param).
    else if (err.name === 'CastError') {
        statusCode = 400;
        message = 'Invalid identifier format';
    }
    // Mongo duplicate key (unique index violation).
    else if (err.code === 11000) {
        statusCode = 409;
        const field = Object.keys(err.keyValue || {})[0] || 'field';
        message = `A record with that ${field} already exists`;
    }
    // Multer upload errors (file too large, unexpected field, etc.) — the
    // messages Multer generates are already client-safe.
    else if (err instanceof multer.MulterError) {
        statusCode = 400;
        message = err.message;
    }
    // JWT errors that slipped past auth middleware.
    else if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
        statusCode = 401;
        message = 'Invalid or expired session. Please log in again.';
    }
    // CORS rejection thrown from the origin-check callback in server.js.
    else if (typeof err.message === 'string' && err.message.startsWith('CORS blocked')) {
        statusCode = 403;
        message = 'Cross-origin request blocked';
    }
    // Any other explicit 4xx the caller already set on res (e.g. res.status(400)
    // then next(err)) — these are deliberate client errors, safe to surface.
    else if (statusCode >= 400 && statusCode < 500) {
        message = err.message || message;
    }
    // Unclassified 5xx — never leak the raw message/stack in production.
    else if (!isProd) {
        message = err.message || message;
    }

    const payload = { success: false, message };
    if (details) payload.errors = details;
    if (!isProd) payload.stack = err.stack;

    res.status(statusCode).json(payload);
};
