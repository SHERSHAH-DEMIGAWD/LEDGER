import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { config } from './config.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import authRoutes from './routes/auth.routes.js';
import userRoutes from './routes/user.routes.js';

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

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Routes
app.use('/auth', authRoutes);
app.use('/users', userRoutes);

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

const PORT = config.server.port;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export default app;
