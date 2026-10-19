import express from "express";
import cors from "cors";
import morgan from "morgan";
import helmet from "helmet";
import compression from "compression";
import mongoSanitize from "express-mongo-sanitize";
import { env } from "./config/env";
import routes from "./routes";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { apiLimiter } from "./middleware/rateLimit";

const app = express();

// Behind a reverse proxy in production, so req.ip (used by the rate limiters) is the real client.
if (env.isProduction) app.set("trust proxy", 1);

app.use(helmet());
app.use(compression());
// Auth uses the Authorization header, not cookies, so credentialed CORS is not needed.
app.use(cors({ origin: env.clientUrls }));
if (env.nodeEnv !== "test") app.use(morgan(env.nodeEnv === "development" ? "dev" : "combined"));
app.use(express.json({ limit: "1mb" }));
// Strips keys starting with "$" or containing "." from the body/query so user input can
// never be interpreted as a MongoDB operator (e.g. { "email": { "$ne": null } }).
app.use(mongoSanitize());

app.get("/health", (_req, res) => {
  res.json({ success: true, status: "ok", env: env.nodeEnv });
});

// Versioned, so a mobile app already in people's hands keeps working when /v2 arrives.
app.use("/api/v1", apiLimiter, routes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
