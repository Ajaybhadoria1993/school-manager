import express from "express";
import cors from "cors";
import morgan from "morgan";
import helmet from "helmet";
import compression from "compression";
import cookieParser from "cookie-parser";
import mongoSanitize from "express-mongo-sanitize";
import { env } from "./config/env";
import routes from "./routes";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { apiLimiter } from "./middleware/rateLimit";

const app = express();

// Behind a reverse proxy (nginx/load balancer) in production, so req.ip and
// the rate limiter reflect the real client IP rather than the proxy's.
if (env.nodeEnv === "production") app.set("trust proxy", 1);

app.use(helmet());
app.use(compression());
app.use(cors({ origin: env.clientUrls, credentials: true }));
if (env.nodeEnv !== "test") app.use(morgan(env.nodeEnv === "development" ? "dev" : "combined"));
app.use(cookieParser());
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));
// Strips any request key starting with "$" or containing "." (e.g. a
// crafted `classId[$ne]=null` query param), so user input can never be
// interpreted as a MongoDB query operator.
app.use(mongoSanitize());

app.get("/health", (_req, res) => {
  res.json({ success: true, status: "ok", env: env.nodeEnv });
});

app.use("/api", apiLimiter, routes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
