import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { config } from './config.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { withMockUser } from './middleware/withMockUser.js';
import authRoutes from './routes/auth.routes.js';
import userRoutes from './routes/user.routes.js';
import dealRoutes from './routes/deal.routes.js';
import paymentRoutes from './routes/payment.routes.js';
import submissionRoutes from './routes/submission.routes.js';
import disputeRoutes from './routes/dispute.routes.js';
import invitationRoutes from './routes/invitation.routes.js';
import termsRoutes from './routes/terms.routes.js';

const app = express();

// ---------------------------------------------------------------------------
// Trust proxy — must be set before any middleware that reads req.ip
// ---------------------------------------------------------------------------
switch (config.server.trustProxy) {
  case 'disabled':
    app.set('trust proxy', false);
    break;
  case 'loopback':
    app.set('trust proxy', 'loopback');
    break;
  case 'uniquelocal':
    app.set('trust proxy', 'uniquelocal');
    break;
  case 'true':
    app.set('trust proxy', true);
    break;
  default:
    // numeric hop count
    app.set('trust proxy', config.server.trustProxy as number);
}

// Security middleware
app.use(helmet());
app.use(cors({
  origin: config.server.corsOrigin,
  credentials: true,
}));

// Body parsing
app.use(express.json());

// Cookie parsing for refresh tokens
app.use(cookieParser());

// Mock user injection (dev only). Reads X-Mock-User header and sets req.mockUser.
// Per-route authenticate() calls are replaced with mockAwareAuth() which
// honors this header. Safe in production: missing/invalid header is a no-op.
app.use(withMockUser);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Routes
app.use('/auth', authRoutes);
app.use('/users', userRoutes);
app.use('/deals', dealRoutes);
app.use('/deals', paymentRoutes);
app.use('/deals', submissionRoutes);
app.use('/deals', disputeRoutes);
app.use('/invitations', invitationRoutes);
app.use('/deals', termsRoutes);

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

const PORT = config.server.port;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export default app;
