import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import cookie from "@fastify/cookie";
import formbody from "@fastify/formbody";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import type { AppConfig } from "./config.js";
import { loadConfig } from "./config.js";
import { issuePageToken } from "./security/page-token.js";
import { DecisionService } from "./services/decision-service.js";
import {
  JsonlDecisionRepository,
  type DecisionRepository
} from "./storage/decision-repository.js";
import { renderPrelander } from "./web/render-prelander.js";

interface BuildAppOptions {
  config?: AppConfig;
  repository?: DecisionRepository;
  clock?: () => number;
  logger?: boolean;
}

interface VisitorIdentity {
  id: string;
  hadValidCookie: boolean;
}

export async function buildApp(options: BuildAppOptions = {}) {
  const config = options.config ?? loadConfig();
  const repository = options.repository ?? new JsonlDecisionRepository(config.dataFile);
  const clock = options.clock ?? Date.now;
  await repository.initialize();

  const app = Fastify({
    logger:
      options.logger === false || config.logLevel === "silent"
        ? false
        : { level: config.logLevel },
    trustProxy: config.trustProxy,
    bodyLimit: config.maxBodyBytes
  });
  const decisionService = new DecisionService(config, repository, clock);
  const telemetryScript = await readFile(
    path.join(process.cwd(), "public", "telemetry.js"),
    "utf8"
  );

  await app.register(cookie, { secret: config.cookieSecret });
  await app.register(formbody);

  function getOrCreateVisitor(
    request: FastifyRequest,
    reply: FastifyReply
  ): VisitorIdentity {
    const signedValue = request.cookies[config.visitCookieName];
    if (signedValue) {
      const unsigned = request.unsignCookie(signedValue);
      if (unsigned.valid && unsigned.value && unsigned.value.length <= 128) {
        return { id: unsigned.value, hadValidCookie: true };
      }
    }

    const id = randomUUID();
    reply.setCookie(config.visitCookieName, id, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: config.cookieSecure,
      signed: true,
      maxAge: 60 * 60 * 24 * 30
    });
    return { id, hadValidCookie: false };
  }

  app.addHook("onClose", async () => {
    await repository.close();
  });

  app.get("/health", async (_request, reply) => {
    return reply.type("application/json").send({ status: "ok" });
  });

  app.get("/telemetry.js", async (_request, reply) => {
    return reply
      .header("cache-control", "no-store")
      .header("x-content-type-options", "nosniff")
      .type("application/javascript; charset=utf-8")
      .send(telemetryScript);
  });

  app.get("/", async (request, reply) => {
    const visitor = getOrCreateVisitor(request, reply);
    const pageToken = issuePageToken(
      clock(),
      config.pageTokenTtlMs,
      visitor.id,
      config.pageTokenSecret,
      config.hashSecret
    );
    return reply
      .header("cache-control", "private, no-store")
      .header(
        "content-security-policy",
        "default-src 'none'; script-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"
      )
      .header("referrer-policy", "strict-origin-when-cross-origin")
      .header("x-content-type-options", "nosniff")
      .header("x-frame-options", "DENY")
      .type("text/html; charset=utf-8")
      .send(renderPrelander(pageToken));
  });

  app.post("/api/decision", async (request, reply) => {
    const visitor = getOrCreateVisitor(request, reply);
    const outcome = await decisionService.decide({
      requestId: request.id,
      rawBody: request.body,
      headers: request.headers,
      ip: request.ip,
      visitorId: visitor.id,
      hadValidVisitCookie: visitor.hadValidCookie
    });

    request.log.info(
      {
        decision: outcome.decision,
        primaryReason: outcome.primaryReason,
        automationRisk: outcome.score.automationRisk,
        intentScore: outcome.score.intentScore,
        coverage: outcome.score.coverage
      },
      "visitor decision"
    );

    return reply
      .header("cache-control", "no-store")
      .header("x-content-type-options", "nosniff")
      .type("text/plain; charset=utf-8")
      .send(outcome.url);
  });

  app.post("/submit", async (request, reply) => {
    const visitor = getOrCreateVisitor(request, reply);
    const outcome = await decisionService.decide({
      requestId: request.id,
      rawBody: request.body,
      headers: request.headers,
      ip: request.ip,
      visitorId: visitor.id,
      hadValidVisitCookie: visitor.hadValidCookie
    });

    return reply
      .code(303)
      .header("cache-control", "no-store")
      .header("location", outcome.url)
      .send();
  });

  app.get("/demo/offer", async (_request, reply) => {
    return reply.type("text/html; charset=utf-8").send(
      "<!doctype html><html><body><h1>Offer destination</h1><p>Demo target reached.</p></body></html>"
    );
  });

  app.get("/demo/whitepage", async (_request, reply) => {
    return reply.type("text/html; charset=utf-8").send(
      "<!doctype html><html><body><h1>Information page</h1><p>The requested destination is not available.</p></body></html>"
    );
  });

  app.get("/demo/blocked", async (_request, reply) => {
    return reply.code(403).type("text/html; charset=utf-8").send(
      "<!doctype html><html><body><h1>Access unavailable</h1></body></html>"
    );
  });

  app.setErrorHandler(async (error, request, reply) => {
    request.log.error({ err: error }, "request failed");

    const errorCode =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof (error as { code?: unknown }).code === "string"
        ? (error as { code: string }).code
        : undefined;
    const parserError = errorCode?.startsWith("FST_ERR_CTP_") === true;
    if (parserError && (request.url.startsWith("/api/decision") || request.url.startsWith("/submit"))) {
      try {
        const visitor = getOrCreateVisitor(request, reply);
        const outcome = await decisionService.decide({
          requestId: request.id,
          rawBody: { parserError: errorCode ?? "UNKNOWN_CONTENT_TYPE_ERROR" },
          headers: request.headers,
          ip: request.ip,
          visitorId: visitor.id,
          hadValidVisitCookie: visitor.hadValidCookie
        });

        if (request.url.startsWith("/api/decision")) {
          return reply
            .code(200)
            .header("cache-control", "no-store")
            .type("text/plain; charset=utf-8")
            .send(outcome.url);
        }

        return reply
          .code(303)
          .header("cache-control", "no-store")
          .header("location", outcome.url)
          .send();
      } catch (auditError) {
        request.log.error({ err: auditError }, "failed to audit parser error");
      }
    }

    if (request.url.startsWith("/api/decision")) {
      return reply
        .code(200)
        .header("cache-control", "no-store")
        .type("text/plain; charset=utf-8")
        .send(config.whitepageUrl);
    }

    if (request.url.startsWith("/submit")) {
      return reply
        .code(303)
        .header("cache-control", "no-store")
        .header("location", config.whitepageUrl)
        .send();
    }

    return reply.code(500).type("text/plain; charset=utf-8").send("Internal Server Error");
  });

  return { app, config, repository };
}
