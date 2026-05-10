import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { handleTwilioWebhook } from "./handlers/twilioWebhook";
import { handleSimpleTwilioWebhook } from "./handlers/simpleTwilioWebhook";
import { handleTextLinkSmsWebhook } from "./handlers/textlinksmsWebhook";
import { verifyWebhookSecret as verifyTextLinkSmsSecret } from "./textlinksms";
import { handleStripeWebhook } from "./handlers/stripeWebhook";
import { startFollowUpScheduler } from "./followUp";
import { validateRuntimeEnv } from "./env";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  validateRuntimeEnv();

  const app = express();
  const server = createServer(app);

  // Stripe requires the raw request body for signature verification.
  app.post(
    "/api/webhook/stripe",
    express.raw({ type: "application/json" }),
    (req, res) => {
      handleStripeWebhook(req, res).catch(err => {
        console.error("[Stripe] Unhandled webhook error:", err);
        if (!res.headersSent) {
          res.status(500).send("Stripe webhook failed");
        }
      });
    }
  );

  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // Twilio webhook — must be registered before tRPC and after urlencoded parser.
  // Twilio POSTs application/x-www-form-urlencoded; express.urlencoded() above parses it.
  // The handler validates the Twilio signature using the parsed req.body params.
  app.post("/api/webhook/twilio", (req, res) => {
    handleTwilioWebhook(req, res).catch(err => {
      console.error("[Webhook] Unhandled error:", err);
      if (!res.headersSent) {
        res
          .set("Content-Type", "text/xml")
          .status(200)
          .send("<Response></Response>");
      }
    });
  });

  app.post("/api/webhook/textlinksms", (req, res) => {
    handleTextLinkSmsWebhook(req, res).catch(err => {
      console.error("[TextLinkSMS] Unhandled error:", err);
      if (!res.headersSent) {
        res.status(200).json({ ok: true });
      }
    });
  });

  for (const subPath of ["sent", "failed", "tag"] as const) {
    app.post(`/api/webhook/textlinksms/${subPath}`, (req, res) => {
      const provided =
        typeof req.body?.secret === "string" ? req.body.secret : "";
      if (!verifyTextLinkSmsSecret(provided)) {
        res.status(403).json({ ok: false, error: "forbidden" });
        return;
      }
      if (subPath === "failed") {
        console.error("[TextLinkSMS] FAILED:", req.body);
      } else {
        console.log(`[TextLinkSMS] ${subPath}:`, req.body);
      }
      res.status(200).json({ ok: true });
    });
  }

  app.post("/api/webhook/simple-twilio", (req, res) => {
    handleSimpleTwilioWebhook(req, res).catch(err => {
      console.error("[SimpleWebhook] Unhandled error:", err);
      if (!res.headersSent) {
        res
          .set("Content-Type", "text/xml")
          .status(200)
          .send("<Response><Message>Thanks for reaching out. I'm confirming this with my booking manager.</Message></Response>");
      }
    });
  });

  registerOAuthRoutes(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
    startFollowUpScheduler();
  });
}

startServer().catch(err => {
  console.error(err);
  process.exit(1);
});
