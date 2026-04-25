import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { CLERK_PROXY_PATH, clerkProxyMiddleware, clerkSignupsGate } from "./middlewares/clerkProxyMiddleware";
import { clerkAuthRateLimit } from "./middlewares/authRateLimit";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// Clerk proxy middleware chain (order matters):
// 1. clerkAuthRateLimit — per-IP hard cap, blocks extreme abuse from one client
// 2. clerkSignupsGate  — global gate: short-circuits sign_ups during a known Clerk
//                        rate-limit window (Clerk limits sign_ups per server outgoing
//                        IP, so all users share one pool; this avoids useless round-
//                        trips to Clerk that are guaranteed to return 429 anyway)
// 3. clerkProxyMiddleware — forwards to Clerk; records sign_ups 429 windows
app.use(CLERK_PROXY_PATH, clerkAuthRateLimit);
app.use(CLERK_PROXY_PATH, clerkSignupsGate);
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

app.use(cors({ credentials: true, origin: true }));
// 15 MB limit — supports base64-encoded ID documents up to ~10 MB
// (base64 encoding adds ~33% overhead, so 10 MB raw → ~13.3 MB JSON body)
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));

app.use(clerkMiddleware());

app.use("/api", router);

export default app;
