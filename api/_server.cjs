var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// server.ts
var server_exports = {};
__export(server_exports, {
  app: () => app,
  getClientIpKey: () => getClientIpKey,
  requireAuthRole: () => requireAuthRole,
  requireFollowupAccess: () => requireFollowupAccess,
  requirePastoralOversight: () => requirePastoralOversight
});
module.exports = __toCommonJS(server_exports);

// <define:import.meta>
var define_import_meta_default = {};

// server.ts
var import_config = require("dotenv/config");
var import_express2 = __toESM(require("express"), 1);
var import_http = require("http");
var import_express_rate_limit2 = __toESM(require("express-rate-limit"), 1);
var import_zod2 = require("zod");
var import_crypto6 = require("crypto");
var import_path = __toESM(require("path"), 1);
var import_url = require("url");

// lib/auth.ts
var import_crypto = require("crypto");
var import_jsonwebtoken = __toESM(require("jsonwebtoken"), 1);
var PRIMARY_CAMPUS_SITE_ID = "";
var TEST_ANCHOR_ORGANIZATION_ID = "a0000000-0000-4000-8000-000000000001";
var TEST_CAMPUS_SITE_ID = "b0000000-0000-4000-8000-000000000001";
var RUNTIME_SECURE_SECRET = (0, import_crypto.randomBytes)(32).toString("hex");
var externalIdentityVerifier = null;
function registerExternalIdentityVerifier(verifier) {
  externalIdentityVerifier = verifier;
}
function assertProductionAuthConfig(env = process.env) {
  const isStrict = env.STRICT_PROD_AUTH === "true";
  const hasJwt = Boolean(env.JWT_SECRET && env.JWT_SECRET.trim().length >= 16);
  const hasSupabase = Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
  const serviceSecret = env.SUPABASE_SERVICE_ROLE_KEY?.trim() || env.SUPABASE_SECRET_KEY?.trim();
  if (!hasJwt && !serviceSecret) {
    console.warn(
      "[Ekklesphere Security] Notice: JWT_SECRET (>=16 chars) not set. Auto-generating 256-bit cryptographically secure instance secret for session tokens."
    );
  }
  if (!hasSupabase) {
    console.warn(
      "[Ekklesphere Security] Notice: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured. Running in self-contained store mode."
    );
  }
  if (isStrict) {
    const missing = [];
    if (!hasJwt) {
      missing.push("JWT_SECRET (minimum 16 characters)");
    }
    if (!env.SUPABASE_URL || !env.SUPABASE_URL.trim()) {
      missing.push("SUPABASE_URL");
    }
    if (!env.SUPABASE_SERVICE_ROLE_KEY || !env.SUPABASE_SERVICE_ROLE_KEY.trim()) {
      missing.push("SUPABASE_SERVICE_ROLE_KEY");
    }
    if (missing.length > 0) {
      throw new Error(
        `[Ekklesphere Security] Strict mode enabled. Missing required environment variables: ${missing.join(", ")}`
      );
    }
  }
}
function getJwtSecret(env = process.env) {
  const configured = env.JWT_SECRET?.trim();
  if (configured && configured.length >= 16) {
    return configured;
  }
  if (configured && configured.length > 0) {
    console.warn("[Ekklesphere Security] JWT_SECRET is less than 16 characters. Using derived server key.");
  }
  if (env.STRICT_PROD_AUTH === "true" && env.NODE_ENV === "production") {
    throw new Error("CRITICAL: JWT_SECRET environment variable is required in production when STRICT_PROD_AUTH=true.");
  }
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim() || env.SUPABASE_SECRET_KEY?.trim();
  if (serviceRoleKey) {
    const scopeUrl = env.SUPABASE_URL?.trim() || env.VITE_SUPABASE_URL?.trim() || "supabase";
    return (0, import_crypto.createHmac)("sha256", serviceRoleKey).update(`ekklesphere-jwt-signing-v1:${scopeUrl}`).digest("hex");
  }
  return RUNTIME_SECURE_SECRET;
}
function getTemporaryPasswordSealKey(env = process.env) {
  return (0, import_crypto.createHash)("sha256").update(`ekklesphere-temp-pw-seal-v1:${getJwtSecret(env)}`).digest();
}
function sealTemporaryPassword(plaintext, env = process.env) {
  const clean = String(plaintext || "");
  if (!clean) return "";
  const iv = (0, import_crypto.randomBytes)(12);
  const cipher = (0, import_crypto.createCipheriv)("aes-256-gcm", getTemporaryPasswordSealKey(env), iv);
  const encrypted = Buffer.concat([cipher.update(clean, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64url")}:${tag.toString("base64url")}:${encrypted.toString("base64url")}`;
}
function unsealTemporaryPassword(sealed, env = process.env) {
  if (!sealed || typeof sealed !== "string") return void 0;
  const parts = sealed.split(":");
  if (parts.length !== 4 || parts[0] !== "v1") return void 0;
  try {
    const iv = Buffer.from(parts[1], "base64url");
    const tag = Buffer.from(parts[2], "base64url");
    const payload = Buffer.from(parts[3], "base64url");
    const decipher = (0, import_crypto.createDecipheriv)("aes-256-gcm", getTemporaryPasswordSealKey(env), iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(payload), decipher.final()]).toString("utf8");
    return decrypted || void 0;
  } catch {
    return void 0;
  }
}
function getTenantSecretSealKey(env = process.env) {
  const configured = (env.GATEWAY_SECRETS_KEY || "").trim();
  const base = configured.length >= 16 ? configured : getJwtSecret(env);
  return (0, import_crypto.createHash)("sha256").update(`ekklesphere-tenant-gateway-secret-v1:${base}`).digest();
}
function sealTenantSecret(plaintext, env = process.env) {
  const clean = String(plaintext || "").trim();
  if (!clean) return "";
  const iv = (0, import_crypto.randomBytes)(12);
  const cipher = (0, import_crypto.createCipheriv)("aes-256-gcm", getTenantSecretSealKey(env), iv);
  const encrypted = Buffer.concat([cipher.update(clean, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `tgv1:${iv.toString("base64url")}:${tag.toString("base64url")}:${encrypted.toString("base64url")}`;
}
function unsealTenantSecret(sealed, env = process.env) {
  if (!sealed || typeof sealed !== "string") return void 0;
  const parts = sealed.split(":");
  if (parts.length !== 4 || parts[0] !== "tgv1") return void 0;
  try {
    const iv = Buffer.from(parts[1], "base64url");
    const tag = Buffer.from(parts[2], "base64url");
    const payload = Buffer.from(parts[3], "base64url");
    const decipher = (0, import_crypto.createDecipheriv)("aes-256-gcm", getTenantSecretSealKey(env), iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(payload), decipher.final()]).toString("utf8");
    return decrypted || void 0;
  } catch {
    return void 0;
  }
}
function maskSecretTail(plaintext) {
  const clean = String(plaintext || "").trim();
  if (!clean) return null;
  if (clean.length <= 4) return "\u2022\u2022\u2022\u2022";
  return `\u2022\u2022\u2022\u2022${clean.slice(-4)}`;
}
function createServiceQrToken(organizationId, serviceId) {
  const org = String(organizationId || "").trim().toLowerCase();
  const svc = String(serviceId || "").trim().toLowerCase();
  const secret = getJwtSecret();
  return (0, import_crypto.createHmac)("sha256", secret).update(`ekklesphere-service-qr-v1:${org}:${svc}`).digest("base64url").slice(0, 24);
}
function verifyServiceQrToken(organizationId, serviceId, candidateToken) {
  const clean = typeof candidateToken === "string" ? candidateToken.trim() : "";
  if (!clean || !organizationId || !serviceId) return false;
  const expected = createServiceQrToken(organizationId, serviceId);
  const actualBuf = Buffer.from(clean, "utf8");
  const expectedBuf = Buffer.from(expected, "utf8");
  if (actualBuf.length !== expectedBuf.length) return false;
  return (0, import_crypto.timingSafeEqual)(actualBuf, expectedBuf);
}
var DEFAULT_IDLE_SESSION_TIMEOUT_MINUTES = 30;
var MAX_IDLE_SESSION_TIMEOUT_MINUTES = 480;
function normalizeIdleTimeoutMinutes(raw) {
  if (raw === void 0 || raw === null || raw === "") {
    return DEFAULT_IDLE_SESSION_TIMEOUT_MINUTES;
  }
  const num = Number(raw);
  if (!Number.isFinite(num)) return DEFAULT_IDLE_SESSION_TIMEOUT_MINUTES;
  if (num <= 0) return 0;
  return Math.max(1, Math.min(MAX_IDLE_SESSION_TIMEOUT_MINUTES, Math.round(num)));
}
var serverSessionRegistry = /* @__PURE__ */ new Map();
var revokedSessionIds = /* @__PURE__ */ new Set();
function pruneServerSessionRegistry(nowMs = Date.now()) {
  if (serverSessionRegistry.size <= 5e3) return;
  for (const [sid, entry] of serverSessionRegistry.entries()) {
    const expiredIdle = entry.idleTimeoutMs > 0 && nowMs - entry.lastActivityAt > entry.idleTimeoutMs;
    const staleAbsolute = nowMs - entry.lastActivityAt > 24 * 60 * 60 * 1e3;
    if (entry.revoked || expiredIdle || staleAbsolute) {
      serverSessionRegistry.delete(sid);
    }
  }
}
function resetSessionRegistryForTests() {
  serverSessionRegistry.clear();
  revokedSessionIds.clear();
}
function registerServerSession(params) {
  const nowMs = params.nowMs ?? Date.now();
  const minutes = normalizeIdleTimeoutMinutes(params.idleTimeoutMinutes);
  const idleTimeoutMs = minutes > 0 ? minutes * 6e4 : 0;
  const entry = {
    sid: params.sid,
    userId: params.userId,
    organizationId: params.organizationId,
    idleTimeoutMs,
    idleTimeoutMinutes: minutes,
    lastActivityAt: nowMs,
    createdAt: nowMs,
    revoked: false
  };
  revokedSessionIds.delete(params.sid);
  serverSessionRegistry.set(params.sid, entry);
  pruneServerSessionRegistry(nowMs);
  return entry;
}
function touchOrValidateServerSession(user, nowMs = Date.now()) {
  if (!user.sid) {
    return { ok: true };
  }
  if (revokedSessionIds.has(user.sid)) {
    return { ok: false, reason: "revoked" };
  }
  let entry = serverSessionRegistry.get(user.sid);
  if (!entry) {
    entry = registerServerSession({
      sid: user.sid,
      userId: user.id,
      organizationId: user.organization_id || user.tenant_id,
      idleTimeoutMinutes: user.idle_timeout_minutes ?? DEFAULT_IDLE_SESSION_TIMEOUT_MINUTES,
      nowMs
    });
    return {
      ok: true,
      lastActivityAt: entry.lastActivityAt,
      idleTimeoutMinutes: entry.idleTimeoutMinutes
    };
  }
  if (entry.revoked) {
    return { ok: false, reason: "revoked" };
  }
  if (entry.idleTimeoutMs > 0 && nowMs - entry.lastActivityAt > entry.idleTimeoutMs) {
    entry.revoked = true;
    revokedSessionIds.add(entry.sid);
    return { ok: false, reason: "timed_out" };
  }
  entry.lastActivityAt = nowMs;
  return {
    ok: true,
    lastActivityAt: entry.lastActivityAt,
    idleTimeoutMinutes: entry.idleTimeoutMinutes
  };
}
function revokeServerSession(sid) {
  if (!sid) return;
  revokedSessionIds.add(sid);
  const existing = serverSessionRegistry.get(sid);
  if (existing) {
    existing.revoked = true;
  }
}
function signToken(payload, expiresIn = "24h") {
  const secret = getJwtSecret();
  const orgId = payload.organization_id || payload.tenant_id;
  const isTrustedSessionOrigin = Boolean(payload.sid) || payload.auth_provider === "supabase";
  const isAuthorizedCreator = (payload.is_creator === true || payload.role === "creator" || payload.role === "super_admin") && (isTrustedSessionOrigin || isAuthorizedCreatorEmail(payload.email));
  const normalizedPayload = {
    ...payload,
    organization_id: orgId,
    tenant_id: orgId,
    campus_id: payload.campus_id,
    role: (payload.role === "creator" || payload.role === "super_admin") && !isAuthorizedCreator ? "member" : payload.role,
    is_creator: isAuthorizedCreator,
    auth_provider: payload.auth_provider || "session_jwt"
  };
  return import_jsonwebtoken.default.sign(normalizedPayload, secret, { expiresIn });
}
function signSessionToken(payload, idleTimeoutMinutes) {
  const minutes = normalizeIdleTimeoutMinutes(idleTimeoutMinutes);
  const sid = (0, import_crypto.randomBytes)(16).toString("hex");
  registerServerSession({
    sid,
    userId: payload.id,
    organizationId: payload.organization_id || payload.tenant_id,
    idleTimeoutMinutes: minutes
  });
  const jwtMinutes = minutes > 0 ? minutes : 24 * 60;
  const expiresIn = `${jwtMinutes}m`;
  const expiresAt = new Date(Date.now() + jwtMinutes * 6e4).toISOString();
  const token = signToken(
    {
      ...payload,
      sid,
      idle_timeout_minutes: minutes
    },
    expiresIn
  );
  return { token, sid, idleTimeoutMinutes: minutes, expiresAt };
}
function verifyToken(token) {
  const secret = getJwtSecret();
  const decoded = import_jsonwebtoken.default.verify(token, secret);
  const orgId = decoded.organization_id || decoded.tenant_id;
  const isTrustedSessionOrigin = Boolean(decoded.sid) || decoded.auth_provider === "supabase";
  const isAuthorizedCreator = (decoded.is_creator === true || decoded.role === "creator" || decoded.role === "super_admin") && (isTrustedSessionOrigin || isAuthorizedCreatorEmail(decoded.email));
  return {
    ...decoded,
    organization_id: orgId,
    tenant_id: orgId,
    campus_id: decoded.campus_id,
    role: (decoded.role === "creator" || decoded.role === "super_admin") && !isAuthorizedCreator ? "member" : decoded.role,
    is_creator: isAuthorizedCreator
  };
}
async function resolveVerifiedUserFromToken(token) {
  let localJwtError = null;
  try {
    return verifyToken(token);
  } catch (err) {
    localJwtError = err;
    if (err?.name === "TokenExpiredError") {
      throw err;
    }
  }
  if (externalIdentityVerifier) {
    const verifiedSupabaseUser = await externalIdentityVerifier(token);
    if (verifiedSupabaseUser) {
      return verifiedSupabaseUser;
    }
  }
  throw localJwtError || new Error("Invalid token signature");
}
function extractBearerToken(req) {
  const authHeader = req.headers.authorization;
  if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    const raw = authHeader.slice(7).trim();
    return raw.length > 0 ? raw : null;
  }
  return null;
}
var AUTHORIZED_CREATOR_EMAILS = [
  "akokosolutions24@gmail.com",
  "amoakoemmanuel2020@gmail.com",
  "creator@ekklesphere.platform",
  "creator@ekklesphere.church",
  "admin@ekklesphere.church"
];
function isAuthorizedCreatorEmail(email) {
  if (!email || typeof email !== "string") return false;
  const normalized = email.trim().toLowerCase();
  const envEmail = (process.env.CREATOR_EMAIL || process.env.VITE_CREATOR_EMAIL || "")?.trim().toLowerCase();
  return AUTHORIZED_CREATOR_EMAILS.includes(normalized) || Boolean(envEmail && normalized === envEmail);
}
function isCreatorClaim(user) {
  if (!user) return false;
  const isCreatorRole = user.is_creator === true || user.role === "creator" || user.role === "super_admin";
  if (!isCreatorRole) return false;
  return Boolean(user.sid) || user.auth_provider === "supabase" || isAuthorizedCreatorEmail(user.email);
}
async function requireUser(req, res, next) {
  const token = extractBearerToken(req);
  if (!token) {
    res.status(401).json({
      error: "unauthorized",
      message: "Authentication required. Missing or malformed Bearer token."
    });
    return;
  }
  try {
    const decoded = await resolveVerifiedUserFromToken(token);
    const sessionCheck = touchOrValidateServerSession(decoded);
    if (!sessionCheck.ok) {
      const isTimeout = sessionCheck.reason === "timed_out";
      res.status(401).json({
        error: isTimeout ? "session_timed_out" : "unauthorized",
        code: isTimeout ? "SESSION_TIMEOUT" : "SESSION_REVOKED",
        message: isTimeout ? "Your session timed out due to inactivity. Please sign in again." : "Your session has ended. Please sign in again."
      });
      return;
    }
    req.user = decoded;
    const orgId = decoded.organization_id || decoded.tenant_id;
    req.organizationId = orgId;
    req.tenant_id = orgId;
    req.campus_id = decoded.campus_id;
    next();
  } catch (err) {
    const expired = err?.name === "TokenExpiredError";
    res.status(401).json({
      error: expired ? "session_timed_out" : "unauthorized",
      code: expired ? "SESSION_TIMEOUT" : "INVALID_TOKEN",
      message: expired ? "Your session has expired. Please sign in again." : "Invalid token signature"
    });
  }
}
function requireCreator(req, res, next) {
  if (!req.user) {
    res.status(401).json({
      error: "unauthorized",
      message: "Authentication required for Creator Console access."
    });
    return;
  }
  if (!isCreatorClaim(req.user)) {
    res.status(403).json({
      error: "creator_required",
      message: "Access denied. Verified platform creator claim in app_metadata is required."
    });
    return;
  }
  next();
}
function requireRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      res.status(401).json({ error: "unauthorized", message: "Authentication required." });
      return;
    }
    const { role } = req.user;
    if (isCreatorClaim(req.user)) {
      return next();
    }
    if (allowedRoles.includes(role)) {
      return next();
    }
    res.status(403).json({
      error: "forbidden",
      message: `Access denied. Role '${role}' does not possess required church permissions.`
    });
  };
}
function hasPastoralOversightAccess(user) {
  if (!user) return false;
  if (user.is_creator) return true;
  if (user.role === "super_admin" || user.role === "creator" || user.role === "admin" || user.role === "pastor") {
    return true;
  }
  const cleanDesignation = String(user.designation || "").trim().toLowerCase();
  if (!cleanDesignation) return false;
  return /\b(administrator|senior pastor|associate pastor|presiding elder|youth pastor|pastor|bishop|reverend)\b/i.test(
    cleanDesignation
  );
}

// src/middleware/organizationMiddleware.ts
var UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
var supportGrantLookup = null;
function registerSupportGrantLookup(lookup) {
  supportGrantLookup = lookup;
}
var userOrganizationResolver = null;
function registerUserOrganizationResolver(resolver) {
  userOrganizationResolver = resolver;
}
function expressOrganizationMiddleware(req, _res, next) {
  req.organizationId = void 0;
  req.tenant_id = void 0;
  next();
}
function extractClientRequestedOrgId(req) {
  const candidates = [
    req.headers["x-organization-id"],
    req.headers["x-tenant-id"],
    req.query?.organization_id,
    req.query?.organizationId,
    req.query?.tenant_id,
    req.query?.tenantId,
    req.body && typeof req.body === "object" ? req.body.organization_id || req.body.organizationId || req.body.tenant_id || req.body.tenantId : void 0
  ];
  for (const val of candidates) {
    if (typeof val === "string" && UUID_REGEX.test(val.trim())) {
      return val.trim().toLowerCase();
    }
  }
  return null;
}
async function enforceOrganizationScope(req, res, next) {
  if (!req.user) {
    res.status(401).json({
      error: "unauthorized",
      message: "Verified identity required before resolving organization scope."
    });
    return;
  }
  let verifiedOrgId = (req.user.organization_id || req.user.tenant_id || "").toLowerCase();
  if (!verifiedOrgId && userOrganizationResolver) {
    try {
      const resolved = await userOrganizationResolver(req.user);
      if (resolved && UUID_REGEX.test(resolved.trim())) {
        verifiedOrgId = resolved.trim().toLowerCase();
        req.user.organization_id = verifiedOrgId;
        req.user.tenant_id = verifiedOrgId;
      }
    } catch {
    }
  }
  const supportGrantHeader = req.headers["x-support-grant-id"];
  if (typeof supportGrantHeader === "string" && supportGrantHeader.trim()) {
    if (!isCreatorClaim(req.user)) {
      res.status(403).json({
        error: "forbidden",
        code: "SUPPORT_GRANT_FORBIDDEN",
        message: "Only verified platform creators may use support grants."
      });
      return;
    }
    if (!supportGrantLookup) {
      res.status(403).json({
        error: "forbidden",
        code: "SUPPORT_GRANT_UNAVAILABLE",
        message: "Support grant verification service is unavailable."
      });
      return;
    }
    const grant = await supportGrantLookup(supportGrantHeader.trim(), req.user.id);
    if (!grant) {
      res.status(403).json({
        error: "forbidden",
        code: "SUPPORT_GRANT_INVALID_OR_EXPIRED",
        message: "Support grant is invalid, revoked, or expired."
      });
      return;
    }
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method.toUpperCase())) {
      res.status(403).json({
        error: "support_grant_read_only",
        code: "SUPPORT_GRANT_READ_ONLY",
        message: "View-as-Admin support grants are strictly read-only. Mutations are blocked."
      });
      return;
    }
    req.supportGrant = grant;
    req.organizationId = grant.organizationId.toLowerCase();
    req.tenant_id = grant.organizationId.toLowerCase();
    res.setHeader("x-organization-id", req.organizationId);
    res.setHeader("x-support-grant-mode", "read_only");
    next();
    return;
  }
  const requestedOrgId = extractClientRequestedOrgId(req);
  if (!isCreatorClaim(req.user)) {
    if (!verifiedOrgId) {
      res.status(403).json({
        error: "unassigned_organization",
        code: "NO_ORGANIZATION_MEMBERSHIP",
        message: "Your account is not assigned to an active church organization in the database."
      });
      return;
    }
    if (requestedOrgId && requestedOrgId !== verifiedOrgId) {
      res.status(403).json({
        error: "cross_organization_forbidden",
        code: "CROSS_ORGANIZATION_FORBIDDEN",
        message: "Cross-organization access denied. Organization scope is bound to your verified membership."
      });
      return;
    }
    req.organizationId = verifiedOrgId;
    req.tenant_id = verifiedOrgId;
    res.setHeader("x-organization-id", verifiedOrgId);
    next();
    return;
  }
  const effectiveOrgId = requestedOrgId || verifiedOrgId;
  req.organizationId = effectiveOrgId;
  req.tenant_id = effectiveOrgId;
  if (effectiveOrgId) {
    res.setHeader("x-organization-id", effectiveOrgId);
  }
  next();
}

// src/utils/serviceStatus.ts
function parseClockMinutes(clock, fallbackHours = 8, fallbackMinutes = 0) {
  if (typeof clock === "string") {
    const match = clock.trim().match(/^(\d{1,2}):(\d{2})/);
    if (match) {
      return {
        h: Math.min(23, Math.max(0, Number(match[1]) || 0)),
        m: Math.min(59, Math.max(0, Number(match[2]) || 0))
      };
    }
  }
  return { h: fallbackHours, m: fallbackMinutes };
}
function buildLocalDateMs(dateStr, clock, fallbackHours = 8, fallbackMinutes = 0) {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim())) return null;
  const [y, m, d] = dateStr.trim().split("-").map(Number);
  const { h, m: min } = parseClockMinutes(clock, fallbackHours, fallbackMinutes);
  const dt = new Date(y, m - 1, d, h, min, 0, 0);
  const ms = dt.getTime();
  return Number.isNaN(ms) ? null : ms;
}
function resolveServiceWindow(input) {
  const nowMs = typeof input.nowMs === "number" && Number.isFinite(input.nowMs) ? input.nowMs : Date.now();
  const allowanceMinutes = Math.max(0, Number(input.allowanceMinutes ?? 0) || 0);
  const allowanceMs = allowanceMinutes * 6e4;
  let startMs = null;
  if (typeof input.startTimeIso === "string" && input.startTimeIso.trim()) {
    const parsed = Date.parse(input.startTimeIso);
    if (!Number.isNaN(parsed)) startMs = parsed;
  }
  if (startMs === null) {
    startMs = buildLocalDateMs(input.date, input.startsAt, 8, 0);
  }
  let endMs = null;
  if (typeof input.endTimeIso === "string" && input.endTimeIso.trim()) {
    const parsed = Date.parse(input.endTimeIso);
    if (!Number.isNaN(parsed)) endMs = parsed;
  }
  if (endMs === null) {
    endMs = buildLocalDateMs(input.date, input.endsAt, 10, 30);
  }
  if (startMs !== null && endMs !== null && endMs <= startMs) {
    endMs += 24 * 60 * 60 * 1e3;
  }
  const effectiveEndMs = endMs !== null ? endMs + allowanceMs : null;
  const closesAtIso = effectiveEndMs !== null ? new Date(effectiveEndMs).toISOString() : null;
  const raw = String(input.rawStatus || "").trim().toLowerCase();
  if (raw === "closed" || raw === "completed" || raw === "cancelled") {
    return {
      status: "closed",
      startMs,
      endMs,
      effectiveEndMs,
      allowanceMinutes,
      closesAtIso
    };
  }
  if (startMs !== null && effectiveEndMs !== null) {
    const isLive = nowMs >= startMs && nowMs <= effectiveEndMs;
    return {
      status: isLive ? "live" : "closed",
      startMs,
      endMs,
      effectiveEndMs,
      allowanceMinutes,
      closesAtIso
    };
  }
  return {
    status: raw === "active" || raw === "open" || raw === "live" ? "live" : "closed",
    startMs,
    endMs,
    effectiveEndMs,
    allowanceMinutes,
    closesAtIso
  };
}

// src/utils/serviceQr.ts
function formatServiceShortCode(serviceId) {
  const clean = String(serviceId || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  if (!clean) return "SVC-000000";
  return `SVC-${clean.slice(0, 8)}`;
}
function buildServiceQrCheckInPath(params) {
  const sp = new URLSearchParams();
  sp.set("checkin", "service");
  sp.set("serviceId", params.serviceId);
  if (params.organizationId) {
    sp.set("orgId", params.organizationId);
  }
  if (params.qrToken) {
    sp.set("token", params.qrToken);
  }
  return `/app?${sp.toString()}`;
}

// src/server/platformStore.ts
var import_supabase_js2 = require("@supabase/supabase-js");
var import_crypto4 = require("crypto");

// src/server/paystackService.ts
var import_crypto2 = require("crypto");
function detectPaystackMode(publicKey, secretKey) {
  const pub = String(publicKey || "").trim().toLowerCase();
  const sec = String(secretKey || "").trim().toLowerCase();
  if (sec.startsWith("sk_live_") || pub.startsWith("pk_live_")) return "live";
  if (sec.startsWith("sk_test_") || pub.startsWith("pk_test_")) return "test";
  if (sec.length > 0 || pub.length > 0) return "test";
  return "unconfigured";
}
function verifyPaystackWebhookSignature(params) {
  const secret = (params.secretKey || "").trim();
  const sig = String(params.signature || "").trim().toLowerCase();
  if (!secret || !sig) return false;
  const expected = (0, import_crypto2.createHmac)("sha512", secret).update(params.rawBody).digest("hex").toLowerCase();
  const sigBuf = Buffer.from(sig, "utf8");
  const expBuf = Buffer.from(expected, "utf8");
  if (sigBuf.length !== expBuf.length) return false;
  return (0, import_crypto2.timingSafeEqual)(sigBuf, expBuf);
}
async function initializePaystackTransaction(params) {
  const secretKey = String(params.secretKey || "").trim();
  const mode = detectPaystackMode(params.publicKey, secretKey);
  if (!secretKey) {
    return {
      ok: false,
      configured: false,
      reference: params.reference,
      mode: "unconfigured",
      message: "Paystack Secret Key is not configured for this church tenant. Add it in Admin Dashboard \u2192 System Settings \u2192 SMS & Paystack Gateways.",
      error: "PAYSTACK_NOT_CONFIGURED"
    };
  }
  const doFetch = params.fetchImpl || fetch;
  try {
    const resp = await doFetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email: params.email,
        amount: Math.max(100, Math.round(params.amountMinor)),
        currency: (params.currency || "GHS").toUpperCase(),
        reference: params.reference,
        ...params.callbackUrl ? { callback_url: params.callbackUrl } : {},
        ...params.channels && params.channels.length > 0 ? { channels: params.channels } : {},
        ...params.metadata ? { metadata: params.metadata } : {}
      })
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || data?.status !== true || !data?.data?.authorization_url) {
      return {
        ok: false,
        configured: true,
        reference: params.reference,
        mode,
        message: data?.message || `Paystack initialization failed with HTTP ${resp.status}.`,
        error: "PAYSTACK_INIT_FAILED"
      };
    }
    return {
      ok: true,
      configured: true,
      authorizationUrl: String(data.data.authorization_url),
      accessCode: String(data.data.access_code || ""),
      reference: String(data.data.reference || params.reference),
      mode,
      message: "Paystack checkout initialized."
    };
  } catch (err) {
    return {
      ok: false,
      configured: true,
      reference: params.reference,
      mode,
      message: err?.message || "Network error reaching Paystack API.",
      error: "PAYSTACK_NETWORK_ERROR"
    };
  }
}
async function verifyPaystackTransaction(params) {
  const secretKey = String(params.secretKey || "").trim();
  const reference = String(params.reference || "").trim();
  if (!secretKey) {
    return {
      ok: false,
      verified: false,
      status: "pending",
      reference,
      message: "Paystack Secret Key is not configured for this church tenant.",
      error: "PAYSTACK_NOT_CONFIGURED"
    };
  }
  if (!reference) {
    return {
      ok: false,
      verified: false,
      status: "failed",
      reference,
      message: "Transaction reference is required for Paystack verification.",
      error: "REFERENCE_REQUIRED"
    };
  }
  const doFetch = params.fetchImpl || fetch;
  try {
    const resp = await doFetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${secretKey}`
        }
      }
    );
    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok || payload?.status !== true || !payload?.data) {
      return {
        ok: false,
        verified: false,
        status: "pending",
        reference,
        message: payload?.message || `Paystack verification failed with HTTP ${resp.status}.`,
        error: "PAYSTACK_VERIFY_FAILED"
      };
    }
    const txStatus = String(payload.data.status || "").toLowerCase();
    const mappedStatus = txStatus === "success" ? "paid" : txStatus === "failed" || txStatus === "abandoned" || txStatus === "reversed" ? "failed" : "pending";
    return {
      ok: true,
      verified: mappedStatus === "paid",
      status: mappedStatus,
      reference: String(payload.data.reference || reference),
      amountMinor: typeof payload.data.amount === "number" ? payload.data.amount : void 0,
      currency: payload.data.currency ? String(payload.data.currency) : void 0,
      channel: payload.data.channel ? String(payload.data.channel) : void 0,
      paidAt: payload.data.paid_at ? String(payload.data.paid_at) : void 0,
      gatewayResponse: payload.data.gateway_response ? String(payload.data.gateway_response) : void 0,
      message: mappedStatus === "paid" ? "Payment verified with Paystack." : `Paystack transaction status is "${txStatus || "pending"}".`
    };
  } catch (err) {
    return {
      ok: false,
      verified: false,
      status: "pending",
      reference,
      message: err?.message || "Network error reaching Paystack verify API.",
      error: "PAYSTACK_NETWORK_ERROR"
    };
  }
}
async function testPaystackConnection(params) {
  const secretKey = String(params.secretKey || "").trim();
  const mode = detectPaystackMode(params.publicKey, secretKey);
  if (!secretKey) {
    return {
      ok: false,
      configured: false,
      mode: "unconfigured",
      message: "No Paystack Secret Key is configured for this church tenant.",
      error: "PAYSTACK_NOT_CONFIGURED"
    };
  }
  const doFetch = params.fetchImpl || fetch;
  try {
    const resp = await doFetch("https://api.paystack.co/transaction?perPage=1", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${secretKey}`
      }
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || data?.status !== true) {
      return {
        ok: false,
        configured: true,
        mode,
        message: data?.message || `Paystack rejected the Secret Key (HTTP ${resp.status}). Verify your key in Paystack Dashboard.`,
        error: "PAYSTACK_AUTH_FAILED"
      };
    }
    return {
      ok: true,
      configured: true,
      mode,
      message: `Paystack ${mode === "live" ? "Live" : "Test"} API connection verified.`
    };
  } catch (err) {
    return {
      ok: false,
      configured: true,
      mode,
      message: err?.message || "Network error verifying Paystack connection.",
      error: "PAYSTACK_NETWORK_ERROR"
    };
  }
}

// src/server/communicationsService.ts
function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function buildHtmlFromPlainText(subject, text, orgName) {
  const safeOrg = escapeHtml((orgName || "Ekklesphere Church").trim());
  const safeSubject = escapeHtml(subject.trim());
  const paragraphs = text.split(/\n{2,}/).map((block) => `<p style="margin:0 0 12px 0;line-height:1.6;">${escapeHtml(block).replace(/\n/g, "<br/>")}</p>`).join("");
  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:24px;background:#F6F7FC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1D1B3A;">
  <div style="max-width:560px;margin:0 auto;background:#FFFFFF;border:1px solid #E9EBF5;border-radius:16px;padding:24px;">
    <div style="font-size:12px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#6D5CF2;margin-bottom:8px;">${safeOrg}</div>
    <h2 style="margin:0 0 16px 0;font-size:18px;line-height:1.3;color:#1D1B3A;">${safeSubject}</h2>
    <div style="font-size:14px;color:#3E4259;">${paragraphs}</div>
    <hr style="border:none;border-top:1px solid #E9EBF5;margin:20px 0 12px 0;" />
    <div style="font-size:11px;color:#666A86;">Sent via ${safeOrg} pastoral &amp; congregational communications.</div>
  </div>
</body>
</html>`;
}
function normalizeArkeselPhone(raw) {
  const value = String(raw || "").trim();
  if (!value) return null;
  let digits = value.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("00")) {
    digits = digits.slice(2);
  }
  if (digits.startsWith("0") && digits.length === 10) {
    digits = `233${digits.slice(1)}`;
  }
  if (digits.length < 9 || digits.length > 15) {
    return null;
  }
  return digits;
}
function getCommunicationGatewayStatus() {
  const arkeselKey = (process.env.ARKESEL_API_KEY || "").trim();
  const resendKey = (process.env.RESEND_API_KEY || "").trim();
  const defaultSmsSenderId = ((process.env.ARKESEL_SENDER_ID || "EKKLESPHERE").trim() || "EKKLESPHERE").replace(/[^A-Za-z0-9 ]/g, "").toUpperCase().slice(0, 11);
  const defaultFromEmail = (process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev").trim() || "onboarding@resend.dev";
  const defaultFromName = (process.env.RESEND_FROM_NAME || "Ekklesphere Church").trim() || "Ekklesphere Church";
  return {
    arkeselConfigured: Boolean(arkeselKey),
    resendConfigured: Boolean(resendKey),
    defaultSmsSenderId,
    defaultFromEmail,
    defaultFromName
  };
}
async function sendArkeselSms(params) {
  const status = getCommunicationGatewayStatus();
  const apiKey = (params.apiKey ?? process.env.ARKESEL_API_KEY ?? "").trim();
  const cleanSenderId = (params.senderId || status.defaultSmsSenderId || "EKKLESPHERE").trim().replace(/[^A-Za-z0-9 ]/g, "").toUpperCase().slice(0, 11);
  const uniqueRecipients = /* @__PURE__ */ new Set();
  let invalidCount = 0;
  for (const raw of params.recipients) {
    const normalized = normalizeArkeselPhone(raw);
    if (normalized) {
      uniqueRecipients.add(normalized);
    } else if (String(raw || "").trim()) {
      invalidCount++;
    }
  }
  const recipients = Array.from(uniqueRecipients);
  if (recipients.length === 0) {
    return {
      ok: false,
      configured: Boolean(apiKey),
      provider: "Arkesel SMS",
      senderId: cleanSenderId,
      sentCount: 0,
      invalidCount,
      recipients: [],
      message: "No valid recipient phone numbers were found to send SMS.",
      error: "NO_VALID_RECIPIENTS"
    };
  }
  if (!apiKey) {
    return {
      ok: false,
      configured: false,
      provider: "Arkesel SMS",
      senderId: cleanSenderId,
      sentCount: 0,
      invalidCount,
      recipients,
      message: "Arkesel API key is not configured on the server (set ARKESEL_API_KEY in environment secrets).",
      error: "ARKESEL_NOT_CONFIGURED"
    };
  }
  const doFetch = params.fetchImpl || fetch;
  const bodyPayload = {
    sender: cleanSenderId,
    message: params.message,
    recipients
  };
  if (params.sandbox) {
    bodyPayload.sandbox = true;
  }
  try {
    const resp = await doFetch("https://sms.arkesel.com/api/v2/sms/send", {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify(bodyPayload)
    });
    const data = await resp.json().catch(() => ({}));
    const apiOk = resp.ok && (data?.status === "success" || data?.code === "200" || data?.data !== void 0 || !data?.status);
    if (!apiOk) {
      const errMsg = data?.message || data?.error || `Arkesel SMS request failed with HTTP ${resp.status}.`;
      return {
        ok: false,
        configured: true,
        provider: "Arkesel SMS",
        senderId: cleanSenderId,
        sentCount: 0,
        invalidCount,
        recipients,
        message: errMsg,
        providerResponse: data,
        error: "ARKESEL_API_ERROR"
      };
    }
    return {
      ok: true,
      configured: true,
      provider: "Arkesel SMS",
      senderId: cleanSenderId,
      sentCount: recipients.length,
      invalidCount,
      recipients,
      message: `SMS delivered via Arkesel to ${recipients.length} recipient${recipients.length === 1 ? "" : "s"} (Sender ID: ${cleanSenderId}).`,
      providerResponse: data
    };
  } catch (err) {
    return {
      ok: false,
      configured: true,
      provider: "Arkesel SMS",
      senderId: cleanSenderId,
      sentCount: 0,
      invalidCount,
      recipients,
      message: err?.message || "Network error reaching Arkesel SMS API.",
      error: "ARKESEL_NETWORK_ERROR"
    };
  }
}
async function sendResendEmail(params) {
  const status = getCommunicationGatewayStatus();
  const apiKey = (params.apiKey ?? process.env.RESEND_API_KEY ?? "").trim();
  const cleanFromEmail = (params.fromEmail || status.defaultFromEmail || "onboarding@resend.dev").trim();
  const cleanFromName = (params.fromName || params.organizationName || status.defaultFromName).trim();
  const fromHeader = cleanFromName ? `${cleanFromName} <${cleanFromEmail}>` : cleanFromEmail;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const recipients = Array.from(
    new Set(
      params.to.map((e) => String(e || "").trim().toLowerCase()).filter((e) => emailRegex.test(e))
    )
  );
  if (recipients.length === 0) {
    return {
      ok: false,
      configured: Boolean(apiKey),
      provider: "Resend Email",
      from: fromHeader,
      sentCount: 0,
      failedCount: 0,
      emailIds: [],
      message: "No valid recipient email addresses were found.",
      error: "NO_VALID_EMAIL_RECIPIENTS"
    };
  }
  if (!apiKey) {
    return {
      ok: false,
      configured: false,
      provider: "Resend Email",
      from: fromHeader,
      sentCount: 0,
      failedCount: recipients.length,
      emailIds: [],
      message: "Resend API key is not configured on the server (set RESEND_API_KEY in environment secrets).",
      error: "RESEND_NOT_CONFIGURED"
    };
  }
  const doFetch = params.fetchImpl || fetch;
  const htmlBody = params.html || buildHtmlFromPlainText(params.subject, params.text, params.organizationName);
  const emailIds = [];
  let failedCount = 0;
  let lastError = "";
  try {
    if (recipients.length === 1) {
      const resp = await doFetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify({
          from: fromHeader,
          to: [recipients[0]],
          subject: params.subject,
          text: params.text,
          html: htmlBody,
          ...params.replyTo ? { reply_to: params.replyTo } : {}
        })
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        return {
          ok: false,
          configured: true,
          provider: "Resend Email",
          from: fromHeader,
          sentCount: 0,
          failedCount: 1,
          emailIds: [],
          message: data?.message || data?.error || `Resend Email failed with HTTP ${resp.status}.`,
          error: "RESEND_API_ERROR"
        };
      }
      if (data?.id) emailIds.push(String(data.id));
      return {
        ok: true,
        configured: true,
        provider: "Resend Email",
        from: fromHeader,
        sentCount: 1,
        failedCount: 0,
        emailIds,
        message: `Email sent via Resend to ${recipients[0]}.`
      };
    }
    const chunkSize = 50;
    for (let i = 0; i < recipients.length; i += chunkSize) {
      const batch = recipients.slice(i, i + chunkSize).map((addr) => ({
        from: fromHeader,
        to: [addr],
        subject: params.subject,
        text: params.text,
        html: htmlBody,
        ...params.replyTo ? { reply_to: params.replyTo } : {}
      }));
      const resp = await doFetch("https://api.resend.com/emails/batch", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify(batch)
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        failedCount += batch.length;
        lastError = data?.message || data?.error || `Resend batch HTTP ${resp.status}`;
      } else if (Array.isArray(data?.data)) {
        for (const item of data.data) {
          if (item?.id) emailIds.push(String(item.id));
        }
      }
    }
    const sentCount = recipients.length - failedCount;
    if (sentCount <= 0) {
      return {
        ok: false,
        configured: true,
        provider: "Resend Email",
        from: fromHeader,
        sentCount: 0,
        failedCount,
        emailIds,
        message: lastError || "Resend could not deliver the broadcast emails.",
        error: "RESEND_API_ERROR"
      };
    }
    return {
      ok: true,
      configured: true,
      provider: "Resend Email",
      from: fromHeader,
      sentCount,
      failedCount,
      emailIds,
      message: `Email dispatched via Resend to ${sentCount} recipient${sentCount === 1 ? "" : "s"}${failedCount > 0 ? ` (${failedCount} failed)` : ""}.`
    };
  } catch (err) {
    return {
      ok: false,
      configured: true,
      provider: "Resend Email",
      from: fromHeader,
      sentCount: 0,
      failedCount: recipients.length,
      emailIds: [],
      message: err?.message || "Network error reaching Resend Email API.",
      error: "RESEND_NETWORK_ERROR"
    };
  }
}

// src/server/churchWallStore.ts
var import_supabase_js = require("@supabase/supabase-js");
var import_crypto3 = require("crypto");
function buildServiceClient() {
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || "").trim();
  if (!url || !key) return null;
  return (0, import_supabase_js.createClient)(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
function getInitials(name) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "MB";
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() || "").join("");
}
function mapRow(row) {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    authorId: String(row.author_id),
    authorName: String(row.author_name),
    authorInitials: String(row.author_initials || getInitials(String(row.author_name || "Member"))),
    authorAvatar: row.author_avatar ? String(row.author_avatar) : void 0,
    category: row.category === "testimony" || row.category === "celebration" ? row.category : "birthday",
    message: String(row.message),
    targetMemberId: row.target_member_id ? String(row.target_member_id) : void 0,
    targetMemberName: row.target_member_name ? String(row.target_member_name) : void 0,
    createdAt: String(row.created_at || (/* @__PURE__ */ new Date()).toISOString()),
    amens: Array.isArray(row.amens) ? row.amens.map(String) : []
  };
}
var ChurchWallStore = class {
  constructor() {
    this.fallbackByOrg = /* @__PURE__ */ new Map();
    this.isTestRuntime = Boolean(
      process.env.VITEST || process.env.NODE_ENV === "test"
    );
    this.supabase = this.isTestRuntime ? null : buildServiceClient();
  }
  assertDatabaseReady() {
    if (!this.supabase && !this.isTestRuntime) {
      const err = new Error(
        "Supabase database is not configured (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required). Operational data is never stored on the server."
      );
      err.code = "SUPABASE_NOT_CONFIGURED";
      err.status = 503;
      throw err;
    }
  }
  isMissingChurchWallTableError(error) {
    if (!error) return false;
    if (error.code === "PGRST205" || error.code === "42P01") return true;
    return /Could not find the table .*church_wall_posts|relation "?(?:public\.)?church_wall_posts"? does not exist|schema cache/i.test(
      error.message || ""
    );
  }
  createMissingTableError() {
    const err = new Error(
      "Church Wall table public.church_wall_posts is not initialized in Supabase yet. Run supabase/migrations/20261113000000_church_wall_posts.sql (or 20261118000000_remove_hardcoded_organizations.sql) in the Supabase SQL Editor."
    );
    err.code = "CHURCH_WALL_TABLE_MISSING";
    err.status = 503;
    return err;
  }
  async listPosts(organizationId, limit = 40) {
    this.assertDatabaseReady();
    if (this.supabase) {
      const { data, error } = await this.supabase.from("church_wall_posts").select("*").eq("organization_id", organizationId).order("created_at", { ascending: false }).limit(limit);
      if (error) {
        if (this.isMissingChurchWallTableError(error)) {
          console.warn(
            "[Ekklesphere ChurchWall] public.church_wall_posts missing from Supabase schema cache; returning empty list until migration is applied."
          );
          return [];
        }
        throw new Error(`Failed to load church wall posts from Supabase: ${error.message}`);
      }
      return Array.isArray(data) ? data.map(mapRow) : [];
    }
    return [...this.fallbackByOrg.get(organizationId) || []].slice(0, limit);
  }
  async createPost(organizationId, input) {
    this.assertDatabaseReady();
    const cleanName = input.authorName.trim() || "Church Member";
    const post = {
      id: (0, import_crypto3.randomUUID)(),
      organizationId,
      authorId: input.authorId,
      authorName: cleanName,
      authorInitials: getInitials(cleanName),
      authorAvatar: input.authorAvatar,
      category: input.category || "birthday",
      message: input.message.trim().slice(0, 600),
      targetMemberId: input.targetMemberId,
      targetMemberName: input.targetMemberName,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      amens: []
    };
    if (this.supabase) {
      const { data, error } = await this.supabase.from("church_wall_posts").insert({
        id: post.id,
        organization_id: post.organizationId,
        author_id: post.authorId,
        author_name: post.authorName,
        author_initials: post.authorInitials,
        author_avatar: post.authorAvatar || null,
        category: post.category,
        message: post.message,
        target_member_id: post.targetMemberId || null,
        target_member_name: post.targetMemberName || null,
        amens: post.amens,
        created_at: post.createdAt
      }).select("*").single();
      if (error) {
        if (this.isMissingChurchWallTableError(error)) {
          throw this.createMissingTableError();
        }
        throw new Error(`Failed to persist church wall post in Supabase: ${error.message}`);
      }
      if (!data) {
        throw new Error("Failed to persist church wall post in Supabase: unknown error");
      }
      return mapRow(data);
    }
    const existing = this.fallbackByOrg.get(organizationId) || [];
    this.fallbackByOrg.set(organizationId, [post, ...existing].slice(0, 100));
    return post;
  }
  async toggleAmen(organizationId, postId, actorId) {
    this.assertDatabaseReady();
    if (this.supabase) {
      const { data: existing, error: fetchErr } = await this.supabase.from("church_wall_posts").select("*").eq("organization_id", organizationId).eq("id", postId).maybeSingle();
      if (fetchErr) {
        if (this.isMissingChurchWallTableError(fetchErr)) {
          throw this.createMissingTableError();
        }
        throw new Error(`Failed to load church wall post in Supabase: ${fetchErr.message}`);
      }
      if (!existing) return null;
      const currentAmens = Array.isArray(existing.amens) ? existing.amens.map(String) : [];
      const hasReacted2 = currentAmens.includes(actorId);
      const nextAmens = hasReacted2 ? currentAmens.filter((id) => id !== actorId) : [...currentAmens, actorId];
      const { data: updated, error: updErr } = await this.supabase.from("church_wall_posts").update({ amens: nextAmens }).eq("organization_id", organizationId).eq("id", postId).select("*").single();
      if (updErr || !updated) {
        throw new Error(`Failed to update church wall reaction in Supabase: ${updErr?.message || "unknown error"}`);
      }
      return mapRow(updated);
    }
    const posts = this.fallbackByOrg.get(organizationId) || [];
    const index = posts.findIndex((p) => p.id === postId);
    if (index === -1) return null;
    const target = posts[index];
    const hasReacted = target.amens.includes(actorId);
    const updatedPost = {
      ...target,
      amens: hasReacted ? target.amens.filter((id) => id !== actorId) : [...target.amens, actorId]
    };
    const nextList = [...posts];
    nextList[index] = updatedPost;
    this.fallbackByOrg.set(organizationId, nextList);
    return updatedPost;
  }
  clearOrganizationInMemory(organizationId) {
    this.fallbackByOrg.delete(organizationId);
    this.fallbackByOrg.delete(organizationId.toLowerCase());
  }
};
var churchWallStore = new ChurchWallStore();

// src/constants/portfolios.ts
var CHURCH_PORTFOLIO_OPTIONS = [
  { value: "Member", label: "Member", category: "congregation" },
  { value: "Deacon", label: "Deacon", category: "officer" },
  { value: "Deaconess", label: "Deaconess", category: "officer" },
  { value: "Elder", label: "Elder", category: "officer" },
  { value: "Presiding Elder", label: "Presiding Elder", category: "officer" },
  { value: "Pastor", label: "Pastor", category: "clergy" },
  { value: "Senior Pastor", label: "Senior Pastor", category: "clergy" },
  { value: "Associate Pastor", label: "Associate Pastor", category: "clergy" },
  { value: "Youth Pastor", label: "Youth Pastor", category: "clergy" },
  { value: "Evangelist", label: "Evangelist", category: "clergy" },
  { value: "Cell Leader", label: "Cell Leader", category: "leader" },
  { value: "Ministry Leader", label: "Ministry Leader", category: "leader" },
  { value: "Department Head", label: "Department Head", category: "leader" },
  { value: "Usher Captain", label: "Usher Captain", category: "leader" },
  { value: "Choir Director", label: "Choir Director", category: "leader" },
  { value: "Prayer Coordinator", label: "Prayer Coordinator", category: "leader" },
  { value: "Treasurer", label: "Church Treasurer", category: "officer" },
  { value: "Church Secretary", label: "Church Secretary", category: "officer" },
  { value: "Guest", label: "Guest / Visitor", category: "congregation" }
];
var CHURCH_PORTFOLIOS = CHURCH_PORTFOLIO_OPTIONS.map((p) => p.value);
var PASTORAL_ELIGIBLE_SET = /* @__PURE__ */ new Set([
  "presiding elder",
  "elder",
  "deacon",
  "deaconess",
  "pastor",
  "senior pastor",
  "associate pastor",
  "youth pastor",
  "evangelist",
  "cell leader",
  "ministry leader",
  "department head",
  "prayer coordinator",
  "usher captain"
]);
var SENIOR_PASTORAL_SET = /* @__PURE__ */ new Set([
  "senior pastor",
  "presiding elder",
  "pastor",
  "associate pastor",
  "elder"
]);
function normalizePortfolioLabel(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}
function getMemberPortfolio(person) {
  if (!person) return "Member";
  const raw = normalizePortfolioLabel(person.officerName || person.designation);
  if (raw) return raw;
  return person.status === "visitor" ? "Guest" : "Member";
}
function isPastoralOfficerOrLeader(person) {
  if (!person) return false;
  if (person.status === "inactive" || person.status === "transferred" || person.status === "deceased" || person.status === "visitor") {
    return false;
  }
  const role = getMemberPortfolio(person).toLowerCase();
  if (PASTORAL_ELIGIBLE_SET.has(role)) return true;
  return /\b(deaconess|deacon|elder|pastor|bishop|reverend|rev\.?|evangelist|leader|head|coordinator|overseer)\b/i.test(
    role
  );
}
function isSeniorPastoralPortfolio(portfolio) {
  const clean = normalizePortfolioLabel(portfolio).toLowerCase();
  if (!clean) return false;
  if (SENIOR_PASTORAL_SET.has(clean)) return true;
  return /\b(senior pastor|presiding elder|elder|pastor|bishop|reverend)\b/i.test(clean);
}
function getPortfolioPriorityScore(portfolio) {
  const clean = normalizePortfolioLabel(portfolio).toLowerCase();
  if (clean.includes("senior pastor")) return 100;
  if (clean.includes("presiding elder")) return 95;
  if (clean.includes("pastor")) return 90;
  if (clean.includes("elder")) return 85;
  if (clean.includes("deaconess") || clean.includes("deacon")) return 75;
  if (clean.includes("evangelist") || clean.includes("prayer coordinator")) return 70;
  if (clean.includes("cell leader") || clean.includes("ministry leader") || clean.includes("department head")) {
    return 65;
  }
  if (clean.includes("captain") || clean.includes("treasurer") || clean.includes("secretary")) return 55;
  return 20;
}

// src/utils/birthMonth.ts
var BIRTH_MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
];
var MONTH_ALIASES = {
  jan: "January",
  january: "January",
  "1": "January",
  "01": "January",
  feb: "February",
  february: "February",
  "2": "February",
  "02": "February",
  mar: "March",
  march: "March",
  "3": "March",
  "03": "March",
  apr: "April",
  april: "April",
  "4": "April",
  "04": "April",
  may: "May",
  "5": "May",
  "05": "May",
  jun: "June",
  june: "June",
  "6": "June",
  "06": "June",
  jul: "July",
  july: "July",
  "7": "July",
  "07": "July",
  aug: "August",
  august: "August",
  "8": "August",
  "08": "August",
  sep: "September",
  sept: "September",
  september: "September",
  "9": "September",
  "09": "September",
  oct: "October",
  october: "October",
  "10": "October",
  nov: "November",
  november: "November",
  "11": "November",
  dec: "December",
  december: "December",
  "12": "December"
};
function normalizeMonthName(raw) {
  if (!raw || typeof raw !== "string") return void 0;
  let clean = raw.trim().toLowerCase();
  if (!clean) return void 0;
  clean = clean.replace(/\b(birthday\s*group|birthdays?|born\s*group|month\s*group)\b/gi, "").trim();
  if (MONTH_ALIASES[clean]) {
    return MONTH_ALIASES[clean];
  }
  for (const monthName of BIRTH_MONTH_NAMES) {
    const lower = monthName.toLowerCase();
    if (clean === lower || clean.startsWith(lower.slice(0, 3))) {
      return monthName;
    }
  }
  return void 0;
}
function extractMonthIndexFromDate(dateOfBirth) {
  if (!dateOfBirth || typeof dateOfBirth !== "string") return null;
  const trimmed = dateOfBirth.trim();
  if (!trimmed) return null;
  const isoMatch = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s].*)?$/);
  if (isoMatch) {
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return month - 1;
    }
    return null;
  }
  const dmyMatch = trimmed.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (dmyMatch) {
    const day = Number(dmyMatch[1]);
    const month = Number(dmyMatch[2]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return month - 1;
    }
    return null;
  }
  return null;
}
function deriveMonthOfBirth(dateOfBirth, fallbackMonth) {
  const idx = extractMonthIndexFromDate(dateOfBirth);
  if (idx !== null && BIRTH_MONTH_NAMES[idx]) {
    return BIRTH_MONTH_NAMES[idx];
  }
  return normalizeMonthName(fallbackMonth);
}
function formatBirthMonthGroupName(monthOrGroup) {
  const normalized = normalizeMonthName(monthOrGroup);
  if (!normalized) return void 0;
  return `${normalized} Birthday Group`;
}
function resolveMemberBirthFields(input) {
  const monthFromDob = deriveMonthOfBirth(input.dateOfBirth, void 0);
  const monthOfBirth = monthFromDob || normalizeMonthName(input.monthOfBirth) || normalizeMonthName(input.birthMonthGroup);
  const birthMonthGroup = monthOfBirth ? formatBirthMonthGroupName(monthOfBirth) : void 0;
  return {
    monthOfBirth,
    birthMonthGroup
  };
}
var ALL_BIRTH_MONTH_GROUPS = BIRTH_MONTH_NAMES.map((monthName, monthIndex) => ({
  monthIndex,
  monthName,
  groupName: `${monthName} Birthday Group`
}));

// src/utils/memberDepartments.ts
var GENERAL_CONGREGATION_LABEL = "General Congregation";
function cleanToken(raw) {
  return String(raw || "").trim().replace(/\s+/g, " ");
}
function isGeneralCongregationLabel(value) {
  const lower = cleanToken(value).toLowerCase();
  return !lower || lower === "general congregation" || lower === "general";
}
function parseMemberDepartments(input) {
  const rawTokens = Array.isArray(input) ? input.flatMap((item) => typeof item === "string" ? item.split(/[,;|\n]+/) : []) : typeof input === "string" ? input.split(/[,;|\n]+/) : [];
  const seen = /* @__PURE__ */ new Set();
  const result = [];
  for (const token of rawTokens) {
    const clean = cleanToken(token);
    if (!clean || isGeneralCongregationLabel(clean)) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(clean);
  }
  return result;
}
function resolveMemberDepartments(member) {
  if (!member) return [];
  if (Array.isArray(member.departments)) {
    const fromArray = parseMemberDepartments(member.departments);
    if (fromArray.length > 0) return fromArray;
    if (member.departments.length === 0 && isGeneralCongregationLabel(member.department)) {
      return [];
    }
  }
  return parseMemberDepartments(member.department);
}
function normalizeMemberDepartmentFields(input) {
  const departments = input.departments !== void 0 ? parseMemberDepartments(input.departments) : parseMemberDepartments(input.department);
  return {
    departments,
    department: departments.length > 0 ? departments.join(", ") : GENERAL_CONGREGATION_LABEL
  };
}

// src/utils/demographicMinistries.ts
var WOMEN_MINISTRY_LABEL = "Women's Ministry";
var MEN_MINISTRY_LABEL = "Men's Ministry";
var YOUTH_MINISTRY_LABEL = "Youth Ministry";
var YOUTH_MAX_AGE_EXCLUSIVE = 35;
function normalizeDemographicLabel(raw) {
  return String(raw || "").trim().replace(/[\u2018\u2019`]/g, "'").replace(/\s+/g, " ");
}
function parseYearMonthDay(dateOfBirth) {
  const raw = String(dateOfBirth || "").trim();
  if (!raw) return null;
  const isoMatch = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 1900 && year <= 2100) {
      return { year, month, day };
    }
    return null;
  }
  const slashMatch = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (slashMatch) {
    const first = Number(slashMatch[1]);
    const second = Number(slashMatch[2]);
    const year = Number(slashMatch[3]);
    const day = first > 12 || second <= 12 ? first : second;
    const month = first > 12 || second <= 12 ? second : first;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 1900 && year <= 2100) {
      return { year, month, day };
    }
  }
  return null;
}
function computeMemberAge(dateOfBirth, referenceDate = /* @__PURE__ */ new Date()) {
  const parts = parseYearMonthDay(dateOfBirth);
  if (!parts) return null;
  const refYear = referenceDate.getFullYear();
  const refMonth = referenceDate.getMonth() + 1;
  const refDay = referenceDate.getDate();
  let age = refYear - parts.year;
  if (refMonth < parts.month || refMonth === parts.month && refDay < parts.day) {
    age -= 1;
  }
  if (age < 0 || age > 130) return null;
  return age;
}
var WOMEN_EXACT_ALIASES = /* @__PURE__ */ new Set([
  "women",
  "women's",
  "womens",
  "women's ministry",
  "womens ministry",
  "women ministry",
  "women's fellowship",
  "womens fellowship",
  "women fellowship",
  "women's wing",
  "womens wing",
  "women wing",
  "women's department",
  "womens department",
  "women department"
]);
var MEN_EXACT_ALIASES = /* @__PURE__ */ new Set([
  "men",
  "men's",
  "mens",
  "men's ministry",
  "mens ministry",
  "men ministry",
  "men's fellowship",
  "mens fellowship",
  "men fellowship",
  "men's wing",
  "mens wing",
  "men wing",
  "men's department",
  "mens department",
  "men department"
]);
var YOUTH_EXACT_ALIASES = /* @__PURE__ */ new Set([
  "youth",
  "youth ministry",
  "youth's ministry",
  "youths ministry",
  "youth fellowship",
  "youth wing",
  "youth department",
  "youth & young adults",
  "youth and young adults",
  "youth church"
]);
function getAutomaticMinistryKind(groupName) {
  const clean = normalizeDemographicLabel(groupName).toLowerCase();
  if (!clean) return null;
  if (WOMEN_EXACT_ALIASES.has(clean)) return "women";
  if (MEN_EXACT_ALIASES.has(clean)) return "men";
  if (YOUTH_EXACT_ALIASES.has(clean)) return "youth";
  if (/\bwomen(?:'?s)?\s+(?:ministry|fellowship|wing|department)\b/i.test(clean)) {
    return "women";
  }
  if (/\bmen(?:'?s)?\s+(?:ministry|fellowship|wing|department)\b/i.test(clean)) {
    return "men";
  }
  if (/\byouth(?:'?s)?\s+(?:ministry|fellowship|wing|department|&\s*young\s+adults|and\s+young\s+adults)\b/i.test(clean)) {
    return "youth";
  }
  return null;
}
function resolveAutomaticDemographicMinistries(member, referenceDate = /* @__PURE__ */ new Date()) {
  if (!member) {
    return { kinds: [], names: [], ministries: [], age: null };
  }
  const ministries = [];
  const genderNorm = normalizeDemographicLabel(member.gender).toLowerCase();
  if (genderNorm === "female" || genderNorm === "f" || genderNorm === "woman") {
    ministries.push({
      kind: "women",
      name: WOMEN_MINISTRY_LABEL,
      reason: "Female Member",
      badgeLabel: "Auto \xB7 Female"
    });
  } else if (genderNorm === "male" || genderNorm === "m" || genderNorm === "man") {
    ministries.push({
      kind: "men",
      name: MEN_MINISTRY_LABEL,
      reason: "Male Member",
      badgeLabel: "Auto \xB7 Male"
    });
  }
  const age = computeMemberAge(member.dateOfBirth, referenceDate);
  if (age !== null && age >= 0 && age < YOUTH_MAX_AGE_EXCLUSIVE) {
    ministries.push({
      kind: "youth",
      name: YOUTH_MINISTRY_LABEL,
      reason: `Under 35 (Age ${age})`,
      badgeLabel: `Auto \xB7 Age ${age} (<35)`
    });
  }
  return {
    kinds: ministries.map((m) => m.kind),
    names: ministries.map((m) => m.name),
    ministries,
    age
  };
}

// src/shared/groupCategories.ts
var BUILT_IN_GROUP_CATEGORIES = [
  {
    id: "cell_group",
    label: "Cell Group",
    pluralLabel: "Cell Groups",
    description: "Home Small Group",
    color: "emerald",
    isBuiltIn: true
  },
  {
    id: "ministry",
    label: "Ministry",
    pluralLabel: "Ministries",
    description: "Ministry Wing",
    color: "indigo",
    isBuiltIn: true
  },
  {
    id: "fellowship",
    label: "Fellowship",
    pluralLabel: "Fellowships",
    description: "Demographic Wing",
    color: "sky",
    isBuiltIn: true
  }
];
var VALID_COLORS = /* @__PURE__ */ new Set([
  "indigo",
  "emerald",
  "sky",
  "violet",
  "amber",
  "rose",
  "teal"
]);
var BUILT_IN_IDS = new Set(BUILT_IN_GROUP_CATEGORIES.map((c) => c.id));
var CATEGORY_SLUG_REGEX = /^[a-z0-9][a-z0-9_-]{0,63}$/;
function normalizeGroupCategorySlug(input) {
  return String(input || "").trim().toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9_-]+/g, "_").replace(/^[_-]+|[_-]+$/g, "").replace(/_{2,}/g, "_").slice(0, 64);
}
function isValidGroupCategorySlug(value) {
  const clean = String(value || "").trim().toLowerCase();
  return CATEGORY_SLUG_REGEX.test(clean);
}
function normalizeIncomingGroupCategory(input) {
  const raw = String(input || "").trim().toLowerCase();
  if (!raw) return null;
  if (BUILT_IN_IDS.has(raw)) return raw;
  if (isValidGroupCategorySlug(raw)) return raw;
  const normalized = normalizeGroupCategorySlug(raw);
  return isValidGroupCategorySlug(normalized) ? normalized : null;
}
function humanizeGroupCategorySlug(slug) {
  const clean = String(slug || "").trim();
  if (!clean) return "Group";
  return clean.split(/[_-]+/).filter(Boolean).map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}
function pluralizeCategoryLabel(label) {
  const clean = String(label || "").trim();
  if (!clean) return "Groups";
  const lower = clean.toLowerCase();
  if (lower.endsWith("s") || lower.endsWith("group") || lower.endsWith("band") || lower.endsWith("wing")) {
    return lower.endsWith("s") ? clean : `${clean}s`;
  }
  if (lower.endsWith("born")) {
    return `${clean} Groups`;
  }
  if (lower.endsWith("y") && !/[aeiou]y$/i.test(lower)) {
    return `${clean.slice(0, -1)}ies`;
  }
  return `${clean}s`;
}
function sanitizeCustomGroupCategories(input) {
  if (!Array.isArray(input)) return [];
  const seenIds = /* @__PURE__ */ new Set();
  const result = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const obj = raw;
    const rawLabel = String(obj.label || "").trim().replace(/\s+/g, " ").slice(0, 48);
    const rawId = normalizeGroupCategorySlug(String(obj.id || rawLabel));
    if (!rawId || !isValidGroupCategorySlug(rawId) || BUILT_IN_IDS.has(rawId) || seenIds.has(rawId)) {
      continue;
    }
    const label = rawLabel || humanizeGroupCategorySlug(rawId);
    const rawPlural = String(obj.pluralLabel || "").trim().replace(/\s+/g, " ").slice(0, 56);
    const pluralLabel = rawPlural || pluralizeCategoryLabel(label);
    const description = String(obj.description || "").trim().replace(/\s+/g, " ").slice(0, 100);
    const rawColor = String(obj.color || "").trim().toLowerCase();
    const color = VALID_COLORS.has(rawColor) ? rawColor : "violet";
    const createdAt = typeof obj.createdAt === "string" && obj.createdAt.trim() ? obj.createdAt.trim().slice(0, 40) : void 0;
    seenIds.add(rawId);
    result.push({
      id: rawId,
      label,
      pluralLabel,
      description: description || "Custom Category",
      color,
      isBuiltIn: false,
      ...createdAt ? { createdAt } : {}
    });
    if (result.length >= 50) break;
  }
  return result;
}

// src/utils/settingsConnections.ts
function normalizeSettingLabel(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}
function getMemberFullName(member) {
  return normalizeSettingLabel(`${member.firstName || ""} ${member.lastName || ""}`);
}
function findMatchingChurchGroup(churchGroups, criteria) {
  const ordered = [
    ...churchGroups.filter((g) => g.active !== false),
    ...churchGroups.filter((g) => g.active === false)
  ];
  const findByName = (raw, preferredCategories) => {
    const target = normalizeSettingLabel(raw).toLowerCase();
    if (!target || target === "general" || target === "general congregation" || target === "first-time visitor") {
      return null;
    }
    const exactPreferred = ordered.find(
      (g) => (!preferredCategories || preferredCategories.includes(g.category)) && normalizeSettingLabel(g.name).toLowerCase() === target
    );
    if (exactPreferred) return exactPreferred;
    const exactAny = ordered.find(
      (g) => normalizeSettingLabel(g.name).toLowerCase() === target
    );
    if (exactAny) return exactAny;
    const targetAutoKind = getAutomaticMinistryKind(raw);
    if (targetAutoKind) {
      const autoPreferred = ordered.find(
        (g) => (!preferredCategories || preferredCategories.includes(g.category)) && getAutomaticMinistryKind(g.name) === targetAutoKind
      );
      if (autoPreferred) return autoPreferred;
      const autoAny = ordered.find(
        (g) => getAutomaticMinistryKind(g.name) === targetAutoKind
      );
      if (autoAny) return autoAny;
    }
    return ordered.find((g) => {
      if (preferredCategories && !preferredCategories.includes(g.category)) return false;
      const gName = normalizeSettingLabel(g.name).toLowerCase();
      return gName.includes(target) || target.includes(gName);
    }) || null;
  };
  const cellOrFellowshipGroup = findByName(criteria.homeCellGroup, ["cell_group", "fellowship"]) || findByName(criteria.groupName, ["cell_group", "fellowship"]) || findByName(criteria.homeCellGroup || criteria.groupName);
  const explicitDeptList = parseMemberDepartments(criteria.department);
  const autoDeptNames = criteria.gender || criteria.dateOfBirth ? resolveAutomaticDemographicMinistries({
    gender: criteria.gender,
    dateOfBirth: criteria.dateOfBirth
  }).names : [];
  const deptList = [...explicitDeptList, ...autoDeptNames];
  const matchedMinistryMap = /* @__PURE__ */ new Map();
  for (const deptName of deptList) {
    const found = findByName(deptName, ["ministry", "department"]) || findByName(deptName);
    if (found && !matchedMinistryMap.has(found.id)) {
      matchedMinistryMap.set(found.id, found);
    }
  }
  if (matchedMinistryMap.size === 0 && criteria.groupName) {
    const fallbackGroup = findByName(criteria.groupName, ["ministry", "department"]);
    if (fallbackGroup) {
      matchedMinistryMap.set(fallbackGroup.id, fallbackGroup);
    }
  }
  const ministryGroups = Array.from(matchedMinistryMap.values());
  const ministryGroup = ministryGroups[0] || null;
  return { cellOrFellowshipGroup, ministryGroup, ministryGroups };
}
function getMemberGroupMatchScore(candidate, targetMember) {
  if (!targetMember) return 0;
  const targetCell = normalizeSettingLabel(targetMember.homeCellGroup || targetMember.groupName).toLowerCase();
  const candCell = normalizeSettingLabel(candidate.homeCellGroup || candidate.groupName).toLowerCase();
  let score = 0;
  if (targetCell && !isGeneralCongregationLabel(targetCell) && candCell && candCell === targetCell) {
    score += 40;
  }
  const targetDepts = new Set(resolveMemberDepartments(targetMember).map((d) => d.toLowerCase()));
  if (targetDepts.size > 0) {
    const candDepts = resolveMemberDepartments(candidate).map((d) => d.toLowerCase());
    if (candDepts.some((d) => targetDepts.has(d))) {
      score += 30;
    }
  }
  return score;
}
function pickBestOfficerOrLeader(candidates, targetMember, reason, loadByName) {
  if (candidates.length === 0) return void 0;
  const targetId = targetMember?.id;
  const eligible = candidates.filter((c) => c.id !== targetId);
  if (eligible.length === 0) return void 0;
  const sorted = [...eligible].sort((a, b) => {
    const aName = getMemberFullName(a).toLowerCase();
    const bName = getMemberFullName(b).toLowerCase();
    const aLoad = loadByName.get(aName) ?? 0;
    const bLoad = loadByName.get(bName) ?? 0;
    const aGroupAffinity = getMemberGroupMatchScore(a, targetMember);
    const bGroupAffinity = getMemberGroupMatchScore(b, targetMember);
    const aSeniorBoost = reason === "absent_3" && isSeniorPastoralPortfolio(getMemberPortfolio(a)) ? 35 : 0;
    const bSeniorBoost = reason === "absent_3" && isSeniorPastoralPortfolio(getMemberPortfolio(b)) ? 35 : 0;
    const aScore = aGroupAffinity + aSeniorBoost - aLoad * 25 + getPortfolioPriorityScore(getMemberPortfolio(a)) * 0.15;
    const bScore = bGroupAffinity + bSeniorBoost - bLoad * 25 + getPortfolioPriorityScore(getMemberPortfolio(b)) * 0.15;
    if (bScore !== aScore) return bScore - aScore;
    return aName.localeCompare(bName);
  });
  return sorted[0];
}
function resolveFollowupAssignee(member, churchGroups, systemSettings, reason, fallbackActorName, allMembers = [], existingOpenTasks = [], loadOverride) {
  const memberDepts = member ? resolveMemberDepartments(member) : [];
  const memberGroupLabel = normalizeSettingLabel(member?.homeCellGroup) || normalizeSettingLabel(member?.groupName) || memberDepts[0] || normalizeSettingLabel(member?.department) || "General";
  const { cellOrFellowshipGroup, ministryGroups } = findMatchingChurchGroup(churchGroups, {
    groupName: member?.groupName,
    homeCellGroup: member?.homeCellGroup,
    department: memberDepts.length > 0 ? memberDepts : member?.department
  });
  const selfFullNameLower = member ? getMemberFullName(member).toLowerCase() : "";
  const leadMinistryGroup = ministryGroups.find(
    (g) => normalizeSettingLabel(g.leaderName) && (!member || normalizeSettingLabel(g.leaderName).toLowerCase() !== selfFullNameLower)
  ) || ministryGroups[0] || null;
  const resolvedGroupName = cellOrFellowshipGroup?.name || leadMinistryGroup?.name || memberGroupLabel;
  const loadByName = loadOverride || /* @__PURE__ */ new Map();
  if (!loadOverride && existingOpenTasks.length > 0) {
    for (const t of existingOpenTasks) {
      if (t.status === "open" || t.status === "contacted") {
        const key = normalizeSettingLabel(t.assignedToName).toLowerCase();
        if (key) loadByName.set(key, (loadByName.get(key) || 0) + 1);
      }
    }
  }
  const seniorPastorFallback = normalizeSettingLabel(systemSettings.seniorPastor) || normalizeSettingLabel(fallbackActorName) || "Pastoral Care Team";
  const findMemberByLeader = (leaderMemberId, leaderName) => {
    if (leaderMemberId) {
      const byId = allMembers.find((m) => m.id === leaderMemberId);
      if (byId && byId.id !== member?.id) return byId;
    }
    const clean = normalizeSettingLabel(leaderName).toLowerCase();
    if (!clean) return void 0;
    return allMembers.find((m) => m.id !== member?.id && getMemberFullName(m).toLowerCase() === clean);
  };
  const cellLeaderName = cellOrFellowshipGroup?.leaderName?.trim() || "";
  const ministryLeaderName = leadMinistryGroup?.leaderName?.trim() || "";
  const pastoralOfficers = allMembers.filter((m) => isPastoralOfficerOrLeader(m));
  const bestOfficer = pickBestOfficerOrLeader(pastoralOfficers, member, reason, loadByName);
  const matchedGroupLeaderName = cellLeaderName && (!member || cellLeaderName.toLowerCase() !== selfFullNameLower) ? cellLeaderName : ministryLeaderName && (!member || ministryLeaderName.toLowerCase() !== selfFullNameLower) ? ministryLeaderName : "";
  const matchedGroupRef = matchedGroupLeaderName === cellLeaderName ? cellOrFellowshipGroup : leadMinistryGroup;
  const matchedLeaderMember = matchedGroupLeaderName ? findMemberByLeader(matchedGroupRef?.leaderMemberId, matchedGroupLeaderName) : void 0;
  if (systemSettings.autoAssignCellLeaders) {
    if (reason === "absent_3") {
      const seniorName = normalizeSettingLabel(systemSettings.seniorPastor);
      if (seniorName && (!member || seniorName.toLowerCase() !== getMemberFullName(member).toLowerCase())) {
        const seniorMember = findMemberByLeader(void 0, seniorName);
        return {
          assignedToName: seniorName,
          groupName: resolvedGroupName,
          assignedToMemberId: seniorMember?.id,
          assignedToRole: seniorMember ? getMemberPortfolio(seniorMember) : "Senior Pastor",
          assignedToPhone: seniorMember?.phoneE164 || systemSettings.contactPhone || void 0
        };
      }
      if (bestOfficer) {
        return {
          assignedToName: getMemberFullName(bestOfficer),
          groupName: resolvedGroupName,
          assignedToMemberId: bestOfficer.id,
          assignedToRole: getMemberPortfolio(bestOfficer),
          assignedToPhone: bestOfficer.phoneE164 || void 0
        };
      }
    }
    if (matchedGroupLeaderName) {
      return {
        assignedToName: matchedGroupLeaderName,
        groupName: resolvedGroupName,
        assignedToMemberId: matchedLeaderMember?.id || matchedGroupRef?.leaderMemberId || void 0,
        assignedToRole: matchedLeaderMember ? getMemberPortfolio(matchedLeaderMember) : cellLeaderName === matchedGroupLeaderName ? "Cell Leader" : "Ministry Leader",
        assignedToPhone: matchedLeaderMember?.phoneE164 || matchedGroupRef?.leaderPhone || void 0
      };
    }
    if (bestOfficer) {
      return {
        assignedToName: getMemberFullName(bestOfficer),
        groupName: resolvedGroupName,
        assignedToMemberId: bestOfficer.id,
        assignedToRole: getMemberPortfolio(bestOfficer),
        assignedToPhone: bestOfficer.phoneE164 || void 0
      };
    }
  } else if (bestOfficer && reason !== "absent_3") {
    const seniorMember = findMemberByLeader(void 0, seniorPastorFallback);
    return {
      assignedToName: seniorPastorFallback,
      groupName: resolvedGroupName,
      assignedToMemberId: seniorMember?.id,
      assignedToRole: seniorMember ? getMemberPortfolio(seniorMember) : "Senior Pastor",
      assignedToPhone: seniorMember?.phoneE164 || systemSettings.contactPhone || void 0
    };
  }
  return {
    assignedToName: seniorPastorFallback,
    groupName: resolvedGroupName
  };
}
function buildAutoAssignAbsenteesPlan(params) {
  const {
    members,
    churchGroups,
    existingTasks,
    systemSettings,
    fallbackActorName,
    unarrivedMemberIdsForLatestService
  } = params;
  const threshold = Math.max(1, Number(systemSettings.absenteeThresholdServices) || 2);
  const activeTaskPersonIds = new Set(
    existingTasks.filter((t) => t.status === "open" || t.status === "contacted").map((t) => String(t.personId))
  );
  const loadByName = /* @__PURE__ */ new Map();
  for (const t of existingTasks) {
    if (t.status === "open" || t.status === "contacted") {
      const key = normalizeSettingLabel(t.assignedToName).toLowerCase();
      if (key) loadByName.set(key, (loadByName.get(key) || 0) + 1);
    }
  }
  const plan = [];
  for (const member of members) {
    if (member.status === "inactive" || member.status === "transferred" || member.status === "deceased") {
      continue;
    }
    if (activeTaskPersonIds.has(String(member.id))) {
      continue;
    }
    const consecutive = Number(member.consecutiveAbsences || 0);
    const isAbsentByStreak = consecutive >= threshold;
    const isAbsentInService = Boolean(unarrivedMemberIdsForLatestService?.has(member.id));
    if (!isAbsentByStreak && !isAbsentInService) {
      continue;
    }
    const effectiveStreak = Math.max(consecutive, isAbsentInService ? threshold : 0);
    const reason = effectiveStreak >= threshold + 1 ? "absent_3" : "absent_2";
    const resolved = resolveFollowupAssignee(
      member,
      churchGroups,
      systemSettings,
      reason,
      fallbackActorName,
      members,
      existingTasks,
      loadByName
    );
    const assigneeKey = normalizeSettingLabel(resolved.assignedToName).toLowerCase();
    if (assigneeKey) {
      loadByName.set(assigneeKey, (loadByName.get(assigneeKey) || 0) + 1);
    }
    activeTaskPersonIds.add(String(member.id));
    const dueOn = formatFollowupDueDateLabel(
      reason,
      systemSettings.firstTimerFollowupHours,
      threshold
    );
    const roleHint = resolved.assignedToRole ? ` (${resolved.assignedToRole})` : "";
    plan.push({
      personId: member.id,
      personName: getMemberFullName(member) || "Member",
      personPhone: member.phoneE164 || member.phoneNumber || void 0,
      personEmail: member.email || void 0,
      groupName: resolved.groupName,
      reason,
      assignedToName: resolved.assignedToName,
      assignedToMemberId: resolved.assignedToMemberId,
      assignedToRole: resolved.assignedToRole,
      assignedToPhone: resolved.assignedToPhone,
      dueOn,
      notes: `Auto-assigned to ${resolved.assignedToName}${roleHint} after ${effectiveStreak} missed service${effectiveStreak === 1 ? "" : "s"}.`
    });
  }
  return plan;
}
function formatFollowupDueDateLabel(reason, firstTimerFollowupHours = 24, absenteeThresholdServices = 2) {
  const safeHours = Math.max(1, Math.round(firstTimerFollowupHours || 24));
  if (reason === "first_timer") {
    if (safeHours <= 24) return `Within ${safeHours}h`;
    const days = Math.round(safeHours / 24);
    return `Within ${days} day${days === 1 ? "" : "s"} (${safeHours}h)`;
  }
  if (reason === "absent_3") {
    return `Urgent (${absenteeThresholdServices + 1}w escalation)`;
  }
  if (reason === "absent_2") {
    return `Within 72h (${absenteeThresholdServices}w trigger)`;
  }
  return "In 3 days";
}

// src/shared/memberImportValidation.ts
function mapHeaderToMemberField(rawHeader) {
  const clean = rawHeader.trim().toUpperCase().replace(/[\s/._-]/g, "");
  if (clean === "FIRSTNAME" || clean === "FIRST") return "firstName";
  if (clean === "MIDDLENAME" || clean === "MIDDLE") return "middleName";
  if (clean === "LASTNAME" || clean === "LAST" || clean === "SURNAME") return "lastName";
  if (clean === "EMAIL" || clean === "EMAILADDRESS" || clean === "MAIL") return "email";
  if (clean === "SPECIFICLOCATION" || clean === "LOCATION" || clean === "LANDMARK") return "specificLocation";
  if (clean === "REMARKS" || clean === "REMARK" || clean === "NOTES") return "remarks";
  if (clean === "ID" || clean === "MEMBERID" || clean === "CARDNO" || clean === "MEMBERSHIPID") return "memberId";
  if (clean === "SQUADS" || clean === "SQUAD") return "squads";
  if (clean === "DEPARTMENT" || clean === "DEPT" || clean === "MINISTRY") return "department";
  if (clean === "MEMBERSOFFICERSNAME" || clean === "OFFICERNAME" || clean === "OFFICER" || clean === "DESIGNATION") {
    return "officerName";
  }
  if (clean === "GENDER" || clean === "SEX") return "gender";
  if (clean === "DATEOFBIRTH" || clean === "DOB" || clean === "BIRTHDATE") return "dateOfBirth";
  if (clean === "PHONENUMBER" || clean === "PHONE" || clean === "PHONEE164" || clean === "TELEPHONE" || clean === "MOBILE") {
    return "phoneE164";
  }
  if (clean === "PLACEOFRESIDENCE" || clean === "RESIDENCE" || clean === "TOWN") return "placeOfResidence";
  if (clean === "RESIDENTIALDIGITALADDRESS" || clean === "DIGITALADDRESS" || clean === "GHANAPOSTGPS" || clean === "GPSADDRESS") {
    return "residentialDigitalAddress";
  }
  if (clean === "HOMETOWN" || clean === "HOME") return "hometown";
  if (clean === "OCCUPATION" || clean === "JOB" || clean === "PROFESSION") return "occupation";
  if (clean === "HOMECELLGROUP" || clean === "CELLGROUP" || clean === "CELL" || clean === "FELLOWSHIP" || clean === "GROUPNAME") {
    return "homeCellGroup";
  }
  if (clean === "MONTHOFBIRTH" || clean === "BIRTHMONTH") return "monthOfBirth";
  if (clean === "MARITALSTATUS" || clean === "MARITAL") return "maritalStatus";
  if (clean === "NAMEOFSPOUSE" || clean === "SPOUSENAME" || clean === "SPOUSE") return "spouseName";
  if (clean === "NUMBEROFCHILDREN" || clean === "CHILDREN" || clean === "NUMCHILDREN") return "numberOfChildren";
  if (clean === "NAMEOFPERSONTOCONTACTINCASEOFEMERGENCY" || clean === "EMERGENCYCONTACTPERSON" || clean === "EMERGENCYCONTACT") {
    return "emergencyContactPerson";
  }
  if (clean === "EMERGENCY" || clean === "EMERGENCYPHONE" || clean === "EMERGENCYNUMBER") {
    return "emergencyContactPhone";
  }
  if (clean === "IMAGE" || clean === "IMAGEURL" || clean === "PHOTO" || clean === "PICTURE") return "imageUrl";
  if (clean === "DATEOFBAPTISM" || clean === "BAPTISMDATE" || clean === "BAPTISM") return "dateOfBaptism";
  if (clean === "DATEOFMARRIAGE" || clean === "MARRIAGEDATE" || clean === "MARRIAGE") return "dateOfMarriage";
  if (clean === "DATEOFSALVATION" || clean === "SALVATIONDATE" || clean === "SALVATION") return "dateOfSalvation";
  if (clean === "DATEOFMEMBERSHIP" || clean === "MEMBERSHIPDATE" || clean === "JOINEDDATE") return "dateOfMembership";
  return null;
}
function validateAndFormatPhone(raw) {
  let clean = raw.trim().replace(/[\s\-().]/g, "");
  if (!clean) return { valid: false, formatted: "" };
  if (clean.startsWith("00")) {
    clean = `+${clean.slice(2)}`;
  } else if (clean.startsWith("0") && clean.length === 10) {
    clean = `+233${clean.slice(1)}`;
  } else if (!clean.startsWith("+") && clean.length === 9) {
    clean = `+233${clean}`;
  } else if (!clean.startsWith("+") && clean.length >= 10 && clean.length <= 15) {
    clean = `+${clean}`;
  }
  const isValid = /^\+[1-9]\d{7,14}$/.test(clean);
  return { valid: isValid, formatted: clean };
}
function isExactCalendarDate(year, month, day) {
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}
function validateStrictIsoDate(raw) {
  if (!raw || !raw.trim()) return null;
  const trimmed = raw.trim();
  const isoMatch = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    if (!isExactCalendarDate(year, month, day)) return null;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  const dmyMatch = trimmed.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (dmyMatch) {
    const day = Number(dmyMatch[1]);
    const month = Number(dmyMatch[2]);
    const year = Number(dmyMatch[3]);
    if (!isExactCalendarDate(year, month, day)) return null;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  return null;
}
function normalizeOfficerName(raw) {
  if (!raw || !raw.trim()) return "Member";
  const off = raw.trim().toLowerCase();
  if (off === "member" || off === "regular member") return "Member";
  if (off === "deacon") return "Deacon";
  if (off === "deaconess") return "Deaconess";
  if (off === "elder") return "Elder";
  if (off === "pastor") return "Pastor";
  if (off.includes("senior pastor")) return "Senior Pastor";
  if (off.includes("associate pastor")) return "Associate Pastor";
  if (off.includes("youth pastor")) return "Youth Pastor";
  if (off.includes("cell leader")) return "Cell Leader";
  if (off.includes("usher")) return "Usher Captain";
  return raw.trim().replace(/\b\w/g, (l) => l.toUpperCase());
}
function normalizeGender(raw) {
  if (!raw || !raw.trim()) return { valid: true, value: void 0 };
  const g = raw.trim().toLowerCase();
  if (g === "m" || g === "male" || g === "man") return { valid: true, value: "male" };
  if (g === "f" || g === "female" || g === "woman") return { valid: true, value: "female" };
  if (g === "o" || g === "other") return { valid: true, value: "other" };
  return { valid: false };
}
function normalizeMaritalStatus(raw) {
  if (!raw || !raw.trim()) return { valid: true, value: void 0 };
  const m = raw.trim().toLowerCase();
  if (m === "single" || m === "unmarried") return { valid: true, value: "Single" };
  if (m === "married") return { valid: true, value: "Married" };
  if (m === "widowed" || m === "widow" || m === "widower") return { valid: true, value: "Widowed" };
  if (m === "divorced" || m === "separated") return { valid: true, value: "Divorced" };
  return { valid: false };
}
function validateMemberImportBatch(rawRows, existingMembers, duplicateMode = "skip") {
  const existingByPhone = /* @__PURE__ */ new Map();
  const existingByMemberId = /* @__PURE__ */ new Map();
  const existingByEmail = /* @__PURE__ */ new Map();
  for (const m of existingMembers) {
    if (m.phoneE164) {
      const { valid, formatted } = validateAndFormatPhone(m.phoneE164);
      if (valid) existingByPhone.set(formatted, m.id);
    }
    if (m.memberId) {
      existingByMemberId.set(m.memberId.trim().toUpperCase(), m.id);
    }
    if (m.email) {
      existingByEmail.set(m.email.trim().toLowerCase(), m.id);
    }
  }
  const seenPhonesInFile = /* @__PURE__ */ new Set();
  const seenMemberIdsInFile = /* @__PURE__ */ new Set();
  const seenEmailsInFile = /* @__PURE__ */ new Set();
  const todayIso = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  const validatedRows = rawRows.map((inputRow, index) => {
    const raw = {};
    const data = {};
    const errors = [];
    const warnings = [];
    let rawChildrenValue;
    Object.entries(inputRow || {}).forEach(([rawKey, val]) => {
      if (val === void 0 || val === null) return;
      const stringVal = String(val).trim();
      raw[rawKey] = stringVal;
      const directKeys = [
        "firstName",
        "middleName",
        "lastName",
        "email",
        "specificLocation",
        "remarks",
        "memberId",
        "squads",
        "department",
        "officerName",
        "gender",
        "dateOfBirth",
        "phoneE164",
        "phoneNumber",
        "placeOfResidence",
        "residentialDigitalAddress",
        "hometown",
        "occupation",
        "homeCellGroup",
        "groupName",
        "monthOfBirth",
        "maritalStatus",
        "spouseName",
        "numberOfChildren",
        "emergencyContactPerson",
        "emergencyContactPhone",
        "imageUrl",
        "dateOfBaptism",
        "dateOfMarriage",
        "dateOfSalvation",
        "dateOfMembership"
      ];
      const field = directKeys.includes(rawKey) ? rawKey : mapHeaderToMemberField(rawKey);
      if (!field || stringVal === "") return;
      if (field === "numberOfChildren") {
        rawChildrenValue = stringVal;
      } else {
        data[field] = stringVal;
      }
    });
    if (!data.firstName || data.firstName.trim().length < 2) {
      errors.push("FIRST NAME is required (minimum 2 characters).");
    } else {
      data.firstName = data.firstName.trim();
    }
    if (!data.lastName || data.lastName.trim().length < 2) {
      errors.push("LASTNAME is required (minimum 2 characters).");
    } else {
      data.lastName = data.lastName.trim();
    }
    const rawPhone = data.phoneE164 || data.phoneNumber || raw["PHONE NUMBER"] || raw["Phone"] || raw["phone"] || "";
    if (!rawPhone) {
      errors.push("PHONE NUMBER is required.");
    } else {
      const { valid, formatted } = validateAndFormatPhone(rawPhone);
      if (!valid) {
        errors.push(`Invalid phone "${rawPhone}". Use E.164 or local 10-digit format (e.g. +233241234567 or 0241234567).`);
      } else {
        data.phoneE164 = formatted;
        data.phoneNumber = formatted;
      }
    }
    if (data.email) {
      const cleanEmail = data.email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        errors.push(`Invalid email address "${data.email}".`);
      } else {
        data.email = cleanEmail;
      }
    }
    if (rawChildrenValue !== void 0) {
      if (!/^\d+$/.test(rawChildrenValue)) {
        errors.push(`NUMBER OF CHILDREN "${rawChildrenValue}" must be a non-negative whole number.`);
      } else {
        data.numberOfChildren = Number(rawChildrenValue);
      }
    } else {
      data.numberOfChildren = 0;
    }
    if (data.gender) {
      const normalizedGender = normalizeGender(String(data.gender));
      if (!normalizedGender.valid) {
        errors.push(`Invalid GENDER "${data.gender}". Expected Male, Female, or Other.`);
      } else {
        data.gender = normalizedGender.value;
      }
    } else {
      data.gender = "other";
    }
    if (data.maritalStatus) {
      const normalizedMarital = normalizeMaritalStatus(String(data.maritalStatus));
      if (!normalizedMarital.valid) {
        warnings.push(`Unrecognized MARITAL STATUS "${data.maritalStatus}"; defaulted to Single.`);
        data.maritalStatus = "Single";
      } else {
        data.maritalStatus = normalizedMarital.value;
      }
    } else {
      data.maritalStatus = "Single";
    }
    if (data.emergencyContactPhone) {
      const cleaned = data.emergencyContactPhone.trim();
      if (/\d/.test(cleaned)) {
        const emPhone = validateAndFormatPhone(cleaned);
        if (!emPhone.valid) {
          warnings.push(`Emergency phone "${cleaned}" does not match standard phone format.`);
        } else {
          data.emergencyContactPhone = emPhone.formatted;
        }
      }
    }
    if (data.dateOfBirth) {
      const parsed = validateStrictIsoDate(data.dateOfBirth);
      if (!parsed) {
        errors.push(`Invalid DATE OF BIRTH "${data.dateOfBirth}". Expected valid YYYY-MM-DD or DD/MM/YYYY.`);
      } else if (parsed > todayIso) {
        errors.push(`DATE OF BIRTH "${parsed}" cannot be in the future.`);
      } else {
        data.dateOfBirth = parsed;
        const derivedMonth = deriveMonthOfBirth(parsed);
        if (derivedMonth) {
          if (data.monthOfBirth) {
            const rawNormalized = normalizeMonthName(data.monthOfBirth);
            if (rawNormalized && rawNormalized !== derivedMonth) {
              warnings.push(
                `MONTH OF BIRTH "${data.monthOfBirth}" conflicted with DATE OF BIRTH; synced to ${derivedMonth}.`
              );
            }
          }
          data.monthOfBirth = derivedMonth;
        }
      }
    } else if (data.monthOfBirth) {
      const normalizedMonth = normalizeMonthName(data.monthOfBirth);
      if (normalizedMonth) {
        data.monthOfBirth = normalizedMonth;
      }
    }
    if (data.monthOfBirth) {
      const birthGroup = formatBirthMonthGroupName(data.monthOfBirth);
      if (birthGroup) {
        data.birthMonthGroup = birthGroup;
      }
    }
    if (data.dateOfBaptism) {
      const parsed = validateStrictIsoDate(data.dateOfBaptism);
      if (!parsed) {
        errors.push(`Invalid date of baptism "${data.dateOfBaptism}". Expected YYYY-MM-DD or DD/MM/YYYY.`);
      } else {
        data.dateOfBaptism = parsed;
      }
    }
    if (data.dateOfMarriage) {
      const parsed = validateStrictIsoDate(data.dateOfMarriage);
      if (!parsed) {
        warnings.push(`Date of marriage "${data.dateOfMarriage}" could not be parsed as YYYY-MM-DD or DD/MM/YYYY.`);
        delete data.dateOfMarriage;
      } else {
        data.dateOfMarriage = parsed;
      }
    }
    if (data.dateOfSalvation) {
      const parsed = validateStrictIsoDate(data.dateOfSalvation);
      if (!parsed) {
        warnings.push(`Date of salvation "${data.dateOfSalvation}" could not be parsed as YYYY-MM-DD or DD/MM/YYYY.`);
        delete data.dateOfSalvation;
      } else {
        data.dateOfSalvation = parsed;
      }
    }
    if (data.dateOfMembership) {
      const parsed = validateStrictIsoDate(data.dateOfMembership);
      if (!parsed) {
        warnings.push(`Date of membership "${data.dateOfMembership}" could not be parsed; defaulted to today.`);
        data.dateOfMembership = todayIso;
      } else {
        data.dateOfMembership = parsed;
      }
    } else {
      data.dateOfMembership = todayIso;
    }
    data.officerName = normalizeOfficerName(data.officerName);
    const resolvedGroup = data.homeCellGroup || data.groupName || "General Congregation";
    data.groupName = resolvedGroup;
    data.homeCellGroup = resolvedGroup;
    const normalizedDepts = normalizeMemberDepartmentFields({
      department: data.department,
      departments: data.departments
    });
    data.department = normalizedDepts.department;
    data.departments = normalizedDepts.departments;
    data.status = "member";
    data.autoCheckinOptedIn = true;
    data.consecutiveAbsences = 0;
    const upperMemberId = data.memberId ? data.memberId.trim().toUpperCase() : void 0;
    if (upperMemberId) {
      data.memberId = data.memberId.trim();
    }
    const matchedByPhone = data.phoneE164 ? existingByPhone.get(data.phoneE164) : void 0;
    const matchedById = upperMemberId ? existingByMemberId.get(upperMemberId) : void 0;
    const matchedByEmail = data.email ? existingByEmail.get(data.email) : void 0;
    const matchedMemberId = matchedByPhone || matchedById || matchedByEmail;
    const intraPhoneDup = Boolean(data.phoneE164 && seenPhonesInFile.has(data.phoneE164));
    const intraIdDup = Boolean(upperMemberId && seenMemberIdsInFile.has(upperMemberId));
    const intraEmailDup = Boolean(data.email && seenEmailsInFile.has(data.email));
    const isIntraFileDuplicate = intraPhoneDup || intraIdDup || intraEmailDup;
    if (data.phoneE164) seenPhonesInFile.add(data.phoneE164);
    if (upperMemberId) seenMemberIdsInFile.add(upperMemberId);
    if (data.email) seenEmailsInFile.add(data.email);
    const isExistingDuplicate = Boolean(matchedMemberId);
    const isDuplicate = isExistingDuplicate || isIntraFileDuplicate;
    if (isIntraFileDuplicate) {
      errors.push(
        intraPhoneDup ? `Duplicate phone ${data.phoneE164} appears in an earlier row of this file.` : intraIdDup ? `Duplicate Member ID ${upperMemberId} appears in an earlier row of this file.` : `Duplicate email ${data.email} appears in an earlier row of this file.`
      );
    } else if (isExistingDuplicate) {
      const matchReason = matchedByPhone ? `Phone ${data.phoneE164}` : matchedById ? `Member ID ${upperMemberId}` : `Email ${data.email}`;
      if (duplicateMode === "error") {
        errors.push(`${matchReason} already exists in the church directory.`);
      } else if (duplicateMode === "update") {
        warnings.push(`${matchReason} matches an existing member. Existing record will be updated.`);
      } else {
        warnings.push(`${matchReason} already exists in the church directory. Row will be skipped.`);
      }
    }
    const isValid = errors.length === 0;
    let action = "insert";
    if (!isValid) {
      action = "error";
    } else if (isExistingDuplicate) {
      action = duplicateMode === "update" ? "update" : "skip";
    }
    return {
      rowIndex: index + 1,
      data,
      raw,
      isValid,
      errors,
      warnings,
      isDuplicate,
      isIntraFileDuplicate,
      matchedMemberId,
      action
    };
  });
  const summary = {
    total: validatedRows.length,
    valid: validatedRows.filter((r) => r.isValid).length,
    invalid: validatedRows.filter((r) => !r.isValid).length,
    duplicates: validatedRows.filter((r) => r.isDuplicate).length,
    intraFileDuplicates: validatedRows.filter((r) => r.isIntraFileDuplicate).length,
    newInserts: validatedRows.filter((r) => r.action === "insert").length,
    updates: validatedRows.filter((r) => r.action === "update").length,
    skipped: validatedRows.filter((r) => r.action === "skip").length
  };
  return { rows: validatedRows, summary };
}

// src/server/platformStore.ts
var UUID_REGEX2 = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
var GRACE_PERIOD_DAYS = 7;
var TRIAL_DURATION_DAYS = 14;
var DAY_MS = 24 * 60 * 60 * 1e3;
function toDeterministicUuid(rawId) {
  if (UUID_REGEX2.test(rawId)) return rawId.toLowerCase();
  const hex = (0, import_crypto4.createHash)("sha256").update(`ekklesphere:${rawId}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
function normalizePhone(rawPhone) {
  if (!rawPhone) return "";
  const digits = rawPhone.replace(/\D/g, "");
  if (digits.startsWith("0") && digits.length === 10) {
    return `+233${digits.slice(1)}`;
  }
  if (digits.startsWith("233") && digits.length === 12) {
    return `+${digits}`;
  }
  return digits ? `+${digits}` : "";
}
function hashPassword(password, existingSalt) {
  const salt = existingSalt || (0, import_crypto4.randomBytes)(16).toString("hex");
  const hash = (0, import_crypto4.scryptSync)(password, salt, 64).toString("hex");
  return { hash, salt };
}
function verifyPassword(password, hash, salt) {
  try {
    const calculated = (0, import_crypto4.scryptSync)(password, salt, 64).toString("hex");
    return (0, import_crypto4.timingSafeEqual)(Buffer.from(calculated, "hex"), Buffer.from(hash, "hex"));
  } catch {
    return false;
  }
}
var DEFAULT_MEMBER_ONBOARDING_PASSWORD = "Ekklesphere@2026";
var MAX_FAILED_LOGIN_ATTEMPTS = 5;
var LOGIN_LOCKOUT_MS = 15 * 60 * 1e3;
var DEFAULT_LANDING_CMS = {
  heroTitle: "Next-Gen Presence Radar & Sovereign Church Management",
  heroSubtitle: "Real-time automated geofence attendance, multi-role pastoral dashboards, usher door check-in station, and personal congregation mobile passes.",
  announcementBadge: "Ekklesphere Sovereign Geofence Radar Live",
  isAnnouncementActive: true,
  contactSalesEmail: "contact@ekklesphere.platform",
  demoEnabled: false,
  showcaseHeadline: "Transforming Sanctuary Operations with Sovereign Geofence Radar",
  featuredStats: {
    congregationsServed: "Live",
    checkinsRecorded: "Real-Time",
    proximityAccuracy: "100m Dwell",
    networkUptime: "99.98%"
  }
};
var DEFAULT_ABSENT_MEMBER_MESSAGE_TEMPLATE = "Hello {{firstName}}, we missed you at {{serviceName}} ({{churchName}}) today. You are dearly loved and prayed for. Need prayer or support? Reply or call {{contactPhone}}.";
var DEFAULT_ORG_SYSTEM_SETTINGS = {
  churchName: "",
  churchLogoUrl: "",
  campusName: "",
  campusAddress: "",
  campusLatitude: null,
  campusLongitude: null,
  campusLocationAccuracyM: null,
  campusLocationUpdatedAt: null,
  seniorPastor: "",
  contactEmail: "",
  contactPhone: "",
  timezone: "Africa/Accra (GMT)",
  currency: "GHS (Ghana Cedi)",
  outerGeofenceMeters: 300,
  innerGeofenceMeters: 100,
  dwellTimeMinutes: 5,
  serviceWindowBeforeMinutes: 45,
  serviceWindowAfterMinutes: 30,
  bleBeaconRssiThreshold: -70,
  driveByProtection: true,
  absenteeThresholdServices: 2,
  firstTimerFollowupHours: 24,
  autoAssignCellLeaders: true,
  autoMessageAbsentMembers: true,
  absentMemberMessageChannel: "sms_and_email",
  absentMemberMessageTemplate: DEFAULT_ABSENT_MEMBER_MESSAGE_TEMPLATE,
  autoSendLeaderCareReminders: true,
  requireExplicitConsent: true,
  auditLogRetentionDays: 90,
  sessionTimeoutMinutes: DEFAULT_IDLE_SESSION_TIMEOUT_MINUTES,
  smsGatewayProvider: "Arkesel SMS",
  smsSenderId: "EKKLESPHERE",
  emailGatewayProvider: "Resend Email",
  emailFromAddress: "",
  emailSenderName: "",
  enablePushNotifications: true,
  customGroupCategories: []
};
var DEFAULT_PLANS = {
  grace_starter: {
    id: "grace_starter",
    name: "Grace Starter",
    description: "Essential proximity check-in and door usher headcount for growing local assemblies.",
    monthlyCostUSD: 19,
    annualCostUSD: 180,
    seatsLimit: 250,
    sitesLimit: 1,
    monthlyCheckinsLimit: 3e3,
    featureFlags: {
      bleRadar: false,
      smsGateway: false,
      biometrics: false,
      gdprPrivacyVault: true,
      multiCampus: false,
      mobileGivingMoMo: false,
      customDomain: false,
      exportAuditLogs: false
    },
    isActive: true,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  },
  ministry_pro: {
    id: "ministry_pro",
    name: "Ministry Pro",
    description: "Full pastoral care workflows, SMS/Push alerts, BLE beacons, and Mobile Money giving.",
    monthlyCostUSD: 49,
    annualCostUSD: 480,
    seatsLimit: 800,
    sitesLimit: 3,
    monthlyCheckinsLimit: 15e3,
    featureFlags: {
      bleRadar: true,
      smsGateway: true,
      biometrics: false,
      gdprPrivacyVault: true,
      multiCampus: true,
      mobileGivingMoMo: true,
      customDomain: false,
      exportAuditLogs: true
    },
    isActive: true,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  },
  cathedral_enterprise: {
    id: "cathedral_enterprise",
    name: "Cathedral Enterprise",
    description: "Multi-campus sovereign operations, custom domains, high-capacity assemblies, and full audit SLA.",
    monthlyCostUSD: 119,
    annualCostUSD: 1200,
    seatsLimit: 2500,
    sitesLimit: 15,
    monthlyCheckinsLimit: 1e5,
    featureFlags: {
      bleRadar: true,
      smsGateway: true,
      biometrics: true,
      gdprPrivacyVault: true,
      multiCampus: true,
      mobileGivingMoMo: true,
      customDomain: true,
      exportAuditLogs: true
    },
    isActive: true,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  }
};
function enabledFeatureLabelsFromFlags(flags) {
  const labels = ["Geofence Radar v2", "Door Usher Headcount", "Digital Member QR"];
  if (flags.bleRadar) labels.push("BLE Entrance Radar");
  if (flags.smsGateway) labels.push("SMS & Push Pastoral Care");
  if (flags.mobileGivingMoMo) labels.push("Mobile Giving MoMo");
  if (flags.multiCampus) labels.push("Multi-Campus Sync");
  if (flags.customDomain) labels.push("Custom Domain");
  if (flags.exportAuditLogs) labels.push("Audit Trail & Consent Vault");
  return labels;
}
function generateLicenseKey(orgName, prefixType = "LIC") {
  const prefix = orgName.replace(/[^A-Za-z0-9]/g, "").slice(0, 6).toUpperCase() || "EKKLE";
  const rand = (0, import_crypto4.randomUUID)().replace(/-/g, "").slice(0, 8).toUpperCase();
  return `${prefixType}-${prefix}-${rand}`;
}
function mapSupabaseRoleToChurchRole(rawRole) {
  if (!rawRole) return "member";
  const r = rawRole.toLowerCase();
  if (r === "owner" || r === "admin") return "admin";
  if (r === "pastor") return "pastor";
  if (r === "usher") return "usher";
  if (r === "finance") return "finance";
  if (r === "group_leader") return "group_leader";
  return "member";
}
function mapCredentialRoleToChurchRole(rawRole, isCreator) {
  const r = (rawRole || "").toLowerCase();
  if (isCreator) {
    if (r === "super_admin") return "super_admin";
    return "creator";
  }
  return mapSupabaseRoleToChurchRole(rawRole);
}
var PlatformStore = class {
  constructor() {
    this.customSupabaseAuthVerifier = null;
    this.customSupabaseClientOverride = null;
    // Relational backing tables for Vitest & local unconfigured preview sandbox ONLY
    this.orgs = /* @__PURE__ */ new Map();
    this.plans = /* @__PURE__ */ new Map();
    this.licenses = /* @__PURE__ */ new Map();
    this.payments = [];
    this.usageDaily = /* @__PURE__ */ new Map();
    this.auditLogs = [];
    this.alerts = /* @__PURE__ */ new Map();
    this.announcements = /* @__PURE__ */ new Map();
    this.featureFlags = /* @__PURE__ */ new Map();
    this.dataRequests = /* @__PURE__ */ new Map();
    this.supportGrants = /* @__PURE__ */ new Map();
    this.landingConfig = { ...DEFAULT_LANDING_CMS };
    this.landingLeads = /* @__PURE__ */ new Map();
    // Org-scoped operational collections
    this.sitesByOrg = /* @__PURE__ */ new Map();
    this.premiseByOrg = /* @__PURE__ */ new Map();
    this.systemSettingsByOrg = /* @__PURE__ */ new Map();
    this.churchGroupsByOrg = /* @__PURE__ */ new Map();
    this.churchGroupLeadershipHistoryByOrg = /* @__PURE__ */ new Map();
    this.checkinsByOrg = /* @__PURE__ */ new Map();
    this.rawEventsByOrg = /* @__PURE__ */ new Map();
    this.membersByOrg = /* @__PURE__ */ new Map();
    this.eventsByOrg = /* @__PURE__ */ new Map();
    this.pushSubsByOrg = /* @__PURE__ */ new Map();
    this.donationsByOrg = /* @__PURE__ */ new Map();
    this.followupTasksByOrg = /* @__PURE__ */ new Map();
    this.dispatchesByOrg = /* @__PURE__ */ new Map();
    this.absenceRunsByOrg = /* @__PURE__ */ new Map();
    this.memberConsentsByOrg = /* @__PURE__ */ new Map();
    this.eventRsvpsByOrg = /* @__PURE__ */ new Map();
    this.legacyTenantsForDryRun = [];
    this.userCredentials = /* @__PURE__ */ new Map();
    this.tempPasswordByCredId = /* @__PURE__ */ new Map();
    this.gatewaySecretsByOrg = /* @__PURE__ */ new Map();
    this.createOrganization = this.createOrganisation.bind(this);
    this.getOrganizationById = this.getOrganisationById.bind(this);
    this.listOrganizations = this.listOrganisations.bind(this);
    this.isTestRuntime = Boolean(process.env.VITEST || process.env.NODE_ENV === "test");
    const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
    const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || "").trim();
    const anonKey = (process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
    this.supabaseUrl = url;
    this.supabaseAuthKey = anonKey || serviceRoleKey;
    this.supabase = url && serviceRoleKey && !this.isTestRuntime ? (0, import_supabase_js2.createClient)(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    }) : null;
    if (this.isTestRuntime) {
      this.seedBaselineState();
    }
  }
  get activeSupabase() {
    return this.customSupabaseClientOverride || this.supabase;
  }
  get canVerifyViaSupabaseAuth() {
    return Boolean(this.customSupabaseAuthVerifier || this.supabaseUrl && this.supabaseAuthKey);
  }
  getPublicSupabaseAuthConfig(env = process.env) {
    const supabaseUrl = (env.VITE_SUPABASE_URL || env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || this.supabaseUrl || "").trim();
    const supabaseAnonKey = (env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
    return {
      supabaseUrl,
      supabaseAnonKey,
      googleOAuthConfigured: Boolean(supabaseUrl && supabaseAnonKey)
    };
  }
  setSupabaseTestHooks(hooks) {
    if (!this.isTestRuntime) {
      throw new Error("setSupabaseTestHooks may only be invoked inside Vitest test runtime.");
    }
    if ("client" in hooks) {
      this.customSupabaseClientOverride = hooks.client ?? null;
    }
    if ("authVerifier" in hooks) {
      this.customSupabaseAuthVerifier = hooks.authVerifier ?? null;
    }
  }
  assertDatabaseAvailable() {
    if (!this.supabase && !this.isTestRuntime) {
      const err = new Error(
        "Supabase PostgreSQL database is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY; user credentials and data are never stored on the server."
      );
      err.code = "SUPABASE_NOT_CONFIGURED";
      err.status = 503;
      throw err;
    }
  }
  get storageBackend() {
    return this.supabase ? "supabase" : "sandbox_ephemeral";
  }
  resetForTests() {
    if (!this.isTestRuntime) {
      throw new Error("resetForTests may only be invoked inside Vitest test runtime.");
    }
    this.orgs.clear();
    this.plans.clear();
    this.licenses.clear();
    this.payments = [];
    this.usageDaily.clear();
    this.auditLogs = [];
    this.alerts.clear();
    this.announcements.clear();
    this.featureFlags.clear();
    this.dataRequests.clear();
    this.supportGrants.clear();
    this.sitesByOrg.clear();
    this.premiseByOrg.clear();
    this.systemSettingsByOrg.clear();
    this.churchGroupsByOrg.clear();
    this.churchGroupLeadershipHistoryByOrg.clear();
    this.checkinsByOrg.clear();
    this.rawEventsByOrg.clear();
    this.membersByOrg.clear();
    this.eventsByOrg.clear();
    this.pushSubsByOrg.clear();
    this.donationsByOrg.clear();
    this.followupTasksByOrg.clear();
    this.dispatchesByOrg.clear();
    this.absenceRunsByOrg.clear();
    this.memberConsentsByOrg.clear();
    this.eventRsvpsByOrg.clear();
    this.legacyTenantsForDryRun = [];
    this.userCredentials.clear();
    this.tempPasswordByCredId.clear();
    this.gatewaySecretsByOrg.clear();
    this.customSupabaseClientOverride = null;
    this.customSupabaseAuthVerifier = null;
    this.landingLeads.clear();
    resetSessionRegistryForTests();
    this.landingConfig = { ...DEFAULT_LANDING_CMS };
    this.seedBaselineState();
  }
  seedBaselineState() {
    if (!this.isTestRuntime) {
      return;
    }
    for (const plan of Object.values(DEFAULT_PLANS)) {
      this.plans.set(plan.id, { ...plan, featureFlags: { ...plan.featureFlags } });
    }
    const now = /* @__PURE__ */ new Date();
    const oneYearOut = new Date(now.getTime() + 365 * DAY_MS).toISOString().slice(0, 10);
    const graceOut = new Date(now.getTime() + (365 + GRACE_PERIOD_DAYS) * DAY_MS).toISOString().slice(0, 10);
    const envCreatorEmail = (process.env.CREATOR_EMAIL || "").trim().toLowerCase();
    const envCreatorPass = (process.env.CREATOR_PASSWORD || "").trim();
    const envCreatorUsername = (process.env.CREATOR_USERNAME || "").trim().toLowerCase() || void 0;
    const envCreatorPhone = normalizePhone(process.env.CREATOR_PHONE) || void 0;
    const envCreatorName = (process.env.CREATOR_NAME || "").trim() || "Platform Creator";
    const envCreatorOrgId = process.env.CREATOR_ORGANIZATION_ID && UUID_REGEX2.test(process.env.CREATOR_ORGANIZATION_ID.trim()) ? process.env.CREATOR_ORGANIZATION_ID.trim().toLowerCase() : "";
    if (envCreatorEmail && envCreatorPass) {
      const { hash: creatorHash, salt: creatorSalt } = hashPassword(envCreatorPass);
      const creatorId = toDeterministicUuid(`creator:${envCreatorEmail}`);
      const creatorRecord = {
        id: creatorId,
        organizationId: envCreatorOrgId,
        email: envCreatorEmail,
        username: envCreatorUsername,
        phoneE164: envCreatorPhone,
        name: envCreatorName,
        role: "creator",
        isCreator: true,
        passwordHash: creatorHash,
        passwordSalt: creatorSalt,
        status: "active",
        failedAttempts: 0,
        lockedUntil: null,
        createdAt: now.toISOString()
      };
      this.userCredentials.set(creatorId, creatorRecord);
    }
    const testOrgId = TEST_ANCHOR_ORGANIZATION_ID;
    const testSiteId = TEST_CAMPUS_SITE_ID;
    const primaryOrg = {
      id: testOrgId,
      name: "Test Anchor Sanctuary",
      slug: "test-sanctuary",
      orgType: "church",
      campusCode: "TEST-01",
      city: "Accra",
      country: "Ghana",
      seniorPastor: "Lead Pastor",
      contactName: "Church Administrator",
      contactEmail: "admin@ekklesphere.church",
      contactPhone: "+233240000000",
      status: "active",
      memberCount: 0,
      maxCapacity: 2500,
      sitesCount: 1,
      sitesLimit: 15,
      licenseKey: "EKKLE-TEST-SANCTUARY-2026",
      licenseTier: "cathedral_enterprise",
      licenseStatus: "active",
      renewalDate: oneYearOut,
      billingCycle: "annual",
      geofenceRadiusMeters: 300,
      geofenceConfigured: true,
      smsConfigured: true,
      pushConfigured: true,
      features: { ...DEFAULT_PLANS.cathedral_enterprise.featureFlags },
      createdAt: "2026-01-01T00:00:00.000Z"
    };
    this.orgs.set(testOrgId, primaryOrg);
    const primaryLicense = {
      id: "c0000000-0000-4000-8000-000000000001",
      key: "EKKLE-TEST-SANCTUARY-2026",
      tier: "cathedral_enterprise",
      tenantId: testOrgId,
      organizationId: testOrgId,
      tenantName: primaryOrg.name,
      seatsLimit: 2500,
      sitesLimit: 15,
      monthlyCheckinsLimit: 1e5,
      status: "active",
      issuedDate: now.toISOString().slice(0, 10),
      expiresDate: oneYearOut,
      graceEndsDate: graceOut,
      billingCycle: "annual",
      annualCostUSD: 1200,
      overrides: {},
      notes: "Test suite anchor sanctuary license",
      enabledFeatures: enabledFeatureLabelsFromFlags(DEFAULT_PLANS.cathedral_enterprise.featureFlags)
    };
    this.licenses.set(primaryLicense.id, primaryLicense);
    const defaultSite = {
      id: testSiteId,
      organization_id: testOrgId,
      name: "Test Campus Premise",
      address: "Central Sanctuary, Accra, Ghana",
      lat: 5.6037,
      lng: -0.187,
      radius_m: 60,
      outer_radius_m: 300,
      dwell_min: 5,
      active: true,
      updated_at: now.toISOString(),
      updated_by: "System Test Baseline"
    };
    this.sitesByOrg.set(testOrgId, [defaultSite]);
    this.premiseByOrg.set(testOrgId, {
      organizationId: testOrgId,
      churchName: "Test Anchor Sanctuary",
      campusName: "Test Campus Premise",
      campusAddress: "Central Sanctuary, Accra, Ghana",
      lat: 5.6037,
      lng: -0.187,
      accuracyM: 5,
      innerGeofenceMeters: 60,
      outerGeofenceMeters: 300,
      dwellTimeMinutes: 5,
      updatedAt: now.toISOString(),
      updatedBy: "System Test Baseline"
    });
    const defaultFlags = [
      {
        key: "ble_beacon_radar",
        name: "BLE Entrance Beacon Radar",
        description: "Sub-10m sanctuary entrance Bluetooth Low Energy verification.",
        enabledGlobally: false,
        enabledTiers: ["ministry_pro", "cathedral_enterprise"],
        organizationOverrides: {},
        updatedAt: now.toISOString()
      },
      {
        key: "sms_pastoral_alerts",
        name: "Automated Pastoral SMS Care",
        description: "Automated Hubtel/Arkesel SMS care tasks after consecutive absences.",
        enabledGlobally: false,
        enabledTiers: ["ministry_pro", "cathedral_enterprise"],
        organizationOverrides: {},
        updatedAt: now.toISOString()
      },
      {
        key: "momo_giving_ledger",
        name: "Mobile Money Giving Integration",
        description: "MTN MoMo & Telecel Cash congregation giving pass.",
        enabledGlobally: false,
        enabledTiers: ["ministry_pro", "cathedral_enterprise"],
        organizationOverrides: {},
        updatedAt: now.toISOString()
      },
      {
        key: "digital_member_qr",
        name: "Digital Member QR Pass",
        description: "Scannable member QR cards inside the mobile congregation portal.",
        enabledGlobally: true,
        enabledTiers: ["grace_starter", "ministry_pro", "cathedral_enterprise"],
        organizationOverrides: {},
        updatedAt: now.toISOString()
      }
    ];
    for (const f of defaultFlags) {
      this.featureFlags.set(f.key, f);
    }
    const testProfiles = [
      {
        id: "user-admin-1",
        email: "admin@ekklesphere.church",
        username: "admin",
        phone: "+233241112233",
        role: "admin",
        fullName: "Church Administrator"
      },
      {
        id: "user-pastor-1",
        email: "pastor@ekklesphere.church",
        username: "pastorkofi",
        phone: "+233242223344",
        role: "pastor",
        fullName: "Lead Pastor"
      },
      {
        id: "user-usher-1",
        email: "usher@ekklesphere.church",
        username: "usherkwame",
        phone: "+233243334455",
        role: "usher",
        fullName: "Door Usher"
      },
      {
        id: "m-elena",
        email: "elena@ekklesphere.church",
        username: "elenam",
        phone: "+233244445566",
        role: "member",
        fullName: "Elena Mends"
      }
    ];
    const memList = testProfiles.map((acc) => ({
      id: acc.id,
      tenantId: testOrgId,
      firstName: acc.fullName.split(" ")[0],
      lastName: acc.fullName.split(" ").slice(1).join(" ") || "Member",
      email: acc.email,
      phoneE164: acc.phone,
      username: acc.username,
      role: acc.role,
      status: "active",
      groupName: acc.role === "usher" ? "Ushering Ministry" : "General Congregation",
      autoCheckinOptedIn: true,
      avatarInitials: acc.fullName.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase(),
      joinedOn: now.toISOString().slice(0, 10),
      consecutiveAbsences: 0
    }));
    this.membersByOrg.set(testOrgId, memList);
    primaryOrg.memberCount = memList.length;
  }
  // ===========================================================================
  // SUPABASE AUTH IDENTITY & MEMBERSHIP RESOLUTION (Phase 0 #1 & #4)
  // ===========================================================================
  async verifySupabaseAccessToken(accessToken) {
    const sb = this.activeSupabase;
    let sbUser = null;
    if (sb) {
      const { data, error } = await sb.auth.getUser(accessToken);
      if (error || !data?.user) {
        return null;
      }
      sbUser = data.user;
    } else if (!this.isTestRuntime && this.supabaseUrl && this.supabaseAuthKey) {
      try {
        const res = await fetch(`${this.supabaseUrl.replace(/\/+$/, "")}/auth/v1/user`, {
          method: "GET",
          headers: {
            apikey: this.supabaseAuthKey,
            Authorization: `Bearer ${accessToken}`
          }
        });
        if (!res.ok) return null;
        const payload = await res.json();
        if (!payload?.id) return null;
        sbUser = payload;
      } catch {
        return null;
      }
    } else {
      return null;
    }
    const email = (sbUser.email || "").toLowerCase();
    const avatar = typeof sbUser.user_metadata?.avatar_url === "string" && sbUser.user_metadata.avatar_url.trim() || typeof sbUser.user_metadata?.picture === "string" && sbUser.user_metadata.picture.trim() || void 0;
    let isCreator = Boolean(
      sbUser.app_metadata?.creator === true || sbUser.app_metadata?.is_super_admin === true
    );
    let credRow = null;
    if (sb) {
      const credOrFilters = [`auth_user_id.eq.${sbUser.id}`];
      if (email) credOrFilters.push(`email.ilike.${email}`);
      const { data: matchedCredRow } = await sb.from("account_credentials").select("is_creator, role, status, organization_id").or(credOrFilters.join(",")).limit(1).maybeSingle();
      credRow = matchedCredRow || null;
    }
    if (credRow && credRow.status && credRow.status !== "active") {
      return null;
    }
    if (!isCreator && credRow && (credRow.is_creator === true || credRow.role === "creator" || credRow.role === "super_admin")) {
      isCreator = true;
    }
    let resolvedOrgId = credRow?.organization_id && UUID_REGEX2.test(String(credRow.organization_id)) ? String(credRow.organization_id).toLowerCase() : "";
    let resolvedRole = isCreator ? mapCredentialRoleToChurchRole(credRow?.role, true) : "member";
    let resolvedName = typeof sbUser.user_metadata?.full_name === "string" && sbUser.user_metadata.full_name || typeof sbUser.user_metadata?.name === "string" && sbUser.user_metadata.name || email.split("@")[0] || "Ekklesphere User";
    if (sb) {
      const { data: memberRow } = await sb.from("members").select("id, organization_id, role, preferred_name, first_name, last_name").or(`user_id.eq.${sbUser.id}${email ? `,email.ilike.${email}` : ""}`).limit(1).maybeSingle();
      if (memberRow) {
        if (memberRow.organization_id) {
          resolvedOrgId = String(memberRow.organization_id).toLowerCase();
        }
        if (!isCreator) {
          resolvedRole = mapSupabaseRoleToChurchRole(memberRow.role);
        }
        const dbName = memberRow.preferred_name || `${memberRow.first_name || ""} ${memberRow.last_name || ""}`.trim();
        if (dbName) resolvedName = dbName;
      } else {
        const usersLookup = await this.lookupUserAndRolesByAuthId(sb, sbUser.id);
        if (usersLookup) {
          if (usersLookup.organizationId) {
            resolvedOrgId = usersLookup.organizationId;
          }
          if (!isCreator && usersLookup.role) {
            resolvedRole = usersLookup.role;
          }
        }
      }
    } else {
      const fallbackMembership = await this.lookupMemberRoleInStore(sbUser.id, email);
      if (fallbackMembership.organizationId) resolvedOrgId = fallbackMembership.organizationId;
      if (!isCreator && fallbackMembership.role) resolvedRole = fallbackMembership.role;
      if (fallbackMembership.name) resolvedName = fallbackMembership.name;
    }
    if (!isCreator && resolvedOrgId) {
      const org = await this.getOrganisationById(resolvedOrgId);
      if (org && (org.status === "suspended" || org.status === "archived")) {
        return null;
      }
    }
    if (!resolvedOrgId) {
      const orgs = await this.listOrganisations();
      resolvedOrgId = orgs[0]?.id || "";
    }
    return {
      id: sbUser.id,
      email,
      role: resolvedRole,
      organization_id: resolvedOrgId,
      tenant_id: resolvedOrgId,
      campus_id: void 0,
      name: resolvedName,
      avatar,
      is_creator: isCreator,
      auth_provider: "supabase"
    };
  }
  async lookupUserAndRolesByAuthId(sb, authUserId) {
    if (!UUID_REGEX2.test(authUserId)) return null;
    try {
      const { data: userRow, error: userErr } = await sb.from("users").select("id, tenant_id, status").eq("auth_user_id", authUserId).limit(1).maybeSingle();
      if (userErr || !userRow || userRow.status && userRow.status !== "active") {
        return null;
      }
      const orgId = userRow.tenant_id ? String(userRow.tenant_id).toLowerCase() : "";
      let resolvedRole = "member";
      const { data: roleRows } = await sb.from("user_roles").select("role").eq("user_id", userRow.id);
      if (Array.isArray(roleRows) && roleRows.length > 0) {
        const priority = ["admin", "pastor", "finance", "usher", "group_leader", "member"];
        const mapped = roleRows.map((r) => mapSupabaseRoleToChurchRole(r.role));
        for (const candidate of priority) {
          if (mapped.includes(candidate)) {
            resolvedRole = candidate;
            break;
          }
        }
      }
      return { organizationId: orgId, role: resolvedRole };
    } catch {
      return null;
    }
  }
  async lookupMemberRoleInStore(userId, email) {
    const cleanEmail = (email || "").trim().toLowerCase();
    const sb = this.activeSupabase;
    if (sb) {
      const { data: row } = await sb.from("members").select("organization_id, role, preferred_name, first_name, last_name").or(
        UUID_REGEX2.test(userId) ? `user_id.eq.${userId}${cleanEmail ? `,email.ilike.${cleanEmail}` : ""}` : `email.ilike.${cleanEmail}`
      ).limit(1).maybeSingle();
      if (row) {
        return {
          organizationId: String(row.organization_id || "").toLowerCase(),
          role: mapSupabaseRoleToChurchRole(row.role),
          name: row.preferred_name || `${row.first_name || ""} ${row.last_name || ""}`.trim() || void 0
        };
      }
      if (UUID_REGEX2.test(userId)) {
        const usersLookup = await this.lookupUserAndRolesByAuthId(sb, userId);
        if (usersLookup) {
          return {
            organizationId: usersLookup.organizationId,
            role: usersLookup.role
          };
        }
      }
    }
    for (const [orgId, members] of this.membersByOrg.entries()) {
      const found = members.find(
        (m) => m.id === userId || cleanEmail && String(m.email || "").toLowerCase() === cleanEmail
      );
      if (found) {
        return {
          organizationId: orgId,
          role: mapSupabaseRoleToChurchRole(found.role),
          name: `${found.firstName || ""} ${found.lastName || ""}`.trim() || void 0
        };
      }
    }
    const orgs = await this.listOrganisations();
    return {
      organizationId: orgs[0]?.id || "",
      role: "member"
    };
  }
  async recordAuthAuditEvent(params) {
    const identifierHash = (0, import_crypto4.createHash)("sha256").update(params.identifier.trim().toLowerCase() || "anonymous").digest("hex").slice(0, 24);
    const hashedIp = params.ipAddress ? `ip:${(0, import_crypto4.createHash)("sha256").update(params.ipAddress.trim()).digest("hex").slice(0, 16)}` : null;
    if (this.supabase) {
      await this.supabase.from("auth_audit_events").insert({
        organization_id: params.organizationId && UUID_REGEX2.test(params.organizationId) ? params.organizationId.toLowerCase() : null,
        account_id: params.accountId && UUID_REGEX2.test(params.accountId) ? params.accountId : null,
        identifier_hash: identifierHash,
        event_type: params.eventType,
        ip_address: hashedIp,
        success: params.success,
        reason: params.reason || null
      }).then(void 0, () => {
      });
    }
  }
  async consumeDistributedAuthRateLimit(rateKey, maxAttempts, windowSeconds, lockoutSeconds) {
    if (!this.supabase) {
      return { allowed: true, retryAfterSeconds: 0 };
    }
    try {
      const { data, error } = await this.supabase.rpc("consume_auth_rate_limit", {
        p_rate_key: rateKey,
        p_max_attempts: maxAttempts,
        p_window_seconds: windowSeconds,
        p_lockout_seconds: lockoutSeconds
      });
      if (error || !Array.isArray(data) || data.length === 0) {
        return { allowed: true, retryAfterSeconds: 0 };
      }
      const row = data[0];
      return {
        allowed: row.allowed !== false,
        retryAfterSeconds: Number(row.retry_after_seconds || 0)
      };
    } catch {
      return { allowed: true, retryAfterSeconds: 0 };
    }
  }
  async resetDistributedAuthRateLimit(rateKey) {
    if (!this.supabase) return;
    try {
      await this.supabase.rpc("reset_auth_rate_limit", { p_rate_key: rateKey });
    } catch {
    }
  }
  getGenericOnboardingPassword() {
    const configured = (process.env.MEMBER_DEFAULT_ONBOARDING_PASSWORD || "").trim();
    if (configured.length >= 8) {
      return configured;
    }
    return DEFAULT_MEMBER_ONBOARDING_PASSWORD;
  }
  async syncUserToSupabaseAuth(params) {
    const sb = this.activeSupabase;
    if (!sb || !sb.auth?.admin) return null;
    const cleanEmail = params.email ? params.email.trim().toLowerCase() : "";
    const cleanPhone = params.phoneE164 ? normalizePhone(params.phoneE164) : "";
    const digitsOnly = cleanPhone.replace(/\D/g, "");
    const authEmail = cleanEmail || (digitsOnly ? `phone-${digitsOnly}@members.ekklesphere.local` : "");
    if (!authEmail) return null;
    const userMetadata = {
      full_name: params.fullName,
      role: params.role,
      ...params.organizationId ? { organization_id: params.organizationId } : {},
      ...cleanPhone ? { phone_e164: cleanPhone } : {},
      ...params.memberId ? { member_id: params.memberId } : {}
    };
    const appMetadata = {
      role: params.role,
      ...params.organizationId ? { organization_id: params.organizationId } : {},
      creator: Boolean(params.isCreator),
      is_super_admin: Boolean(params.isCreator)
    };
    let authUserId = params.existingAuthUserId && UUID_REGEX2.test(params.existingAuthUserId) ? params.existingAuthUserId : null;
    if (!authUserId && params.memberId && UUID_REGEX2.test(params.memberId)) {
      const { data: memberRow } = await sb.from("members").select("user_id").eq("id", params.memberId).maybeSingle();
      if (memberRow?.user_id && UUID_REGEX2.test(String(memberRow.user_id))) {
        authUserId = String(memberRow.user_id);
      }
    }
    if (authUserId) {
      const { data: updatedData, error: updateErr } = await sb.auth.admin.updateUserById(
        authUserId,
        {
          email: authEmail,
          ...params.password ? { password: params.password } : {},
          email_confirm: true,
          user_metadata: userMetadata,
          app_metadata: appMetadata
        }
      );
      if (!updateErr && updatedData?.user?.id) {
        authUserId = updatedData.user.id;
      } else if (updateErr && /not found|404/i.test(updateErr.message || "")) {
        authUserId = null;
      } else if (updateErr) {
        console.warn("[Ekklesphere Auth Sync] updateUserById warning:", updateErr.message);
      }
    }
    if (!authUserId) {
      let createRes = await sb.auth.admin.createUser({
        email: authEmail,
        ...params.password ? { password: params.password } : {},
        ...cleanPhone ? { phone: cleanPhone, phone_confirm: true } : {},
        email_confirm: true,
        user_metadata: userMetadata,
        app_metadata: appMetadata
      });
      if (createRes.error && cleanPhone && /phone/i.test(createRes.error.message || "")) {
        createRes = await sb.auth.admin.createUser({
          email: authEmail,
          ...params.password ? { password: params.password } : {},
          email_confirm: true,
          user_metadata: userMetadata,
          app_metadata: appMetadata
        });
      }
      if (!createRes.error && createRes.data?.user?.id) {
        authUserId = createRes.data.user.id;
      } else if (createRes.error && /already|exists|registered|duplicate/i.test(createRes.error.message || "")) {
        const listRes = await sb.auth.admin.listUsers({ page: 1, perPage: 1e3 });
        const matchedUser = listRes.data?.users?.find(
          (u) => u.email && u.email.toLowerCase() === authEmail || cleanPhone && u.phone && normalizePhone(u.phone) === cleanPhone
        );
        if (matchedUser?.id) {
          authUserId = matchedUser.id;
          await sb.auth.admin.updateUserById(authUserId, {
            email: authEmail,
            ...params.password ? { password: params.password } : {},
            email_confirm: true,
            user_metadata: userMetadata,
            app_metadata: appMetadata
          });
        }
      } else if (createRes.error) {
        throw new Error(`Failed to sync user credential to Supabase Auth: ${createRes.error.message}`);
      }
    }
    if (authUserId && params.memberId && UUID_REGEX2.test(params.memberId)) {
      const { error: linkErr } = await sb.from("members").update({ user_id: authUserId, updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", params.memberId);
      if (linkErr) {
        console.warn("[Ekklesphere Auth Sync] Failed to link members.user_id:", linkErr.message);
      }
    }
    return authUserId;
  }
  async resolveAuthEmailForCredential(cred) {
    const sb = this.activeSupabase;
    if (sb && cred.authUserId && UUID_REGEX2.test(cred.authUserId) && sb.auth?.admin?.getUserById) {
      try {
        const { data } = await sb.auth.admin.getUserById(cred.authUserId);
        if (data?.user?.email) {
          return data.user.email.trim().toLowerCase();
        }
      } catch {
      }
    }
    const cleanEmail = cred.email ? cred.email.trim().toLowerCase() : "";
    if (cleanEmail) return cleanEmail;
    const digitsOnly = (cred.phoneE164 || "").replace(/\D/g, "");
    return digitsOnly ? `phone-${digitsOnly}@members.ekklesphere.local` : "";
  }
  async verifyPasswordViaSupabaseAuth(authEmail, password) {
    const cleanEmail = (authEmail || "").trim().toLowerCase();
    if (!cleanEmail || !password) return { matched: false };
    if (this.customSupabaseAuthVerifier) {
      return this.customSupabaseAuthVerifier(cleanEmail, password);
    }
    if (!this.supabaseUrl || !this.supabaseAuthKey) {
      return { matched: false };
    }
    try {
      const verifierClient = (0, import_supabase_js2.createClient)(this.supabaseUrl, this.supabaseAuthKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false
        }
      });
      const { data, error } = await verifierClient.auth.signInWithPassword({
        email: cleanEmail,
        password
      });
      if (!error && data?.user?.id) {
        return { matched: true, authUserId: data.user.id };
      }
      return { matched: false };
    } catch {
      return { matched: false };
    }
  }
  async upsertAccountCredentialsRow(sb, payload, legacyHashFallback) {
    const { error: firstErr } = await sb.from("account_credentials").upsert(payload, { onConflict: "id" });
    if (!firstErr) return;
    if (/null value in column "password_(?:hash|salt)"|23502/i.test(firstErr.message || "") && legacyHashFallback) {
      const withHashes = {
        ...payload,
        password_hash: legacyHashFallback.hash,
        password_salt: legacyHashFallback.salt
      };
      const retry = await sb.from("account_credentials").upsert(withHashes, { onConflict: "id" });
      if (!retry.error) return;
    }
    if (/column .* does not exist|Could not find the '[^']+' column|schema cache/i.test(
      firstErr.message || ""
    )) {
      const stripped = { ...payload };
      if (/temp_password_encrypted/i.test(firstErr.message || "") && !/must_change_password|password_updated_at/i.test(firstErr.message || "")) {
        delete stripped.temp_password_encrypted;
      } else {
        delete stripped.must_change_password;
        delete stripped.password_updated_at;
        delete stripped.temp_password_encrypted;
      }
      const retry = await sb.from("account_credentials").upsert(stripped, { onConflict: "id" });
      if (!retry.error) return;
      if (/null value in column "password_(?:hash|salt)"|23502/i.test(retry.error.message || "") && legacyHashFallback) {
        const retryWithHashes = await sb.from("account_credentials").upsert(
          {
            ...stripped,
            password_hash: legacyHashFallback.hash,
            password_salt: legacyHashFallback.salt
          },
          { onConflict: "id" }
        );
        if (!retryWithHashes.error) return;
        throw new Error(`Failed to persist account credentials in Supabase: ${retryWithHashes.error.message}`);
      }
      throw new Error(`Failed to persist account credentials in Supabase: ${retry.error.message}`);
    }
    throw new Error(`Failed to persist account credentials in Supabase: ${firstErr.message}`);
  }
  async scrubLegacyPasswordHashes(credId, authUserId) {
    const sb = this.activeSupabase;
    if (!sb || !this.canVerifyViaSupabaseAuth) return;
    try {
      const patch = {
        password_hash: null,
        password_salt: null,
        updated_at: (/* @__PURE__ */ new Date()).toISOString(),
        ...authUserId ? { auth_user_id: authUserId } : {}
      };
      await sb.from("account_credentials").update(patch).eq("id", credId);
    } catch {
    }
  }
  async provisionCredentialRecord(params) {
    this.assertDatabaseAvailable();
    const { hash, salt } = hashPassword(params.password);
    const requestedId = params.id || (0, import_crypto4.randomUUID)();
    const normalizedEmail = params.email ? params.email.trim().toLowerCase() : void 0;
    const normalizedUsername = params.username ? params.username.trim().toLowerCase() : void 0;
    const normalizedPhone = params.phoneE164 ? normalizePhone(params.phoneE164) : void 0;
    const cleanOrgId = params.organizationId ? params.organizationId.toLowerCase() : "";
    const fullName = params.name.trim() || "Ekklesphere User";
    const sb = this.activeSupabase;
    if (sb) {
      let resolvedId = UUID_REGEX2.test(requestedId) ? requestedId : toDeterministicUuid(requestedId);
      let existingAuthUserId = null;
      const lookupFilters = [`id.eq.${resolvedId}`];
      if (normalizedEmail) lookupFilters.push(`email.ilike.${normalizedEmail}`);
      if (normalizedUsername) lookupFilters.push(`username.ilike.${normalizedUsername}`);
      if (normalizedPhone) lookupFilters.push(`phone_e164.eq.${normalizedPhone}`);
      const { data: existingRow } = await sb.from("account_credentials").select("id, auth_user_id").or(lookupFilters.join(",")).limit(1).maybeSingle();
      if (existingRow?.id) {
        resolvedId = String(existingRow.id);
        existingAuthUserId = existingRow.auth_user_id ? String(existingRow.auth_user_id) : null;
      }
      const authUserId = await this.syncUserToSupabaseAuth({
        existingAuthUserId,
        email: normalizedEmail,
        phoneE164: normalizedPhone,
        password: params.password,
        fullName,
        organizationId: cleanOrgId && UUID_REGEX2.test(cleanOrgId) ? cleanOrgId : void 0,
        role: params.role,
        isCreator: Boolean(params.isCreator),
        memberId: params.memberId && UUID_REGEX2.test(params.memberId) ? params.memberId : void 0
      });
      const omitStoredHashes = Boolean(authUserId && this.canVerifyViaSupabaseAuth);
      const isTempPassword2 = Boolean(params.mustChangePassword) && !params.isCreator;
      const sealedTempPassword = isTempPassword2 ? sealTemporaryPassword(params.password) : null;
      const payload = {
        id: resolvedId,
        member_id: params.memberId && UUID_REGEX2.test(params.memberId) ? params.memberId : null,
        organization_id: cleanOrgId && UUID_REGEX2.test(cleanOrgId) ? cleanOrgId : null,
        email: normalizedEmail || null,
        username: normalizedUsername || null,
        phone_e164: normalizedPhone || null,
        full_name: fullName,
        role: params.role,
        is_creator: Boolean(params.isCreator),
        // Passwords live in Supabase Auth (auth.users); keep hashes null once migrated
        password_hash: omitStoredHashes ? null : hash,
        password_salt: omitStoredHashes ? null : salt,
        status: "active",
        failed_attempts: 0,
        locked_until: null,
        must_change_password: Boolean(params.mustChangePassword),
        password_updated_at: params.passwordUpdatedAt ?? null,
        temp_password_encrypted: sealedTempPassword,
        ...authUserId ? { auth_user_id: authUserId } : {}
      };
      await this.upsertAccountCredentialsRow(sb, payload, { hash, salt });
      if (isTempPassword2) {
        this.tempPasswordByCredId.set(resolvedId, params.password);
      } else {
        this.tempPasswordByCredId.delete(resolvedId);
      }
      return {
        id: resolvedId,
        memberId: params.memberId,
        ...authUserId ? { authUserId } : {},
        organizationId: cleanOrgId,
        email: normalizedEmail,
        username: normalizedUsername,
        phoneE164: normalizedPhone,
        name: fullName,
        role: params.role,
        isCreator: Boolean(params.isCreator),
        passwordHash: authUserId ? "" : hash,
        passwordSalt: authUserId ? "" : salt,
        status: "active",
        mustChangePassword: Boolean(params.mustChangePassword),
        ...isTempPassword2 ? { temporaryPassword: params.password } : {},
        passwordUpdatedAt: params.passwordUpdatedAt ?? null,
        failedAttempts: 0,
        lockedUntil: null,
        createdAt: (/* @__PURE__ */ new Date()).toISOString()
      };
    }
    const isTempPassword = Boolean(params.mustChangePassword) && !params.isCreator;
    const record = {
      id: requestedId,
      memberId: params.memberId,
      organizationId: cleanOrgId,
      email: normalizedEmail,
      username: normalizedUsername,
      phoneE164: normalizedPhone,
      name: fullName,
      role: params.role,
      isCreator: Boolean(params.isCreator),
      passwordHash: hash,
      passwordSalt: salt,
      status: "active",
      mustChangePassword: Boolean(params.mustChangePassword),
      ...isTempPassword ? { temporaryPassword: params.password } : {},
      passwordUpdatedAt: params.passwordUpdatedAt ?? null,
      failedAttempts: 0,
      lockedUntil: null,
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    for (const [existingKey, existing] of this.userCredentials.entries()) {
      const sameEmail = Boolean(record.email && existing.email && existing.email.toLowerCase() === record.email);
      const sameUsername = Boolean(
        record.username && existing.username && existing.username.toLowerCase() === record.username
      );
      const samePhone = Boolean(record.phoneE164 && existing.phoneE164 && existing.phoneE164 === record.phoneE164);
      if (existingKey === record.id || sameEmail || sameUsername || samePhone) {
        this.userCredentials.delete(existingKey);
        this.tempPasswordByCredId.delete(existingKey);
      }
    }
    this.userCredentials.set(record.id, record);
    if (isTempPassword) {
      this.tempPasswordByCredId.set(record.id, params.password);
    } else {
      this.tempPasswordByCredId.delete(record.id);
    }
    return record;
  }
  async findCredentialByContactOrMember(params) {
    this.assertDatabaseAvailable();
    const cleanEmail = params.email ? params.email.trim().toLowerCase() : "";
    const cleanPhone = params.phoneE164 ? normalizePhone(params.phoneE164) : "";
    const cleanMemberId = params.memberId ? params.memberId.trim() : "";
    const sb = this.activeSupabase;
    if (sb) {
      const orFilters = [];
      if (cleanMemberId && UUID_REGEX2.test(cleanMemberId)) {
        orFilters.push(
          `id.eq.${cleanMemberId}`,
          `member_id.eq.${cleanMemberId}`,
          `auth_user_id.eq.${cleanMemberId}`
        );
      }
      if (cleanEmail) {
        orFilters.push(`email.ilike.${cleanEmail}`);
      }
      if (cleanPhone) {
        orFilters.push(`phone_e164.eq.${cleanPhone}`);
      }
      if (orFilters.length > 0) {
        const { data: row, error } = await sb.from("account_credentials").select("*").or(orFilters.join(",")).limit(1).maybeSingle();
        if (error) {
          throw new Error(`Failed to query account credentials in Supabase: ${error.message}`);
        }
        if (row && (row.auth_user_id || row.password_hash && row.password_salt)) {
          const isCreator = Boolean(
            row.is_creator || row.role === "creator" || row.role === "super_admin"
          );
          return {
            id: String(row.id),
            memberId: row.member_id ? String(row.member_id) : void 0,
            authUserId: row.auth_user_id ? String(row.auth_user_id) : void 0,
            organizationId: String(row.organization_id || "").toLowerCase(),
            email: row.email ? String(row.email).toLowerCase() : void 0,
            username: row.username ? String(row.username).toLowerCase() : void 0,
            phoneE164: row.phone_e164 ? String(row.phone_e164) : void 0,
            name: String(row.full_name || "Member"),
            role: mapCredentialRoleToChurchRole(row.role, isCreator),
            isCreator,
            passwordHash: row.password_hash ? String(row.password_hash) : "",
            passwordSalt: row.password_salt ? String(row.password_salt) : "",
            status: row.status || "active",
            mustChangePassword: Boolean(row.must_change_password),
            passwordUpdatedAt: row.password_updated_at ? String(row.password_updated_at) : null,
            failedAttempts: Number(row.failed_attempts || 0),
            lockedUntil: row.locked_until ? String(row.locked_until) : null,
            createdAt: row.created_at ? String(row.created_at) : void 0
          };
        }
      }
      return void 0;
    }
    for (const cred of this.userCredentials.values()) {
      if (cleanMemberId && (cred.memberId === cleanMemberId || cred.id === cleanMemberId)) {
        return cred;
      }
      if (cleanEmail && cred.email && cred.email.toLowerCase() === cleanEmail) {
        return cred;
      }
      if (cleanPhone && cred.phoneE164 && cred.phoneE164 === cleanPhone) {
        return cred;
      }
    }
    return void 0;
  }
  async autoProvisionMemberCredentials(params) {
    const cleanEmail = params.email ? String(params.email).trim().toLowerCase() : "";
    const cleanPhone = params.phoneE164 ? normalizePhone(String(params.phoneE164)) : "";
    const identifiers = [cleanEmail, cleanPhone].filter(Boolean);
    if (identifiers.length === 0) {
      return {
        provisioned: false,
        status: "skipped_no_contact",
        identifiers: [],
        mustChangePassword: false
      };
    }
    const existing = await this.findCredentialByContactOrMember({
      memberId: params.memberId,
      email: cleanEmail || void 0,
      phoneE164: cleanPhone || void 0
    });
    if (existing) {
      return {
        provisioned: false,
        status: "already_exists",
        identifiers,
        mustChangePassword: Boolean(existing.mustChangePassword)
      };
    }
    const temporaryPassword = params.initialPassword && params.initialPassword.trim().length >= 8 ? params.initialPassword.trim() : this.getGenericOnboardingPassword();
    const fullName = `${params.firstName || ""} ${params.lastName || ""}`.trim() || "Congregation Member";
    const credId = UUID_REGEX2.test(params.memberId) ? params.memberId : (0, import_crypto4.randomUUID)();
    try {
      const createdCred = await this.provisionCredentialRecord({
        id: credId,
        memberId: params.memberId,
        organizationId: params.organizationId,
        email: cleanEmail || void 0,
        phoneE164: cleanPhone || void 0,
        name: fullName,
        role: "member",
        isCreator: false,
        password: temporaryPassword,
        mustChangePassword: true,
        passwordUpdatedAt: null
      });
      await this.recordAuthAuditEvent({
        organizationId: params.organizationId,
        accountId: createdCred.id,
        identifier: cleanEmail || cleanPhone || params.memberId,
        eventType: "account_auto_provisioned",
        success: true,
        reason: "member_onboarding_generic_password"
      });
      return {
        provisioned: true,
        status: "created",
        identifiers,
        temporaryPassword,
        mustChangePassword: true
      };
    } catch (err) {
      if (/duplicate|unique|23505/i.test(String(err?.message || ""))) {
        return {
          provisioned: false,
          status: "already_exists",
          identifiers,
          mustChangePassword: false
        };
      }
      throw err;
    }
  }
  async getCredentialStatus(userId, email) {
    const matched = await this.findCredentialByContactOrMember({
      memberId: userId,
      email: email || void 0
    });
    if (!matched) {
      return {
        hasPasswordCredential: false,
        mustChangePassword: false,
        passwordUpdatedAt: null
      };
    }
    return {
      hasPasswordCredential: true,
      mustChangePassword: Boolean(matched.mustChangePassword),
      passwordUpdatedAt: matched.passwordUpdatedAt ?? null
    };
  }
  async changePasswordForUser(params) {
    const currentPassword = (params.currentPassword || "").trim();
    const newPassword = (params.newPassword || "").trim();
    if (!currentPassword) {
      const err = new Error("Current password is required.");
      err.code = "INVALID_CURRENT_PASSWORD";
      err.status = 400;
      throw err;
    }
    if (newPassword.length < 8) {
      const err = new Error("New password must be at least 8 characters long.");
      err.code = "WEAK_PASSWORD";
      err.status = 400;
      throw err;
    }
    const cred = await this.findCredentialByContactOrMember({
      memberId: params.userId,
      email: params.email || void 0
    });
    if (!cred) {
      const err = new Error("No password-based account credentials found for your session.");
      err.code = "CREDENTIAL_NOT_FOUND";
      err.status = 404;
      throw err;
    }
    const sb = this.activeSupabase;
    let currentPasswordMatches = false;
    if (sb) {
      const authEmail = await this.resolveAuthEmailForCredential(cred);
      if (authEmail) {
        const sbVerify = await this.verifyPasswordViaSupabaseAuth(authEmail, currentPassword);
        currentPasswordMatches = sbVerify.matched;
      }
      if (!currentPasswordMatches && cred.passwordHash && cred.passwordSalt) {
        currentPasswordMatches = verifyPassword(currentPassword, cred.passwordHash, cred.passwordSalt);
      }
    } else {
      currentPasswordMatches = verifyPassword(currentPassword, cred.passwordHash, cred.passwordSalt);
    }
    if (!currentPasswordMatches) {
      await this.recordAuthAuditEvent({
        organizationId: cred.organizationId,
        accountId: cred.id,
        identifier: cred.email || cred.phoneE164 || cred.id,
        eventType: "password_changed",
        ipAddress: params.ipAddress,
        success: false,
        reason: "current_password_mismatch"
      });
      const err = new Error("Current password is incorrect.");
      err.code = "INVALID_CURRENT_PASSWORD";
      err.status = 401;
      throw err;
    }
    if (newPassword === currentPassword) {
      const err = new Error("Please choose a new password that differs from your current password.");
      err.code = "PASSWORD_UNCHANGED";
      err.status = 400;
      throw err;
    }
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    if (sb) {
      const syncedAuthUserId = await this.syncUserToSupabaseAuth({
        existingAuthUserId: cred.authUserId,
        email: cred.email,
        phoneE164: cred.phoneE164,
        password: newPassword,
        fullName: cred.name,
        organizationId: cred.organizationId || void 0,
        role: cred.role,
        isCreator: cred.isCreator,
        memberId: cred.memberId
      });
      const fallbackHashes = hashPassword(newPassword);
      const omitStoredHashes = Boolean(syncedAuthUserId && this.canVerifyViaSupabaseAuth);
      const baseUpdate = {
        id: cred.id,
        password_hash: omitStoredHashes ? null : fallbackHashes.hash,
        password_salt: omitStoredHashes ? null : fallbackHashes.salt,
        failed_attempts: 0,
        locked_until: null,
        updated_at: nowIso,
        must_change_password: false,
        password_updated_at: nowIso,
        temp_password_encrypted: null,
        ...syncedAuthUserId ? { auth_user_id: syncedAuthUserId } : {}
      };
      const { error: updateErr } = await sb.from("account_credentials").update(baseUpdate).eq("id", cred.id);
      if (updateErr && /null value in column "password_(?:hash|salt)"|23502/i.test(updateErr.message || "")) {
        const retry = await sb.from("account_credentials").update({
          ...baseUpdate,
          password_hash: fallbackHashes.hash,
          password_salt: fallbackHashes.salt
        }).eq("id", cred.id);
        if (retry.error) {
          throw new Error(`Failed to update password in Supabase: ${retry.error.message}`);
        }
      } else if (updateErr && /column .* does not exist|Could not find the '[^']+' column|schema cache/i.test(
        updateErr.message || ""
      )) {
        const stripped = { ...baseUpdate };
        if (/temp_password_encrypted/i.test(updateErr.message || "") && !/must_change_password|password_updated_at/i.test(updateErr.message || "")) {
          delete stripped.temp_password_encrypted;
        } else {
          delete stripped.must_change_password;
          delete stripped.password_updated_at;
          delete stripped.temp_password_encrypted;
        }
        const retry = await sb.from("account_credentials").update(stripped).eq("id", cred.id);
        if (retry.error) {
          throw new Error(`Failed to update password in Supabase: ${retry.error.message}`);
        }
      } else if (updateErr) {
        throw new Error(`Failed to update password in Supabase: ${updateErr.message}`);
      }
    } else {
      const { hash, salt } = hashPassword(newPassword);
      cred.passwordHash = hash;
      cred.passwordSalt = salt;
      cred.mustChangePassword = false;
      cred.temporaryPassword = void 0;
      cred.passwordUpdatedAt = nowIso;
      cred.failedAttempts = 0;
      cred.lockedUntil = null;
      this.userCredentials.set(cred.id, cred);
    }
    this.tempPasswordByCredId.delete(cred.id);
    await this.resetDistributedAuthRateLimit(`login:${cred.id}`);
    await this.recordAuthAuditEvent({
      organizationId: cred.organizationId,
      accountId: cred.id,
      identifier: cred.email || cred.phoneE164 || cred.id,
      eventType: "password_changed",
      ipAddress: params.ipAddress,
      success: true
    });
    return {
      success: true,
      mustChangePassword: false,
      passwordUpdatedAt: nowIso
    };
  }
  async listOrganisationAdminCredentials(organizationId) {
    this.assertDatabaseAvailable();
    const cleanOrgId = (organizationId || "").trim().toLowerCase();
    if (!cleanOrgId) return [];
    if (this.supabase) {
      if (!UUID_REGEX2.test(cleanOrgId)) return [];
      const { data: rows, error } = await this.supabase.from("account_credentials").select(
        "id, member_id, organization_id, email, username, phone_e164, full_name, role, is_creator, status, locked_until, last_login_at, created_at, must_change_password"
      ).eq("organization_id", cleanOrgId).eq("is_creator", false).in("role", ["owner", "admin", "pastor", "super_admin"]).order("created_at", { ascending: true });
      if (error) {
        throw new Error(`Failed to load organisation admin credentials: ${error.message}`);
      }
      return (rows || []).map((row) => ({
        id: String(row.id),
        memberId: row.member_id ? String(row.member_id) : void 0,
        organizationId: cleanOrgId,
        email: row.email ? String(row.email).toLowerCase() : void 0,
        username: row.username ? String(row.username).toLowerCase() : void 0,
        phoneE164: row.phone_e164 ? String(row.phone_e164) : void 0,
        fullName: String(row.full_name || "Church Administrator"),
        role: mapSupabaseRoleToChurchRole(row.role),
        status: String(row.status || "active"),
        mustChangePassword: Boolean(row.must_change_password),
        lockedUntil: row.locked_until ? String(row.locked_until) : null,
        lastLoginAt: row.last_login_at ? String(row.last_login_at) : null,
        createdAt: row.created_at ? String(row.created_at) : void 0
      }));
    }
    const result = [];
    for (const c of this.userCredentials.values()) {
      if (c.organizationId.toLowerCase() === cleanOrgId && !c.isCreator && ["admin", "pastor", "super_admin"].includes(c.role)) {
        result.push({
          id: c.id,
          memberId: c.memberId,
          organizationId: c.organizationId,
          email: c.email,
          username: c.username,
          phoneE164: c.phoneE164,
          fullName: c.name,
          role: c.role,
          status: c.status,
          mustChangePassword: Boolean(c.mustChangePassword),
          lockedUntil: c.lockedUntil || null,
          lastLoginAt: null,
          createdAt: c.createdAt
        });
      }
    }
    return result;
  }
  async provisionOrganisationAdminCredentials(params) {
    this.assertDatabaseAvailable();
    const cleanOrgId = (params.organizationId || "").trim().toLowerCase();
    const org = await this.getOrganisationById(cleanOrgId);
    if (!org) {
      const err = new Error("Target organisation not found.");
      err.code = "NOT_FOUND";
      err.status = 404;
      throw err;
    }
    const email = params.email ? params.email.trim().toLowerCase() : "";
    const username = params.username ? params.username.trim().toLowerCase() : "";
    const phoneE164 = params.phone ? normalizePhone(params.phone) : "";
    const fullName = (params.fullName || "").trim() || org.contactName || `${org.name} Admin`;
    const password = (params.password || "").trim();
    const role = params.role === "pastor" ? "pastor" : "admin";
    if (!email && !phoneE164) {
      const err = new Error("An administrator email address or phone number is required.");
      err.code = "INVALID_INPUT";
      err.status = 400;
      throw err;
    }
    if (password.length < 8) {
      const err = new Error("Password must be at least 8 characters long.");
      err.code = "WEAK_PASSWORD";
      err.status = 400;
      throw err;
    }
    let matchingSameOrg;
    if (this.supabase) {
      const orFilters = [];
      if (email) orFilters.push(`email.ilike.${email}`);
      if (username) orFilters.push(`username.ilike.${username}`);
      if (phoneE164) orFilters.push(`phone_e164.eq.${phoneE164}`);
      if (orFilters.length > 0) {
        const { data: rows, error } = await this.supabase.from("account_credentials").select("*").or(orFilters.join(",")).limit(5);
        if (error) {
          throw new Error(`Failed to query account credentials in Supabase: ${error.message}`);
        }
        if (Array.isArray(rows) && rows.length > 0) {
          for (const row of rows) {
            const rowOrgId = String(row.organization_id || "").toLowerCase();
            if (row.is_creator || rowOrgId && rowOrgId !== cleanOrgId) {
              const err = new Error(
                "This email, username, or phone already belongs to another organisation or platform creator."
              );
              err.code = "DUPLICATE_CREDENTIAL";
              err.status = 409;
              throw err;
            }
          }
          const sameRow = rows[0];
          matchingSameOrg = {
            id: String(sameRow.id),
            memberId: sameRow.member_id ? String(sameRow.member_id) : void 0,
            organizationId: cleanOrgId,
            email: sameRow.email ? String(sameRow.email).toLowerCase() : void 0,
            username: sameRow.username ? String(sameRow.username).toLowerCase() : void 0,
            phoneE164: sameRow.phone_e164 ? String(sameRow.phone_e164) : void 0,
            name: String(sameRow.full_name || fullName),
            role: mapSupabaseRoleToChurchRole(sameRow.role),
            isCreator: false,
            passwordHash: String(sameRow.password_hash || ""),
            passwordSalt: String(sameRow.password_salt || ""),
            status: sameRow.status || "active"
          };
        }
      }
    } else {
      for (const c of this.userCredentials.values()) {
        const matches = email && c.email && c.email.toLowerCase() === email || username && c.username && c.username.toLowerCase() === username || phoneE164 && c.phoneE164 && c.phoneE164 === phoneE164;
        if (matches) {
          if (c.isCreator || c.organizationId && c.organizationId.toLowerCase() !== cleanOrgId) {
            const err = new Error(
              "This email, username, or phone is already assigned to another account or platform creator."
            );
            err.code = "DUPLICATE_CREDENTIAL";
            err.status = 409;
            throw err;
          }
          matchingSameOrg = c;
          break;
        }
      }
    }
    let targetMemberId = matchingSameOrg?.memberId;
    if (!targetMemberId) {
      const orgMembers = await this.getMembers(cleanOrgId);
      const matchedMember = orgMembers.find(
        (m) => email && String(m.email || "").toLowerCase() === email || phoneE164 && normalizePhone(m.phoneE164 || m.phone) === phoneE164
      );
      if (matchedMember) {
        targetMemberId = String(matchedMember.id);
        await this.updateMember(cleanOrgId, targetMemberId, {
          role,
          status: "active",
          ...email ? { email } : {},
          ...phoneE164 ? { phoneE164 } : {}
        });
      } else {
        const nameParts = fullName.split(/\s+/).filter(Boolean);
        const firstName = nameParts[0] || "Church";
        const lastName = nameParts.slice(1).join(" ") || "Admin";
        const createdMember = await this.createMember(
          cleanOrgId,
          {
            firstName,
            lastName,
            email: email || void 0,
            phoneE164: phoneE164 || void 0,
            groupName: "Church Leadership",
            autoCheckinOptedIn: false,
            role,
            status: "active"
          },
          { skipAutoCredentials: true }
        );
        targetMemberId = String(createdMember.id);
      }
    }
    const credId = matchingSameOrg?.id || (UUID_REGEX2.test(targetMemberId) ? targetMemberId : (0, import_crypto4.randomUUID)());
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    const record = await this.provisionCredentialRecord({
      id: credId,
      memberId: targetMemberId,
      organizationId: cleanOrgId,
      email: email || void 0,
      username: username || void 0,
      phoneE164: phoneE164 || void 0,
      name: fullName,
      role,
      isCreator: false,
      password,
      mustChangePassword: Boolean(params.requirePasswordChange),
      passwordUpdatedAt: nowIso
    });
    await this.resetDistributedAuthRateLimit(`login:${record.id}`);
    await this.recordAuthAuditEvent({
      organizationId: cleanOrgId,
      accountId: record.id,
      identifier: email || phoneE164 || username || record.id,
      eventType: matchingSameOrg ? "password_changed" : "account_auto_provisioned",
      ipAddress: params.ipAddress,
      success: true,
      reason: "creator_provisioned_org_admin"
    });
    return {
      credential: {
        id: record.id,
        memberId: record.memberId,
        organizationId: cleanOrgId,
        email: record.email,
        username: record.username,
        phoneE164: record.phoneE164,
        fullName: record.name,
        role: record.role,
        status: record.status,
        mustChangePassword: Boolean(record.mustChangePassword)
      },
      resetExisting: Boolean(matchingSameOrg),
      persistedInSupabase: Boolean(this.supabase)
    };
  }
  async upsertCreatorCredentials(params) {
    this.assertDatabaseAvailable();
    const email = (params.email || "").trim().toLowerCase();
    if (!email) {
      const err = new Error("Creator email is required.");
      err.code = "INVALID_INPUT";
      err.status = 400;
      throw err;
    }
    const username = params.username ? params.username.trim().toLowerCase() : void 0;
    const phoneE164 = params.phone ? normalizePhone(params.phone) : void 0;
    const name = (params.name || "").trim() || "Platform Creator";
    const orgId = params.organizationId && UUID_REGEX2.test(params.organizationId.trim()) ? params.organizationId.trim().toLowerCase() : "";
    let existingCred;
    let existingAuthUserId = null;
    const sb = this.activeSupabase;
    if (sb) {
      let row = null;
      if (params.id && UUID_REGEX2.test(params.id)) {
        const byId = await sb.from("account_credentials").select("*").eq("id", params.id).limit(1).maybeSingle();
        row = byId.data;
      }
      if (!row) {
        const byEmail = await sb.from("account_credentials").select("*").ilike("email", email).limit(1).maybeSingle();
        row = byEmail.data;
      }
      if (row) {
        existingAuthUserId = row.auth_user_id ? String(row.auth_user_id) : null;
        existingCred = {
          id: String(row.id),
          authUserId: existingAuthUserId || void 0,
          organizationId: row.organization_id ? String(row.organization_id).toLowerCase() : "",
          email: row.email ? String(row.email).toLowerCase() : void 0,
          username: row.username ? String(row.username).toLowerCase() : void 0,
          phoneE164: row.phone_e164 ? String(row.phone_e164) : void 0,
          name: String(row.full_name || "Platform Creator"),
          role: "creator",
          isCreator: true,
          passwordHash: row.password_hash ? String(row.password_hash) : "",
          passwordSalt: row.password_salt ? String(row.password_salt) : "",
          status: row.status || "active"
        };
      }
    } else {
      for (const c of this.userCredentials.values()) {
        if (params.id && c.id === params.id || c.email && c.email.toLowerCase() === email) {
          existingCred = c;
          break;
        }
      }
    }
    const rawPassword = (params.password || "").trim();
    if (!existingCred && rawPassword.length < 8) {
      const err = new Error("Creator password must be at least 8 characters long.");
      err.code = "WEAK_PASSWORD";
      err.status = 400;
      throw err;
    }
    if (rawPassword && rawPassword.length < 8) {
      const err = new Error("New password must be at least 8 characters long.");
      err.code = "WEAK_PASSWORD";
      err.status = 400;
      throw err;
    }
    const { hash, salt } = rawPassword ? hashPassword(rawPassword) : { hash: existingCred?.passwordHash || "", salt: existingCred?.passwordSalt || "" };
    const credId = existingCred?.id || toDeterministicUuid(`creator:${email}`);
    const resolvedOrgId = orgId || existingCred?.organizationId || "";
    const resolvedUsername = username !== void 0 ? username || void 0 : existingCred?.username;
    const resolvedPhone = phoneE164 !== void 0 ? phoneE164 || void 0 : existingCred?.phoneE164;
    let persistedInSupabase = false;
    if (sb) {
      const authUserId = await this.syncUserToSupabaseAuth({
        existingAuthUserId,
        email,
        phoneE164: resolvedPhone,
        password: rawPassword || void 0,
        fullName: name,
        organizationId: resolvedOrgId && UUID_REGEX2.test(resolvedOrgId) ? resolvedOrgId : void 0,
        role: "creator",
        isCreator: true
      });
      const omitStoredHashes = Boolean(authUserId && this.canVerifyViaSupabaseAuth);
      const baseCreatorRow = {
        id: UUID_REGEX2.test(credId) ? credId : toDeterministicUuid(credId),
        organization_id: resolvedOrgId && UUID_REGEX2.test(resolvedOrgId) ? resolvedOrgId : null,
        email,
        username: resolvedUsername || null,
        phone_e164: resolvedPhone || null,
        full_name: name,
        role: "creator",
        is_creator: true,
        password_hash: omitStoredHashes ? null : hash,
        password_salt: omitStoredHashes ? null : salt,
        status: "active",
        failed_attempts: 0,
        locked_until: null,
        ...authUserId ? { auth_user_id: authUserId } : {}
      };
      await this.upsertAccountCredentialsRow(sb, baseCreatorRow, hash && salt ? { hash, salt } : void 0);
      persistedInSupabase = true;
    } else {
      const updated = {
        id: credId,
        organizationId: resolvedOrgId,
        email,
        username: resolvedUsername,
        phoneE164: resolvedPhone,
        name,
        role: "creator",
        isCreator: true,
        passwordHash: hash,
        passwordSalt: salt,
        status: "active",
        failedAttempts: 0,
        lockedUntil: null,
        createdAt: existingCred?.createdAt || (/* @__PURE__ */ new Date()).toISOString()
      };
      this.userCredentials.set(credId, updated);
    }
    const sessionTimeoutMinutes = await this.getOrganizationSessionTimeoutMinutes(resolvedOrgId);
    const { token, idleTimeoutMinutes, expiresAt } = signSessionToken(
      {
        id: credId,
        email,
        role: "creator",
        organization_id: resolvedOrgId,
        tenant_id: resolvedOrgId,
        name,
        is_creator: true
      },
      sessionTimeoutMinutes
    );
    return {
      user: {
        id: credId,
        email,
        username: resolvedUsername,
        phoneE164: resolvedPhone,
        name,
        role: "creator",
        organizationId: resolvedOrgId,
        isCreator: true
      },
      token,
      idleTimeoutMinutes,
      sessionExpiresAt: expiresAt,
      persistedInSupabase
    };
  }
  async getCreatorProfileSummary(id, email) {
    this.assertDatabaseAvailable();
    const cleanEmail = (email || "").trim().toLowerCase();
    if (this.supabase) {
      let row = null;
      if (UUID_REGEX2.test(id)) {
        const byId = await this.supabase.from("account_credentials").select("id, organization_id, email, username, phone_e164, full_name, is_creator, role").eq("id", id).limit(1).maybeSingle();
        row = byId.data;
      }
      if (!row && cleanEmail) {
        const byEmail = await this.supabase.from("account_credentials").select("id, organization_id, email, username, phone_e164, full_name, is_creator, role").ilike("email", cleanEmail).limit(1).maybeSingle();
        row = byEmail.data;
      }
      if (row) {
        return {
          id: String(row.id),
          email: String(row.email || cleanEmail),
          username: row.username ? String(row.username) : void 0,
          phoneE164: row.phone_e164 ? String(row.phone_e164) : void 0,
          name: String(row.full_name || "Platform Creator"),
          organizationId: row.organization_id ? String(row.organization_id).toLowerCase() : "",
          source: "supabase",
          envSecretsConfigured: {
            email: Boolean(process.env.CREATOR_EMAIL?.trim()),
            password: Boolean(process.env.CREATOR_PASSWORD?.trim()),
            username: Boolean(process.env.CREATOR_USERNAME?.trim()),
            phone: Boolean(process.env.CREATOR_PHONE?.trim()),
            name: Boolean(process.env.CREATOR_NAME?.trim()),
            bootstrapSecret: Boolean(process.env.CREATOR_BOOTSTRAP_SECRET?.trim())
          }
        };
      }
    }
    let matched;
    if (!this.supabase) {
      matched = this.userCredentials.get(id);
      if (!matched) {
        for (const c of this.userCredentials.values()) {
          if (c.isCreator && cleanEmail && c.email?.toLowerCase() === cleanEmail) {
            matched = c;
            break;
          }
        }
      }
    }
    return {
      id: matched?.id || id,
      email: matched?.email || cleanEmail,
      username: matched?.username,
      phoneE164: matched?.phoneE164,
      name: matched?.name || process.env.CREATOR_NAME?.trim() || "Platform Creator",
      organizationId: matched?.organizationId || "",
      source: "env_or_memory",
      envSecretsConfigured: {
        email: Boolean(process.env.CREATOR_EMAIL?.trim()),
        password: Boolean(process.env.CREATOR_PASSWORD?.trim()),
        username: Boolean(process.env.CREATOR_USERNAME?.trim()),
        phone: Boolean(process.env.CREATOR_PHONE?.trim()),
        name: Boolean(process.env.CREATOR_NAME?.trim()),
        bootstrapSecret: Boolean(process.env.CREATOR_BOOTSTRAP_SECRET?.trim())
      }
    };
  }
  async authenticateWithCredentials(rawIdentifier, rawPassword, ipAddress) {
    this.assertDatabaseAvailable();
    const identifier = (rawIdentifier || "").trim();
    const password = (rawPassword || "").trim();
    if (!identifier || !password) {
      const err = new Error("Identifier (email, phone, or username) and password are required.");
      err.code = "INVALID_CREDENTIALS";
      err.status = 400;
      throw err;
    }
    const lowerId = identifier.toLowerCase();
    const normalizedPhone = normalizePhone(identifier);
    const sb = this.activeSupabase;
    let foundCred;
    if (sb) {
      const hasPostgrestDelimiters = /[,():]/.test(lowerId);
      const safeId = lowerId.replace(/"/g, "");
      const orFilters = hasPostgrestDelimiters ? [`email.ilike."${safeId}"`, `username.ilike."${safeId}"`] : [`email.ilike.${lowerId}`, `username.ilike.${lowerId}`];
      if (normalizedPhone) {
        orFilters.push(`phone_e164.eq.${normalizedPhone}`);
      }
      const { data: credRow, error: credQueryErr } = await sb.from("account_credentials").select("*").or(orFilters.join(",")).limit(1).maybeSingle();
      if (credQueryErr) {
        const queryErr = new Error(
          `Failed to verify credentials against Supabase: ${credQueryErr.message}`
        );
        queryErr.status = 503;
        queryErr.code = "SUPABASE_QUERY_ERROR";
        throw queryErr;
      }
      if (credRow && (credRow.auth_user_id || credRow.password_hash && credRow.password_salt)) {
        const isCreator = Boolean(
          credRow.is_creator || credRow.role === "creator" || credRow.role === "super_admin"
        );
        foundCred = {
          id: String(credRow.id),
          memberId: credRow.member_id ? String(credRow.member_id) : void 0,
          authUserId: credRow.auth_user_id ? String(credRow.auth_user_id) : void 0,
          email: credRow.email ? String(credRow.email).toLowerCase() : void 0,
          username: credRow.username ? String(credRow.username).toLowerCase() : void 0,
          phoneE164: credRow.phone_e164 ? String(credRow.phone_e164) : void 0,
          passwordHash: credRow.password_hash ? String(credRow.password_hash) : "",
          passwordSalt: credRow.password_salt ? String(credRow.password_salt) : "",
          role: mapCredentialRoleToChurchRole(credRow.role, isCreator),
          organizationId: String(credRow.organization_id || "").toLowerCase(),
          name: String(credRow.full_name || "Member"),
          isCreator,
          status: credRow.status || "active",
          mustChangePassword: Boolean(credRow.must_change_password),
          passwordUpdatedAt: credRow.password_updated_at ? String(credRow.password_updated_at) : null,
          failedAttempts: Number(credRow.failed_attempts || 0),
          lockedUntil: credRow.locked_until ? String(credRow.locked_until) : null,
          createdAt: credRow.created_at ? String(credRow.created_at) : void 0
        };
      } else {
        const envEmail = (process.env.CREATOR_EMAIL || "").trim().toLowerCase();
        const envPass = (process.env.CREATOR_PASSWORD || "").trim();
        const envUsername = (process.env.CREATOR_USERNAME || "").trim().toLowerCase();
        const envPhone = normalizePhone(process.env.CREATOR_PHONE);
        const matchesEnvCreatorId = Boolean(envEmail && envPass) && (lowerId === envEmail || envUsername && lowerId === envUsername || envPhone && normalizedPhone === envPhone);
        if (matchesEnvCreatorId && password === envPass) {
          const bootstrapped = await this.upsertCreatorCredentials({
            email: envEmail,
            username: envUsername || void 0,
            phone: envPhone || void 0,
            name: (process.env.CREATOR_NAME || "").trim() || "Platform Creator",
            password: envPass,
            organizationId: process.env.CREATOR_ORGANIZATION_ID && UUID_REGEX2.test(process.env.CREATOR_ORGANIZATION_ID.trim()) ? process.env.CREATOR_ORGANIZATION_ID.trim().toLowerCase() : ""
          });
          foundCred = {
            id: bootstrapped.user.id,
            organizationId: bootstrapped.user.organizationId,
            email: bootstrapped.user.email,
            username: bootstrapped.user.username,
            phoneE164: bootstrapped.user.phoneE164,
            name: bootstrapped.user.name,
            role: "creator",
            isCreator: true,
            passwordHash: "",
            passwordSalt: "",
            status: "active",
            mustChangePassword: false,
            failedAttempts: 0,
            lockedUntil: null
          };
        }
      }
    } else {
      for (const cred of this.userCredentials.values()) {
        const matchEmail = cred.email && cred.email.toLowerCase() === lowerId;
        const matchUsername = cred.username && cred.username.toLowerCase() === lowerId;
        const matchPhone = cred.phoneE164 && (cred.phoneE164 === normalizedPhone || cred.phoneE164 === identifier);
        if (matchEmail || matchUsername || matchPhone) {
          foundCred = cred;
          break;
        }
      }
    }
    if (!foundCred) {
      await this.recordAuthAuditEvent({
        identifier,
        eventType: "login_failed",
        ipAddress,
        success: false,
        reason: "account_not_found"
      });
      const err = new Error("Invalid email/username or password.");
      err.code = "INVALID_CREDENTIALS";
      err.status = 401;
      throw err;
    }
    if (foundCred.lockedUntil) {
      const lockedUntilMs = new Date(foundCred.lockedUntil).getTime();
      if (!Number.isNaN(lockedUntilMs) && lockedUntilMs > Date.now()) {
        const retryAfterSeconds = Math.max(1, Math.ceil((lockedUntilMs - Date.now()) / 1e3));
        await this.recordAuthAuditEvent({
          organizationId: foundCred.organizationId,
          accountId: foundCred.id,
          identifier,
          eventType: "login_locked",
          ipAddress,
          success: false,
          reason: `locked_for_${retryAfterSeconds}s`
        });
        const err = new Error(
          `Too many failed login attempts. Account is temporarily locked. Try again in ${Math.ceil(retryAfterSeconds / 60)} minute(s).`
        );
        err.code = "ACCOUNT_LOCKED";
        err.status = 429;
        err.retryAfterSeconds = retryAfterSeconds;
        throw err;
      }
      foundCred.failedAttempts = 0;
      foundCred.lockedUntil = null;
    }
    if (foundCred.status !== "active") {
      const err = new Error("Account is inactive or suspended. Contact your church administrator.");
      err.code = "ACCOUNT_INACTIVE";
      err.status = 403;
      throw err;
    }
    let passwordMatches = false;
    let verifiedAuthUserId = foundCred.authUserId;
    if (sb) {
      const authEmail = await this.resolveAuthEmailForCredential(foundCred);
      if (authEmail) {
        const sbAuthRes = await this.verifyPasswordViaSupabaseAuth(authEmail, password);
        if (sbAuthRes.matched) {
          passwordMatches = true;
          verifiedAuthUserId = sbAuthRes.authUserId || verifiedAuthUserId;
          if (foundCred.passwordHash || foundCred.passwordSalt || !foundCred.authUserId) {
            await this.scrubLegacyPasswordHashes(foundCred.id, verifiedAuthUserId);
          }
        }
      }
      if (!passwordMatches && foundCred.passwordHash && foundCred.passwordSalt) {
        const legacyValid = verifyPassword(password, foundCred.passwordHash, foundCred.passwordSalt);
        if (legacyValid) {
          passwordMatches = true;
          try {
            const syncedId = await this.syncUserToSupabaseAuth({
              existingAuthUserId: foundCred.authUserId,
              email: foundCred.email,
              phoneE164: foundCred.phoneE164,
              password,
              fullName: foundCred.name,
              organizationId: foundCred.organizationId || void 0,
              role: foundCred.role,
              isCreator: foundCred.isCreator,
              memberId: foundCred.memberId
            });
            if (syncedId) {
              verifiedAuthUserId = syncedId;
              await this.scrubLegacyPasswordHashes(foundCred.id, syncedId);
            }
          } catch (syncErr) {
            console.warn("[Ekklesphere Auth Migration] Deferred Auth sync warning:", syncErr?.message);
          }
        }
      }
    } else {
      passwordMatches = verifyPassword(password, foundCred.passwordHash, foundCred.passwordSalt);
    }
    const distributedRateKey = `login:${foundCred.id}`;
    if (!passwordMatches) {
      const nextAttempts = (foundCred.failedAttempts || 0) + 1;
      foundCred.failedAttempts = nextAttempts;
      const lockoutSeconds = Math.ceil(LOGIN_LOCKOUT_MS / 1e3);
      const distributedLimit = await this.consumeDistributedAuthRateLimit(
        distributedRateKey,
        MAX_FAILED_LOGIN_ATTEMPTS,
        lockoutSeconds,
        lockoutSeconds
      );
      const isNowLocked = !distributedLimit.allowed || nextAttempts >= MAX_FAILED_LOGIN_ATTEMPTS;
      const lockedUntilIso = isNowLocked ? new Date(Date.now() + LOGIN_LOCKOUT_MS).toISOString() : null;
      if (isNowLocked) {
        foundCred.lockedUntil = lockedUntilIso;
      }
      if (sb) {
        await sb.from("account_credentials").update({
          failed_attempts: nextAttempts,
          locked_until: lockedUntilIso
        }).eq("id", foundCred.id);
      } else {
        this.userCredentials.set(foundCred.id, foundCred);
      }
      await this.recordAuthAuditEvent({
        organizationId: foundCred.organizationId,
        accountId: foundCred.id,
        identifier,
        eventType: isNowLocked ? "login_locked" : "login_failed",
        ipAddress,
        success: false,
        reason: isNowLocked ? "max_attempts_exceeded" : "password_mismatch"
      });
      if (isNowLocked) {
        const retryAfterSeconds = distributedLimit.retryAfterSeconds || lockoutSeconds;
        const err2 = new Error(
          "Too many failed login attempts. Account locked for 15 minutes for your security."
        );
        err2.code = "ACCOUNT_LOCKED";
        err2.status = 429;
        err2.retryAfterSeconds = retryAfterSeconds;
        throw err2;
      }
      const err = new Error("Invalid email/username or password.");
      err.code = "INVALID_CREDENTIALS";
      err.status = 401;
      throw err;
    }
    await this.resetDistributedAuthRateLimit(distributedRateKey);
    if (sb) {
      await sb.from("account_credentials").update({
        failed_attempts: 0,
        locked_until: null,
        last_login_at: (/* @__PURE__ */ new Date()).toISOString(),
        ...verifiedAuthUserId && !foundCred.authUserId ? { auth_user_id: verifiedAuthUserId } : {}
      }).eq("id", foundCred.id);
    } else {
      foundCred.failedAttempts = 0;
      foundCred.lockedUntil = null;
      this.userCredentials.set(foundCred.id, foundCred);
    }
    await this.recordAuthAuditEvent({
      organizationId: foundCred.organizationId,
      accountId: foundCred.id,
      identifier,
      eventType: "login_success",
      ipAddress,
      success: true
    });
    let organization = null;
    if (foundCred.organizationId) {
      organization = await this.getOrganisationById(foundCred.organizationId) || null;
      if (!foundCred.isCreator && organization && (organization.status === "suspended" || organization.status === "archived")) {
        await this.recordAuthAuditEvent({
          organizationId: foundCred.organizationId,
          accountId: foundCred.id,
          identifier,
          eventType: "login_failed",
          ipAddress,
          success: false,
          reason: `organisation_${organization.status}`
        });
        const err = new Error(
          "Organisation access has been revoked or suspended. Contact platform support."
        );
        err.code = "ACCOUNT_INACTIVE";
        err.status = 403;
        throw err;
      }
    }
    const sessionTimeoutMinutes = await this.getOrganizationSessionTimeoutMinutes(
      foundCred.organizationId
    );
    const resolvedDesignation = await this.resolveUserDesignation(
      foundCred.organizationId,
      foundCred.memberId || foundCred.id,
      foundCred.email,
      foundCred.designation
    );
    const { token, idleTimeoutMinutes, expiresAt } = signSessionToken(
      {
        id: foundCred.memberId || foundCred.id,
        email: foundCred.email || `${foundCred.username || "user"}@ekklesphere.church`,
        role: foundCred.role,
        organization_id: foundCred.organizationId,
        tenant_id: foundCred.organizationId,
        name: foundCred.name,
        ...resolvedDesignation ? { designation: resolvedDesignation } : {},
        is_creator: foundCred.isCreator
      },
      sessionTimeoutMinutes
    );
    return {
      user: {
        id: foundCred.memberId || foundCred.id,
        email: foundCred.email || "",
        username: foundCred.username,
        phoneE164: foundCred.phoneE164,
        name: foundCred.name,
        ...resolvedDesignation ? { designation: resolvedDesignation } : {},
        role: foundCred.role,
        organizationId: foundCred.organizationId,
        isCreator: foundCred.isCreator,
        mustChangePassword: Boolean(foundCred.mustChangePassword)
      },
      organization,
      token,
      idleTimeoutMinutes,
      sessionExpiresAt: expiresAt
    };
  }
  async registerMemberWithCredentials(params) {
    this.assertDatabaseAvailable();
    const firstName = (params.firstName || "").trim();
    const lastName = (params.lastName || "").trim();
    const email = params.email ? params.email.trim().toLowerCase() : "";
    const phone = params.phone ? params.phone.trim() : "";
    const password = (params.password || "").trim();
    if (!firstName || !lastName) {
      const err = new Error("First name and last name are required.");
      err.code = "INVALID_INPUT";
      err.status = 400;
      throw err;
    }
    if (!email && !phone) {
      const err = new Error("Either an email address or a valid phone number is required.");
      err.code = "INVALID_INPUT";
      err.status = 400;
      throw err;
    }
    if (password.length < 8) {
      const err = new Error("Password must be at least 8 characters long.");
      err.code = "WEAK_PASSWORD";
      err.status = 400;
      throw err;
    }
    const normalizedPhone = normalizePhone(phone);
    if (this.supabase) {
      const orFilters = [];
      if (email) orFilters.push(`email.ilike.${email}`);
      if (normalizedPhone) orFilters.push(`phone_e164.eq.${normalizedPhone}`);
      if (orFilters.length > 0) {
        const { data: existingCred, error } = await this.supabase.from("account_credentials").select("id").or(orFilters.join(",")).limit(1).maybeSingle();
        if (error) {
          throw new Error(`Failed to verify existing credentials in Supabase: ${error.message}`);
        }
        if (existingCred) {
          const err = new Error("An account with this email or phone already exists. Please log in.");
          err.code = "DUPLICATE_CREDENTIAL";
          err.status = 409;
          throw err;
        }
      }
    } else {
      for (const cred of this.userCredentials.values()) {
        if (email && cred.email && cred.email.toLowerCase() === email) {
          const err = new Error("An account with this email address already exists. Please log in.");
          err.code = "DUPLICATE_CREDENTIAL";
          err.status = 409;
          throw err;
        }
        if (normalizedPhone && cred.phoneE164 && cred.phoneE164 === normalizedPhone) {
          const err = new Error("An account with this phone number already exists. Please log in.");
          err.code = "DUPLICATE_CREDENTIAL";
          err.status = 409;
          throw err;
        }
      }
    }
    const orgs = await this.listOrganisations();
    let targetOrgId = "";
    if (params.organizationId && UUID_REGEX2.test(params.organizationId.trim())) {
      const matched = orgs.find((o) => o.id.toLowerCase() === params.organizationId.trim().toLowerCase());
      if (matched) targetOrgId = matched.id;
    } else if (params.organizationSlug && params.organizationSlug.trim()) {
      const slug = params.organizationSlug.trim().toLowerCase();
      const matched = orgs.find((o) => o.slug.toLowerCase() === slug);
      if (matched) targetOrgId = matched.id;
    }
    if (!targetOrgId) {
      const activeOrg = orgs.find((o) => o.status === "active" || o.licenseStatus === "active") || orgs[0];
      if (activeOrg) {
        targetOrgId = activeOrg.id;
      }
    }
    if (!targetOrgId) {
      const err = new Error("No church organization is currently available for registration.");
      err.code = "NO_TENANT_AVAILABLE";
      err.status = 400;
      throw err;
    }
    const member = await this.createMember(
      targetOrgId,
      {
        firstName,
        lastName,
        email: email || void 0,
        phoneE164: normalizedPhone || phone || void 0,
        groupName: params.groupName || "General Congregation",
        autoCheckinOptedIn: params.autoCheckinOptedIn ?? true,
        role: "member",
        status: "active"
      },
      { skipAutoCredentials: true }
    );
    const memberId = String(member.id || (0, import_crypto4.randomUUID)());
    const fullName = `${firstName} ${lastName}`.trim();
    const newCred = await this.provisionCredentialRecord({
      id: memberId,
      memberId,
      organizationId: targetOrgId,
      email: email || void 0,
      phoneE164: normalizedPhone || void 0,
      name: fullName,
      role: "member",
      isCreator: false,
      password,
      mustChangePassword: false
    });
    await this.recordAuthAuditEvent({
      organizationId: targetOrgId,
      accountId: newCred.id,
      identifier: email || normalizedPhone || memberId,
      eventType: "register_success",
      ipAddress: params.ipAddress,
      success: true
    });
    const organization = await this.getOrganisationById(targetOrgId);
    const sessionTimeoutMinutes = await this.getOrganizationSessionTimeoutMinutes(targetOrgId);
    const { token, idleTimeoutMinutes, expiresAt } = signSessionToken(
      {
        id: memberId,
        email: email || `${normalizedPhone || "member"}@ekklesphere.church`,
        role: "member",
        organization_id: targetOrgId,
        tenant_id: targetOrgId,
        name: newCred.name,
        is_creator: false
      },
      sessionTimeoutMinutes
    );
    return {
      user: {
        id: memberId,
        email,
        phoneE164: normalizedPhone,
        name: newCred.name,
        role: "member",
        organizationId: targetOrgId,
        isCreator: false,
        mustChangePassword: false
      },
      organization,
      token,
      idleTimeoutMinutes,
      sessionExpiresAt: expiresAt
    };
  }
  async registerOrganisationTrial(params) {
    this.assertDatabaseAvailable();
    const orgName = (params.organizationName || "").trim();
    const firstName = (params.adminFirstName || "").trim();
    const lastName = (params.adminLastName || "").trim();
    const email = (params.email || "").trim().toLowerCase();
    const rawPhone = (params.phone || "").trim();
    const password = (params.password || "").trim();
    const trialPlan = params.trialPlan || "grace_starter";
    if (orgName.length < 2) {
      const err = new Error("Organisation or church name must be at least 2 characters.");
      err.code = "INVALID_INPUT";
      err.status = 400;
      throw err;
    }
    if (!firstName || !lastName) {
      const err = new Error("Administrator first and last name are required.");
      err.code = "INVALID_INPUT";
      err.status = 400;
      throw err;
    }
    if (!email) {
      const err = new Error("Administrator email address is required.");
      err.code = "INVALID_INPUT";
      err.status = 400;
      throw err;
    }
    if (password.length < 8) {
      const err = new Error("Password must be at least 8 characters long.");
      err.code = "WEAK_PASSWORD";
      err.status = 400;
      throw err;
    }
    const normalizedPhone = normalizePhone(rawPhone);
    if (this.supabase) {
      const orFilters = [`email.ilike.${email}`];
      if (normalizedPhone) orFilters.push(`phone_e164.eq.${normalizedPhone}`);
      const { data: existingCred, error } = await this.supabase.from("account_credentials").select("id").or(orFilters.join(",")).limit(1).maybeSingle();
      if (error) {
        throw new Error(`Failed to verify existing credentials in Supabase: ${error.message}`);
      }
      if (existingCred) {
        const err = new Error("An account with this email or phone already exists. Please sign in instead.");
        err.code = "DUPLICATE_CREDENTIAL";
        err.status = 409;
        throw err;
      }
    } else {
      for (const cred of this.userCredentials.values()) {
        if (cred.email && cred.email.toLowerCase() === email) {
          const err = new Error("An account with this email address already exists. Please sign in instead.");
          err.code = "DUPLICATE_CREDENTIAL";
          err.status = 409;
          throw err;
        }
        if (normalizedPhone && cred.phoneE164 && cred.phoneE164 === normalizedPhone) {
          const err = new Error("An account with this phone number already exists. Please sign in instead.");
          err.code = "DUPLICATE_CREDENTIAL";
          err.status = 409;
          throw err;
        }
      }
    }
    const fullName = `${firstName} ${lastName}`.trim();
    const { organisation, license } = await this.createOrganisation({
      name: orgName,
      orgType: params.orgType || "church",
      city: params.city?.trim() || "Accra",
      country: params.country?.trim() || "Ghana",
      seniorPastor: fullName,
      contactName: fullName,
      contactEmail: email,
      contactPhone: normalizedPhone || rawPhone || void 0,
      initialPlan: trialPlan,
      autoIssueTrial: true
    });
    const adminMember = await this.createMember(
      organisation.id,
      {
        firstName,
        lastName,
        email,
        phoneE164: normalizedPhone || rawPhone || void 0,
        groupName: "Church Leadership",
        autoCheckinOptedIn: false,
        role: "admin",
        status: "active"
      },
      { skipAutoCredentials: true }
    );
    const memberId = String(adminMember.id || (0, import_crypto4.randomUUID)());
    const newCred = await this.provisionCredentialRecord({
      id: memberId,
      memberId,
      organizationId: organisation.id,
      email,
      phoneE164: normalizedPhone || void 0,
      name: fullName,
      role: "admin",
      isCreator: false,
      password,
      mustChangePassword: false
    });
    await this.recordAuthAuditEvent({
      organizationId: organisation.id,
      accountId: newCred.id,
      identifier: email,
      eventType: "register_success",
      ipAddress: params.ipAddress,
      success: true,
      reason: `organisation_trial_signup:${trialPlan}`
    });
    await this.appendAuditLog({
      organizationId: organisation.id,
      actorId: memberId,
      actorEmail: email,
      actorRole: "admin",
      action: "organisation.trial_signup",
      targetType: "organization",
      targetId: organisation.id,
      metadata: {
        organizationName: organisation.name,
        slug: organisation.slug,
        trialPlan,
        licenseKey: license?.key || null
      },
      ipAddress: params.ipAddress
    });
    await this.markMatchingLandingLeadsConverted(email, organisation.id).catch(() => {
    });
    const evaluation = await this.evaluateOrganizationLicense(organisation.id);
    const { token, idleTimeoutMinutes, expiresAt } = signSessionToken(
      {
        id: memberId,
        email,
        role: "admin",
        organization_id: organisation.id,
        tenant_id: organisation.id,
        name: fullName,
        is_creator: false
      },
      DEFAULT_IDLE_SESSION_TIMEOUT_MINUTES
    );
    return {
      user: {
        id: memberId,
        email,
        phoneE164: normalizedPhone || void 0,
        name: fullName,
        role: "admin",
        organizationId: organisation.id,
        isCreator: false,
        mustChangePassword: false
      },
      organization: organisation,
      license,
      evaluation,
      token,
      idleTimeoutMinutes,
      sessionExpiresAt: expiresAt
    };
  }
  // ===========================================================================
  // LICENSE EVALUATION & FAIL-CLOSED ENFORCEMENT (Phase 0 #6 & Phase 2)
  // ===========================================================================
  async evaluateOrganizationLicense(organizationId) {
    const orgId = organizationId.toLowerCase();
    const org = await this.getOrganisationById(orgId);
    const license = await this.getLatestLicenseForOrg(orgId);
    const seatsUsed = await this.getMemberCountForOrg(orgId);
    const sitesUsed = (await this.getSitesForOrg(orgId)).filter((s) => s.active).length;
    if (!license) {
      return {
        allowed: false,
        code: "LICENSE_MISSING",
        httpStatus: 403,
        status: "unlicensed",
        tier: null,
        organizationId: orgId,
        seatsUsed,
        seatsLimit: 0,
        sitesUsed,
        sitesLimit: 0,
        monthlyCheckinsLimit: 0,
        expiresDate: null,
        graceEndsDate: null,
        inGracePeriod: false,
        daysRemaining: null,
        graceDaysRemaining: null,
        message: "Access blocked: No valid Ekklesphere license exists for this organisation."
      };
    }
    const plan = await this.getPlan(license.tier) || DEFAULT_PLANS.grace_starter;
    const overrides = license.overrides || {};
    const seatsLimit = overrides.seatsLimit ?? license.seatsLimit ?? plan.seatsLimit;
    const sitesLimit = overrides.sitesLimit ?? license.sitesLimit ?? plan.sitesLimit;
    const monthlyCheckinsLimit = overrides.monthlyCheckinsLimit ?? license.monthlyCheckinsLimit ?? plan.monthlyCheckinsLimit;
    if (org?.status === "suspended" || license.status === "suspended") {
      return {
        allowed: false,
        code: "LICENSE_SUSPENDED",
        httpStatus: 403,
        status: "suspended",
        tier: license.tier,
        organizationId: orgId,
        licenseKey: license.key,
        seatsUsed,
        seatsLimit,
        sitesUsed,
        sitesLimit,
        monthlyCheckinsLimit,
        expiresDate: license.expiresDate,
        graceEndsDate: license.graceEndsDate || null,
        inGracePeriod: false,
        daysRemaining: 0,
        graceDaysRemaining: 0,
        message: "Organisation subscription is currently suspended. Contact platform support."
      };
    }
    if (license.status === "revoked") {
      return {
        allowed: false,
        code: "LICENSE_REVOKED",
        httpStatus: 403,
        status: "revoked",
        tier: license.tier,
        organizationId: orgId,
        licenseKey: license.key,
        seatsUsed,
        seatsLimit,
        sitesUsed,
        sitesLimit,
        monthlyCheckinsLimit,
        expiresDate: license.expiresDate,
        graceEndsDate: license.graceEndsDate || null,
        inGracePeriod: false,
        daysRemaining: 0,
        graceDaysRemaining: 0,
        message: "License has been revoked by the platform owner."
      };
    }
    const nowMs = Date.now();
    const expiresDt = new Date(
      license.expiresDate.includes("T") ? license.expiresDate : `${license.expiresDate}T23:59:59.999Z`
    );
    const expiresMs = expiresDt.getTime();
    const graceEndsMs = license.graceEndsDate ? new Date(
      license.graceEndsDate.includes("T") ? license.graceEndsDate : `${license.graceEndsDate}T23:59:59.999Z`
    ).getTime() : expiresMs + GRACE_PERIOD_DAYS * DAY_MS;
    const graceEndsIso = new Date(graceEndsMs).toISOString().slice(0, 10);
    if (nowMs > expiresMs) {
      if (nowMs <= graceEndsMs && license.status !== "expired") {
        const graceDaysRemaining = Math.max(1, Math.ceil((graceEndsMs - nowMs) / DAY_MS));
        return {
          allowed: true,
          code: "LICENSE_GRACE_PERIOD",
          httpStatus: 200,
          status: "grace_period",
          tier: license.tier,
          organizationId: orgId,
          licenseKey: license.key,
          seatsUsed,
          seatsLimit,
          sitesUsed,
          sitesLimit,
          monthlyCheckinsLimit,
          expiresDate: license.expiresDate,
          graceEndsDate: graceEndsIso,
          inGracePeriod: true,
          daysRemaining: 0,
          graceDaysRemaining,
          message: `License expired; operating within ${graceDaysRemaining}-day renewal grace period.`
        };
      }
      return {
        allowed: false,
        code: "LICENSE_EXPIRED",
        httpStatus: 402,
        status: "expired",
        tier: license.tier,
        organizationId: orgId,
        licenseKey: license.key,
        seatsUsed,
        seatsLimit,
        sitesUsed,
        sitesLimit,
        monthlyCheckinsLimit,
        expiresDate: license.expiresDate,
        graceEndsDate: graceEndsIso,
        inGracePeriod: false,
        daysRemaining: 0,
        graceDaysRemaining: 0,
        message: "License and 7-day grace period have expired. Please renew to restore access."
      };
    }
    const daysRemaining = Math.max(0, Math.ceil((expiresMs - nowMs) / DAY_MS));
    const effectiveStatus = license.status === "trial" ? "trial" : "active";
    return {
      allowed: true,
      code: effectiveStatus === "trial" ? "LICENSE_TRIAL" : "LICENSE_OK",
      httpStatus: 200,
      status: effectiveStatus,
      tier: license.tier,
      organizationId: orgId,
      licenseKey: license.key,
      seatsUsed,
      seatsLimit,
      sitesUsed,
      sitesLimit,
      monthlyCheckinsLimit,
      expiresDate: license.expiresDate,
      graceEndsDate: graceEndsIso,
      inGracePeriod: false,
      daysRemaining,
      graceDaysRemaining: GRACE_PERIOD_DAYS,
      message: effectiveStatus === "trial" ? `14-day onboarding trial active (${daysRemaining} day(s) remaining).` : "License active and in good standing."
    };
  }
  // ===========================================================================
  // TENANT OPERATIONAL METHODS (Sites, Premise, Check-ins, Raw Events, Members, Events, Push)
  // ===========================================================================
  async getPremiseSettings(organizationId) {
    this.assertDatabaseAvailable();
    const orgId = organizationId.toLowerCase();
    const sites = await this.getSitesForOrg(orgId);
    const activeSite = sites.find((s) => s.active) || sites[0] || null;
    if (this.supabase) {
      const { data: orgRow } = await this.supabase.from("organizations").select("*").eq("id", orgId).maybeSingle();
      if (orgRow && activeSite && Number.isFinite(activeSite.lat) && Number.isFinite(activeSite.lng)) {
        const ps = {
          organizationId: orgId,
          churchName: orgRow.name,
          campusName: activeSite.name,
          campusAddress: activeSite.address || orgRow.premise_address || "",
          lat: activeSite.lat,
          lng: activeSite.lng,
          accuracyM: null,
          innerGeofenceMeters: activeSite.radius_m || orgRow.inner_geofence_m || 60,
          outerGeofenceMeters: activeSite.outer_radius_m || orgRow.outer_geofence_m || 300,
          dwellTimeMinutes: activeSite.dwell_min || orgRow.dwell_time_min || 5,
          updatedAt: activeSite.updated_at || orgRow.updated_at || null,
          updatedBy: activeSite.updated_by
        };
        return { configured: true, site: activeSite, premiseSettings: ps, sites };
      }
      if (orgRow) {
        return {
          configured: false,
          site: null,
          premiseSettings: {
            organizationId: orgId,
            churchName: orgRow.name,
            campusName: orgRow.name,
            campusAddress: orgRow.premise_address || "",
            lat: null,
            lng: null,
            accuracyM: null,
            innerGeofenceMeters: orgRow.inner_geofence_m || 60,
            outerGeofenceMeters: orgRow.outer_geofence_m || 300,
            dwellTimeMinutes: orgRow.dwell_time_min || 5,
            updatedAt: null
          },
          sites
        };
      }
    }
    const memPremise = this.premiseByOrg.get(orgId) || null;
    const isConfigured = memPremise !== null && typeof memPremise.lat === "number" && typeof memPremise.lng === "number" && Number.isFinite(memPremise.lat) && Number.isFinite(memPremise.lng);
    return {
      configured: isConfigured,
      site: isConfigured ? activeSite : null,
      premiseSettings: memPremise,
      sites: isConfigured ? sites : []
    };
  }
  async savePremiseSettings(organizationId, params) {
    const orgId = organizationId.toLowerCase();
    this.assertDatabaseAvailable();
    const existingSites = await this.getSitesForOrg(orgId);
    const targetSiteId = params.siteId || existingSites[0]?.id || (0, import_crypto4.randomUUID)();
    const isNewSite = !existingSites.some((s) => s.id === targetSiteId);
    if (isNewSite) {
      const evalRes = await this.evaluateOrganizationLicense(orgId);
      if (evalRes.sitesLimit > 0 && existingSites.filter((s) => s.active).length >= evalRes.sitesLimit) {
        const limitErr = new Error(
          `Site limit reached (${evalRes.sitesUsed}/${evalRes.sitesLimit}). Upgrade your license plan to add another campus site.`
        );
        limitErr.code = "SITE_LIMIT_REACHED";
        limitErr.status = 403;
        throw limitErr;
      }
    }
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    const site = {
      id: targetSiteId,
      organization_id: orgId,
      name: params.campusName,
      address: params.campusAddress,
      lat: params.lat,
      lng: params.lng,
      radius_m: params.innerGeofenceMeters,
      outer_radius_m: Math.max(params.outerGeofenceMeters, params.innerGeofenceMeters),
      dwell_min: params.dwellTimeMinutes,
      active: true,
      updated_at: nowIso,
      updated_by: params.updatedBy
    };
    if (this.supabase) {
      const { error: siteErr } = await this.supabase.from("sites").upsert({
        id: site.id,
        organization_id: orgId,
        name: site.name,
        address: site.address,
        lat: site.lat,
        lng: site.lng,
        radius_m: site.radius_m,
        outer_radius_m: site.outer_radius_m,
        dwell_min: site.dwell_min,
        location: `SRID=4326;POINT(${site.lng} ${site.lat})`,
        active: true,
        updated_by: site.updated_by,
        updated_at: nowIso
      });
      if (siteErr) {
        throw new Error(`Failed to save site in Supabase: ${siteErr.message}`);
      }
      const { data: orgRow } = await this.supabase.from("organizations").select("settings").eq("id", orgId).maybeSingle();
      const mergedSettingsJson = {
        ...orgRow?.settings && typeof orgRow.settings === "object" ? orgRow.settings : {},
        campus_name: params.campusName,
        campus_address: params.campusAddress,
        campus_location_accuracy_m: params.accuracyM,
        campus_location_updated_at: nowIso,
        inner_geofence_m: site.radius_m,
        outer_geofence_m: site.outer_radius_m,
        dwell_time_min: site.dwell_min
      };
      const { error: orgErr } = await this.supabase.from("organizations").update({
        ...params.churchName.trim() ? { name: params.churchName.trim() } : {},
        premise_address: params.campusAddress,
        inner_geofence_m: site.radius_m,
        outer_geofence_m: site.outer_radius_m,
        dwell_time_min: site.dwell_min,
        settings: mergedSettingsJson,
        updated_at: nowIso
      }).eq("id", orgId);
      if (orgErr) {
        throw new Error(`Failed to update organisation premise in Supabase: ${orgErr.message}`);
      }
      const updatedSites2 = existingSites.some((s) => s.id === site.id) ? existingSites.map((s) => s.id === site.id ? site : s) : [site, ...existingSites];
      const premiseSettings2 = {
        organizationId: orgId,
        churchName: params.churchName,
        campusName: params.campusName,
        campusAddress: params.campusAddress,
        lat: params.lat,
        lng: params.lng,
        accuracyM: params.accuracyM,
        innerGeofenceMeters: site.radius_m,
        outerGeofenceMeters: site.outer_radius_m,
        dwellTimeMinutes: site.dwell_min,
        updatedAt: nowIso,
        updatedBy: params.updatedBy
      };
      return { site, premiseSettings: premiseSettings2, sites: updatedSites2 };
    }
    const updatedSites = existingSites.some((s) => s.id === site.id) ? existingSites.map((s) => s.id === site.id ? site : s) : [site, ...existingSites];
    this.sitesByOrg.set(orgId, updatedSites);
    const premiseSettings = {
      organizationId: orgId,
      churchName: params.churchName,
      campusName: params.campusName,
      campusAddress: params.campusAddress,
      lat: params.lat,
      lng: params.lng,
      accuracyM: params.accuracyM,
      innerGeofenceMeters: site.radius_m,
      outerGeofenceMeters: site.outer_radius_m,
      dwellTimeMinutes: site.dwell_min,
      updatedAt: nowIso,
      updatedBy: params.updatedBy
    };
    this.premiseByOrg.set(orgId, premiseSettings);
    const existingMemSettings = this.systemSettingsByOrg.get(orgId) || { ...DEFAULT_ORG_SYSTEM_SETTINGS };
    this.systemSettingsByOrg.set(orgId, {
      ...existingMemSettings,
      churchName: params.churchName || existingMemSettings.churchName,
      campusName: params.campusName,
      campusAddress: params.campusAddress,
      campusLatitude: params.lat,
      campusLongitude: params.lng,
      campusLocationAccuracyM: params.accuracyM,
      campusLocationUpdatedAt: nowIso,
      innerGeofenceMeters: site.radius_m,
      outerGeofenceMeters: site.outer_radius_m,
      dwellTimeMinutes: site.dwell_min
    });
    const org = this.orgs.get(orgId);
    if (org) {
      if (params.churchName.trim()) {
        org.name = params.churchName.trim();
      }
      org.geofenceConfigured = true;
      org.geofenceRadiusMeters = site.outer_radius_m;
      org.sitesCount = updatedSites.filter((s) => s.active).length;
    }
    return { site, premiseSettings, sites: updatedSites };
  }
  async clearPremiseSettings(organizationId) {
    this.assertDatabaseAvailable();
    const orgId = organizationId.toLowerCase();
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    if (this.supabase) {
      const { error: siteDelErr } = await this.supabase.from("sites").delete().eq("organization_id", orgId);
      if (siteDelErr) {
        throw new Error(`Failed to clear campus site in Supabase: ${siteDelErr.message}`);
      }
      const { data: orgRow } = await this.supabase.from("organizations").select("settings").eq("id", orgId).maybeSingle();
      if (orgRow) {
        const nextJson = {
          ...orgRow.settings && typeof orgRow.settings === "object" ? orgRow.settings : {},
          campus_location_accuracy_m: null,
          campus_location_updated_at: null
        };
        await this.supabase.from("organizations").update({ settings: nextJson, updated_at: nowIso }).eq("id", orgId);
      }
      return null;
    }
    this.sitesByOrg.set(orgId, []);
    const existing = this.premiseByOrg.get(orgId);
    const cleared = existing ? { ...existing, lat: null, lng: null, accuracyM: null, updatedAt: null } : null;
    if (cleared) this.premiseByOrg.set(orgId, cleared);
    const existingMemSettings = this.systemSettingsByOrg.get(orgId);
    if (existingMemSettings) {
      this.systemSettingsByOrg.set(orgId, {
        ...existingMemSettings,
        campusLatitude: null,
        campusLongitude: null,
        campusLocationAccuracyM: null,
        campusLocationUpdatedAt: null
      });
    }
    const org = this.orgs.get(orgId);
    if (org) {
      org.geofenceConfigured = false;
      org.sitesCount = 0;
    }
    return cleared;
  }
  isMissingGroupCategoriesTableError(error) {
    if (!error) return false;
    const code = String(error.code || "").toUpperCase();
    const msg = String(error.message || "");
    return code === "PGRST205" || code === "42P01" || /church_group_categories/i.test(msg) && (/schema cache/i.test(msg) || /does not exist/i.test(msg) || /could not find the table/i.test(msg));
  }
  async readCustomGroupCategoriesFromTable(sb, orgId) {
    const { data, error } = await sb.from("church_group_categories").select("slug, label, plural_label, description, color, created_at").eq("organization_id", orgId).order("created_at", { ascending: true });
    if (error) {
      if (this.isMissingGroupCategoriesTableError(error)) {
        return null;
      }
      console.warn("[Ekklesphere] Could not read church_group_categories:", error.message);
      return null;
    }
    return sanitizeCustomGroupCategories(
      (data || []).map((row) => ({
        id: row.slug,
        label: row.label,
        pluralLabel: row.plural_label,
        description: row.description,
        color: row.color,
        isBuiltIn: false,
        createdAt: row.created_at
      }))
    );
  }
  async syncCustomGroupCategoriesToTable(sb, orgId, categories) {
    const sanitized = sanitizeCustomGroupCategories(categories);
    const desiredSlugs = sanitized.map((c) => c.id);
    const { data: existingRows, error: listErr } = await sb.from("church_group_categories").select("slug").eq("organization_id", orgId);
    if (listErr) {
      if (!this.isMissingGroupCategoriesTableError(listErr)) {
        console.warn("[Ekklesphere] Could not sync church_group_categories:", listErr.message);
      }
      return;
    }
    const removedSlugs = (existingRows || []).map((r) => String(r.slug || "")).filter((slug) => slug && !desiredSlugs.includes(slug));
    if (removedSlugs.length > 0) {
      const { error: delErr } = await sb.from("church_group_categories").delete().eq("organization_id", orgId).in("slug", removedSlugs);
      if (delErr && !this.isMissingGroupCategoriesTableError(delErr)) {
        console.warn("[Ekklesphere] Could not prune church_group_categories:", delErr.message);
      }
    }
    if (sanitized.length > 0) {
      const rowsToUpsert = sanitized.map((cat) => ({
        organization_id: orgId,
        slug: cat.id,
        label: cat.label,
        plural_label: cat.pluralLabel,
        description: cat.description || "",
        color: cat.color || "violet"
      }));
      const { error: upsertErr } = await sb.from("church_group_categories").upsert(rowsToUpsert, { onConflict: "organization_id,slug" });
      if (upsertErr && !this.isMissingGroupCategoriesTableError(upsertErr)) {
        console.warn("[Ekklesphere] Could not upsert church_group_categories:", upsertErr.message);
      }
    }
  }
  async getSystemSettings(organizationId) {
    this.assertDatabaseAvailable();
    const orgId = organizationId.toLowerCase();
    const sites = await this.getSitesForOrg(orgId);
    const activeSite = sites.find((s) => s.active) || sites[0] || null;
    const sb = this.activeSupabase;
    if (sb) {
      const { data: orgRow } = await sb.from("organizations").select("*").eq("id", orgId).maybeSingle();
      const tableCategories = await this.readCustomGroupCategoriesFromTable(sb, orgId);
      if (orgRow) {
        const raw = orgRow.settings && typeof orgRow.settings === "object" ? orgRow.settings : {};
        const settings2 = {
          churchName: String(orgRow.name && String(orgRow.name).trim() || raw.church_name || ""),
          churchLogoUrl: String(orgRow.logo_url ?? raw.church_logo_url ?? "").trim(),
          campusName: String(activeSite?.name ?? raw.campus_name ?? orgRow.name ?? ""),
          campusAddress: String(activeSite?.address ?? orgRow.premise_address ?? raw.campus_address ?? ""),
          campusLatitude: activeSite ? activeSite.lat : null,
          campusLongitude: activeSite ? activeSite.lng : null,
          campusLocationAccuracyM: typeof raw.campus_location_accuracy_m === "number" ? raw.campus_location_accuracy_m : null,
          campusLocationUpdatedAt: activeSite?.updated_at || (typeof raw.campus_location_updated_at === "string" ? raw.campus_location_updated_at : null),
          seniorPastor: String(orgRow.senior_pastor ?? raw.senior_pastor ?? ""),
          contactEmail: String(orgRow.contact_email ?? orgRow.email ?? raw.contact_email ?? ""),
          contactPhone: String(orgRow.contact_phone ?? orgRow.phone ?? raw.contact_phone ?? ""),
          timezone: String(orgRow.timezone ?? raw.timezone ?? DEFAULT_ORG_SYSTEM_SETTINGS.timezone),
          currency: String(raw.currency ?? DEFAULT_ORG_SYSTEM_SETTINGS.currency),
          outerGeofenceMeters: Number(
            activeSite?.outer_radius_m ?? orgRow.outer_geofence_m ?? raw.outer_geofence_m ?? DEFAULT_ORG_SYSTEM_SETTINGS.outerGeofenceMeters
          ),
          innerGeofenceMeters: Number(
            activeSite?.radius_m ?? orgRow.inner_geofence_m ?? raw.inner_geofence_m ?? DEFAULT_ORG_SYSTEM_SETTINGS.innerGeofenceMeters
          ),
          dwellTimeMinutes: Number(
            activeSite?.dwell_min ?? orgRow.dwell_time_min ?? raw.dwell_time_min ?? DEFAULT_ORG_SYSTEM_SETTINGS.dwellTimeMinutes
          ),
          serviceWindowBeforeMinutes: Number(
            raw.service_window_before_minutes ?? DEFAULT_ORG_SYSTEM_SETTINGS.serviceWindowBeforeMinutes
          ),
          serviceWindowAfterMinutes: Number(
            raw.service_window_after_minutes ?? DEFAULT_ORG_SYSTEM_SETTINGS.serviceWindowAfterMinutes
          ),
          bleBeaconRssiThreshold: Number(
            raw.ble_beacon_rssi_threshold ?? DEFAULT_ORG_SYSTEM_SETTINGS.bleBeaconRssiThreshold
          ),
          driveByProtection: typeof raw.drive_by_protection === "boolean" ? raw.drive_by_protection : DEFAULT_ORG_SYSTEM_SETTINGS.driveByProtection,
          absenteeThresholdServices: Number(
            raw.absentee_threshold_services ?? DEFAULT_ORG_SYSTEM_SETTINGS.absenteeThresholdServices
          ),
          firstTimerFollowupHours: Number(
            raw.first_timer_followup_hours ?? DEFAULT_ORG_SYSTEM_SETTINGS.firstTimerFollowupHours
          ),
          autoAssignCellLeaders: typeof raw.auto_assign_cell_leaders === "boolean" ? raw.auto_assign_cell_leaders : DEFAULT_ORG_SYSTEM_SETTINGS.autoAssignCellLeaders,
          autoMessageAbsentMembers: typeof raw.auto_message_absent_members === "boolean" ? raw.auto_message_absent_members : DEFAULT_ORG_SYSTEM_SETTINGS.autoMessageAbsentMembers,
          absentMemberMessageChannel: raw.absent_member_message_channel === "sms" || raw.absent_member_message_channel === "email" || raw.absent_member_message_channel === "sms_and_email" ? raw.absent_member_message_channel : DEFAULT_ORG_SYSTEM_SETTINGS.absentMemberMessageChannel,
          absentMemberMessageTemplate: typeof raw.absent_member_message_template === "string" && raw.absent_member_message_template.trim() ? raw.absent_member_message_template : DEFAULT_ORG_SYSTEM_SETTINGS.absentMemberMessageTemplate,
          autoSendLeaderCareReminders: typeof raw.auto_send_leader_care_reminders === "boolean" ? raw.auto_send_leader_care_reminders : DEFAULT_ORG_SYSTEM_SETTINGS.autoSendLeaderCareReminders,
          requireExplicitConsent: typeof raw.require_explicit_consent === "boolean" ? raw.require_explicit_consent : DEFAULT_ORG_SYSTEM_SETTINGS.requireExplicitConsent,
          auditLogRetentionDays: Number(
            raw.audit_log_retention_days ?? DEFAULT_ORG_SYSTEM_SETTINGS.auditLogRetentionDays
          ),
          sessionTimeoutMinutes: normalizeIdleTimeoutMinutes(
            raw.session_timeout_minutes ?? orgRow.session_timeout_minutes ?? DEFAULT_ORG_SYSTEM_SETTINGS.sessionTimeoutMinutes
          ),
          smsGatewayProvider: String(
            raw.sms_gateway_provider ?? DEFAULT_ORG_SYSTEM_SETTINGS.smsGatewayProvider
          ),
          smsSenderId: String(raw.sms_sender_id ?? DEFAULT_ORG_SYSTEM_SETTINGS.smsSenderId),
          emailGatewayProvider: String(
            raw.email_gateway_provider ?? DEFAULT_ORG_SYSTEM_SETTINGS.emailGatewayProvider
          ),
          emailFromAddress: String(
            raw.email_from_address ?? DEFAULT_ORG_SYSTEM_SETTINGS.emailFromAddress ?? ""
          ),
          emailSenderName: String(
            raw.email_sender_name ?? DEFAULT_ORG_SYSTEM_SETTINGS.emailSenderName ?? ""
          ),
          enablePushNotifications: typeof raw.enable_push_notifications === "boolean" ? raw.enable_push_notifications : typeof orgRow.push_configured === "boolean" ? orgRow.push_configured : DEFAULT_ORG_SYSTEM_SETTINGS.enablePushNotifications,
          customGroupCategories: sanitizeCustomGroupCategories([
            ...tableCategories || [],
            ...Array.isArray(raw.custom_group_categories) ? raw.custom_group_categories : Array.isArray(raw.customGroupCategories) ? raw.customGroupCategories : []
          ])
        };
        return {
          settings: settings2,
          configured: Boolean(activeSite && Number.isFinite(activeSite.lat) && Number.isFinite(activeSite.lng)),
          site: activeSite,
          storageBackend: this.storageBackend
        };
      }
    }
    const org = this.orgs.get(orgId);
    const memPremise = this.premiseByOrg.get(orgId);
    const memSettings = this.systemSettingsByOrg.get(orgId);
    const settings = {
      ...DEFAULT_ORG_SYSTEM_SETTINGS,
      ...org ? {
        churchName: org.name,
        churchLogoUrl: org.logoUrl || "",
        campusName: org.city ? `${org.city} Main Campus` : org.name,
        seniorPastor: org.seniorPastor || "",
        contactEmail: org.contactEmail || "",
        contactPhone: org.contactPhone || "",
        outerGeofenceMeters: org.geofenceRadiusMeters || DEFAULT_ORG_SYSTEM_SETTINGS.outerGeofenceMeters
      } : {},
      ...memPremise ? {
        churchName: memPremise.churchName || org?.name || "",
        campusName: memPremise.campusName || "",
        campusAddress: memPremise.campusAddress || "",
        campusLatitude: memPremise.lat,
        campusLongitude: memPremise.lng,
        campusLocationAccuracyM: memPremise.accuracyM,
        campusLocationUpdatedAt: memPremise.updatedAt,
        innerGeofenceMeters: memPremise.innerGeofenceMeters,
        outerGeofenceMeters: memPremise.outerGeofenceMeters,
        dwellTimeMinutes: memPremise.dwellTimeMinutes
      } : {},
      ...memSettings || {},
      customGroupCategories: sanitizeCustomGroupCategories(memSettings?.customGroupCategories)
    };
    if (activeSite && Number.isFinite(activeSite.lat) && Number.isFinite(activeSite.lng)) {
      settings.campusLatitude = activeSite.lat;
      settings.campusLongitude = activeSite.lng;
      settings.campusName = activeSite.name || settings.campusName;
      settings.campusAddress = activeSite.address ?? settings.campusAddress;
      settings.innerGeofenceMeters = activeSite.radius_m || settings.innerGeofenceMeters;
      settings.outerGeofenceMeters = activeSite.outer_radius_m || settings.outerGeofenceMeters;
      settings.dwellTimeMinutes = activeSite.dwell_min || settings.dwellTimeMinutes;
      settings.campusLocationUpdatedAt = activeSite.updated_at || settings.campusLocationUpdatedAt;
    }
    return {
      settings,
      configured: Boolean(
        typeof settings.campusLatitude === "number" && typeof settings.campusLongitude === "number" && Number.isFinite(settings.campusLatitude) && Number.isFinite(settings.campusLongitude)
      ),
      site: activeSite,
      storageBackend: this.storageBackend
    };
  }
  async saveSystemSettings(organizationId, patch, actor) {
    const orgId = organizationId.toLowerCase();
    const currentRes = await this.getSystemSettings(orgId);
    const current = currentRes.settings;
    const innerGeofenceMeters = Math.max(
      10,
      Math.min(5e3, Math.round(Number(patch.innerGeofenceMeters ?? current.innerGeofenceMeters) || 100))
    );
    const outerGeofenceMeters = Math.max(
      innerGeofenceMeters,
      Math.min(1e4, Math.round(Number(patch.outerGeofenceMeters ?? current.outerGeofenceMeters) || 300))
    );
    const dwellTimeMinutes = Math.max(
      1,
      Math.min(120, Math.round(Number(patch.dwellTimeMinutes ?? current.dwellTimeMinutes) || 5))
    );
    const serviceWindowBeforeMinutes = Math.max(
      15,
      Math.min(90, Math.round(Number(patch.serviceWindowBeforeMinutes ?? current.serviceWindowBeforeMinutes) || 45))
    );
    const serviceWindowAfterMinutes = Math.max(
      15,
      Math.min(60, Math.round(Number(patch.serviceWindowAfterMinutes ?? current.serviceWindowAfterMinutes) || 30))
    );
    const bleBeaconRssiThreshold = Math.max(
      -95,
      Math.min(-40, Math.round(Number(patch.bleBeaconRssiThreshold ?? current.bleBeaconRssiThreshold) || -70))
    );
    const absenteeThresholdServices = Math.max(
      1,
      Math.min(10, Math.round(Number(patch.absenteeThresholdServices ?? current.absenteeThresholdServices) || 2))
    );
    const firstTimerFollowupHours = Math.max(
      1,
      Math.min(168, Math.round(Number(patch.firstTimerFollowupHours ?? current.firstTimerFollowupHours) || 24))
    );
    const auditLogRetentionDays = Math.max(
      7,
      Math.min(3650, Math.round(Number(patch.auditLogRetentionDays ?? current.auditLogRetentionDays) || 90))
    );
    const sessionTimeoutMinutes = normalizeIdleTimeoutMinutes(
      patch.sessionTimeoutMinutes !== void 0 ? patch.sessionTimeoutMinutes : current.sessionTimeoutMinutes
    );
    const smsSenderId = String(patch.smsSenderId ?? current.smsSenderId ?? "EKKLESPHERE").trim().toUpperCase().slice(0, 11);
    const merged = {
      ...current,
      ...patch,
      churchName: String(patch.churchName ?? current.churchName ?? "").trim(),
      churchLogoUrl: String(patch.churchLogoUrl ?? current.churchLogoUrl ?? "").trim(),
      campusName: String(patch.campusName ?? current.campusName ?? "").trim(),
      campusAddress: String(patch.campusAddress ?? current.campusAddress ?? "").trim(),
      seniorPastor: String(patch.seniorPastor ?? current.seniorPastor ?? "").trim(),
      contactEmail: String(patch.contactEmail ?? current.contactEmail ?? "").trim(),
      contactPhone: String(patch.contactPhone ?? current.contactPhone ?? "").trim(),
      timezone: String(patch.timezone ?? current.timezone ?? DEFAULT_ORG_SYSTEM_SETTINGS.timezone).trim(),
      currency: String(patch.currency ?? current.currency ?? DEFAULT_ORG_SYSTEM_SETTINGS.currency).trim(),
      innerGeofenceMeters,
      outerGeofenceMeters,
      dwellTimeMinutes,
      serviceWindowBeforeMinutes,
      serviceWindowAfterMinutes,
      bleBeaconRssiThreshold,
      absenteeThresholdServices,
      firstTimerFollowupHours,
      auditLogRetentionDays,
      sessionTimeoutMinutes,
      smsGatewayProvider: String(
        patch.smsGatewayProvider ?? current.smsGatewayProvider ?? DEFAULT_ORG_SYSTEM_SETTINGS.smsGatewayProvider
      ).trim(),
      smsSenderId,
      emailGatewayProvider: String(
        patch.emailGatewayProvider ?? current.emailGatewayProvider ?? DEFAULT_ORG_SYSTEM_SETTINGS.emailGatewayProvider
      ).trim(),
      emailFromAddress: String(patch.emailFromAddress ?? current.emailFromAddress ?? "").trim(),
      emailSenderName: String(patch.emailSenderName ?? current.emailSenderName ?? "").trim(),
      driveByProtection: Boolean(patch.driveByProtection ?? current.driveByProtection),
      autoAssignCellLeaders: Boolean(patch.autoAssignCellLeaders ?? current.autoAssignCellLeaders),
      autoMessageAbsentMembers: Boolean(
        patch.autoMessageAbsentMembers ?? current.autoMessageAbsentMembers ?? DEFAULT_ORG_SYSTEM_SETTINGS.autoMessageAbsentMembers
      ),
      absentMemberMessageChannel: patch.absentMemberMessageChannel === "sms" || patch.absentMemberMessageChannel === "email" || patch.absentMemberMessageChannel === "sms_and_email" ? patch.absentMemberMessageChannel : current.absentMemberMessageChannel || DEFAULT_ORG_SYSTEM_SETTINGS.absentMemberMessageChannel,
      absentMemberMessageTemplate: String(
        patch.absentMemberMessageTemplate ?? current.absentMemberMessageTemplate ?? DEFAULT_ABSENT_MEMBER_MESSAGE_TEMPLATE
      ).trim() || DEFAULT_ABSENT_MEMBER_MESSAGE_TEMPLATE,
      autoSendLeaderCareReminders: Boolean(
        patch.autoSendLeaderCareReminders ?? current.autoSendLeaderCareReminders ?? DEFAULT_ORG_SYSTEM_SETTINGS.autoSendLeaderCareReminders
      ),
      requireExplicitConsent: Boolean(patch.requireExplicitConsent ?? current.requireExplicitConsent),
      enablePushNotifications: Boolean(patch.enablePushNotifications ?? current.enablePushNotifications),
      customGroupCategories: patch.customGroupCategories !== void 0 ? sanitizeCustomGroupCategories(patch.customGroupCategories) : sanitizeCustomGroupCategories(current.customGroupCategories)
    };
    const hasExplicitCoords = typeof merged.campusLatitude === "number" && typeof merged.campusLongitude === "number" && Number.isFinite(merged.campusLatitude) && Number.isFinite(merged.campusLongitude);
    if (hasExplicitCoords) {
      await this.savePremiseSettings(orgId, {
        siteId: currentRes.site?.id,
        churchName: merged.churchName || "",
        campusName: merged.campusName || "Main Campus",
        campusAddress: merged.campusAddress,
        lat: merged.campusLatitude,
        lng: merged.campusLongitude,
        accuracyM: merged.campusLocationAccuracyM ?? null,
        innerGeofenceMeters: merged.innerGeofenceMeters,
        outerGeofenceMeters: merged.outerGeofenceMeters,
        dwellTimeMinutes: merged.dwellTimeMinutes,
        updatedBy: actor?.name || actor?.email || "Administrator"
      });
    } else if (patch.campusLatitude === null && patch.campusLongitude === null) {
      await this.clearPremiseSettings(orgId);
    }
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    const sb = this.activeSupabase;
    if (sb) {
      const { data: existingOrg, error: orgReadError } = await sb.from("organizations").select("id, name, settings").eq("id", orgId).maybeSingle();
      if (orgReadError) {
        throw new Error(`Failed to read organization settings in Supabase: ${orgReadError.message}`);
      }
      if (!existingOrg) {
        throw new Error(`Organization record "${orgId}" not found in Supabase.`);
      }
      const existingJson = existingOrg?.settings && typeof existingOrg.settings === "object" ? existingOrg.settings : {};
      const nextSettingsJson = {
        ...existingJson,
        church_name: merged.churchName || existingOrg?.name || "",
        church_logo_url: merged.churchLogoUrl || "",
        campus_name: merged.campusName,
        campus_address: merged.campusAddress,
        campus_location_accuracy_m: merged.campusLocationAccuracyM ?? null,
        campus_location_updated_at: merged.campusLocationUpdatedAt ?? null,
        senior_pastor: merged.seniorPastor,
        contact_email: merged.contactEmail,
        contact_phone: merged.contactPhone,
        timezone: merged.timezone,
        currency: merged.currency,
        inner_geofence_m: merged.innerGeofenceMeters,
        outer_geofence_m: merged.outerGeofenceMeters,
        dwell_time_min: merged.dwellTimeMinutes,
        service_window_before_minutes: merged.serviceWindowBeforeMinutes,
        service_window_after_minutes: merged.serviceWindowAfterMinutes,
        ble_beacon_rssi_threshold: merged.bleBeaconRssiThreshold,
        drive_by_protection: merged.driveByProtection,
        absentee_threshold_services: merged.absenteeThresholdServices,
        first_timer_followup_hours: merged.firstTimerFollowupHours,
        auto_assign_cell_leaders: merged.autoAssignCellLeaders,
        auto_message_absent_members: merged.autoMessageAbsentMembers,
        absent_member_message_channel: merged.absentMemberMessageChannel,
        absent_member_message_template: merged.absentMemberMessageTemplate,
        auto_send_leader_care_reminders: merged.autoSendLeaderCareReminders,
        require_explicit_consent: merged.requireExplicitConsent,
        audit_log_retention_days: merged.auditLogRetentionDays,
        session_timeout_minutes: merged.sessionTimeoutMinutes,
        sms_gateway_provider: merged.smsGatewayProvider,
        sms_sender_id: merged.smsSenderId,
        sms_configured: Boolean(merged.smsGatewayProvider && merged.smsSenderId),
        email_gateway_provider: merged.emailGatewayProvider || "Resend Email",
        email_from_address: merged.emailFromAddress || "",
        email_sender_name: merged.emailSenderName || "",
        enable_push_notifications: merged.enablePushNotifications,
        push_configured: merged.enablePushNotifications,
        custom_group_categories: merged.customGroupCategories || []
      };
      const orgUpdate = {
        ...merged.churchName ? { name: merged.churchName } : {},
        ...patch.churchLogoUrl !== void 0 ? { logo_url: merged.churchLogoUrl || null } : {},
        senior_pastor: merged.seniorPastor || null,
        contact_email: merged.contactEmail || null,
        email: merged.contactEmail || null,
        contact_phone: merged.contactPhone || null,
        phone: merged.contactPhone || null,
        timezone: merged.timezone,
        premise_address: merged.campusAddress || null,
        inner_geofence_m: merged.innerGeofenceMeters,
        outer_geofence_m: merged.outerGeofenceMeters,
        dwell_time_min: merged.dwellTimeMinutes,
        session_timeout_minutes: merged.sessionTimeoutMinutes,
        sms_configured: Boolean(merged.smsGatewayProvider && merged.smsSenderId),
        push_configured: merged.enablePushNotifications,
        settings: nextSettingsJson,
        updated_at: nowIso
      };
      let { error } = await sb.from("organizations").update(orgUpdate).eq("id", orgId);
      for (let attempt = 0; attempt < 4 && error; attempt++) {
        const msg = error.message || "";
        const colMatch = msg.match(/Could not find the '([^']+)' column/i) || msg.match(/column "([^"]+)"(?: of relation "[^"]+")? does not exist/i);
        if (colMatch && colMatch[1] && Object.prototype.hasOwnProperty.call(orgUpdate, colMatch[1])) {
          delete orgUpdate[colMatch[1]];
          const retry = await sb.from("organizations").update(orgUpdate).eq("id", orgId);
          error = retry.error;
          continue;
        }
        break;
      }
      if (error) {
        throw new Error(`Failed to save system settings in Supabase: ${error.message}`);
      }
      if (patch.customGroupCategories !== void 0) {
        await this.syncCustomGroupCategoriesToTable(sb, orgId, merged.customGroupCategories || []);
      }
    } else {
      this.systemSettingsByOrg.set(orgId, merged);
      const existingPremise = this.premiseByOrg.get(orgId);
      if (existingPremise) {
        this.premiseByOrg.set(orgId, {
          ...existingPremise,
          churchName: merged.churchName || existingPremise.churchName,
          campusName: merged.campusName || existingPremise.campusName,
          campusAddress: merged.campusAddress,
          innerGeofenceMeters: merged.innerGeofenceMeters,
          outerGeofenceMeters: merged.outerGeofenceMeters,
          dwellTimeMinutes: merged.dwellTimeMinutes,
          updatedAt: nowIso
        });
      }
      const memOrg = this.orgs.get(orgId);
      if (memOrg) {
        if (merged.churchName) memOrg.name = merged.churchName;
        if (patch.churchLogoUrl !== void 0) memOrg.logoUrl = merged.churchLogoUrl || void 0;
        memOrg.seniorPastor = merged.seniorPastor;
        memOrg.contactEmail = merged.contactEmail;
        memOrg.contactPhone = merged.contactPhone;
        memOrg.geofenceRadiusMeters = merged.outerGeofenceMeters;
        memOrg.smsConfigured = Boolean(merged.smsGatewayProvider && merged.smsSenderId);
        memOrg.pushConfigured = merged.enablePushNotifications;
      }
    }
    await this.appendAuditLog({
      organizationId: orgId,
      actorId: actor?.id || null,
      actorEmail: actor?.email || "admin@ekklesphere.church",
      actorRole: actor?.role || "admin",
      action: "system_settings.updated",
      targetType: "organization_settings",
      targetId: orgId,
      metadata: {
        campusName: merged.campusName,
        innerGeofenceMeters: merged.innerGeofenceMeters,
        outerGeofenceMeters: merged.outerGeofenceMeters,
        dwellTimeMinutes: merged.dwellTimeMinutes,
        smsGatewayProvider: merged.smsGatewayProvider,
        requireExplicitConsent: merged.requireExplicitConsent,
        auditLogRetentionDays: merged.auditLogRetentionDays
      },
      ipAddress: actor?.ipAddress || null
    });
    return this.getSystemSettings(orgId);
  }
  async resetSystemSettings(organizationId, actor) {
    const orgId = organizationId.toLowerCase();
    await this.clearPremiseSettings(orgId);
    const org = await this.getOrganisationById(orgId);
    const resetValues = {
      ...DEFAULT_ORG_SYSTEM_SETTINGS,
      churchName: org?.name || ""
    };
    const sb = this.activeSupabase;
    if (sb) {
      const nowIso = (/* @__PURE__ */ new Date()).toISOString();
      const { data: existingOrg } = await sb.from("organizations").select("name, settings").eq("id", orgId).maybeSingle();
      const existingJson = existingOrg?.settings && typeof existingOrg.settings === "object" ? existingOrg.settings : {};
      const resetSettingsJson = {
        ...existingJson,
        campus_name: "",
        campus_address: "",
        campus_location_accuracy_m: null,
        campus_location_updated_at: null,
        senior_pastor: "",
        contact_email: "",
        contact_phone: "",
        timezone: DEFAULT_ORG_SYSTEM_SETTINGS.timezone,
        currency: DEFAULT_ORG_SYSTEM_SETTINGS.currency,
        inner_geofence_m: DEFAULT_ORG_SYSTEM_SETTINGS.innerGeofenceMeters,
        outer_geofence_m: DEFAULT_ORG_SYSTEM_SETTINGS.outerGeofenceMeters,
        dwell_time_min: DEFAULT_ORG_SYSTEM_SETTINGS.dwellTimeMinutes,
        service_window_before_minutes: DEFAULT_ORG_SYSTEM_SETTINGS.serviceWindowBeforeMinutes,
        service_window_after_minutes: DEFAULT_ORG_SYSTEM_SETTINGS.serviceWindowAfterMinutes,
        ble_beacon_rssi_threshold: DEFAULT_ORG_SYSTEM_SETTINGS.bleBeaconRssiThreshold,
        drive_by_protection: DEFAULT_ORG_SYSTEM_SETTINGS.driveByProtection,
        absentee_threshold_services: DEFAULT_ORG_SYSTEM_SETTINGS.absenteeThresholdServices,
        first_timer_followup_hours: DEFAULT_ORG_SYSTEM_SETTINGS.firstTimerFollowupHours,
        auto_assign_cell_leaders: DEFAULT_ORG_SYSTEM_SETTINGS.autoAssignCellLeaders,
        require_explicit_consent: DEFAULT_ORG_SYSTEM_SETTINGS.requireExplicitConsent,
        audit_log_retention_days: DEFAULT_ORG_SYSTEM_SETTINGS.auditLogRetentionDays,
        session_timeout_minutes: DEFAULT_IDLE_SESSION_TIMEOUT_MINUTES,
        sms_gateway_provider: DEFAULT_ORG_SYSTEM_SETTINGS.smsGatewayProvider,
        sms_sender_id: DEFAULT_ORG_SYSTEM_SETTINGS.smsSenderId,
        enable_push_notifications: DEFAULT_ORG_SYSTEM_SETTINGS.enablePushNotifications,
        custom_group_categories: []
      };
      const orgResetPatch = {
        senior_pastor: null,
        contact_email: null,
        contact_phone: null,
        timezone: DEFAULT_ORG_SYSTEM_SETTINGS.timezone,
        premise_address: null,
        inner_geofence_m: DEFAULT_ORG_SYSTEM_SETTINGS.innerGeofenceMeters,
        outer_geofence_m: DEFAULT_ORG_SYSTEM_SETTINGS.outerGeofenceMeters,
        dwell_time_min: DEFAULT_ORG_SYSTEM_SETTINGS.dwellTimeMinutes,
        sms_configured: true,
        push_configured: true,
        settings: resetSettingsJson,
        updated_at: nowIso
      };
      let { error } = await sb.from("organizations").update(orgResetPatch).eq("id", orgId);
      for (let attempt = 0; attempt < 3 && error; attempt++) {
        const msg = error.message || "";
        const colMatch = msg.match(/Could not find the '([^']+)' column/i) || msg.match(/column "([^"]+)"(?: of relation "[^"]+")? does not exist/i);
        if (colMatch && colMatch[1] && Object.prototype.hasOwnProperty.call(orgResetPatch, colMatch[1])) {
          delete orgResetPatch[colMatch[1]];
          const retry = await sb.from("organizations").update(orgResetPatch).eq("id", orgId);
          error = retry.error;
          continue;
        }
        break;
      }
      await this.syncCustomGroupCategoriesToTable(sb, orgId, []);
    } else {
      this.systemSettingsByOrg.set(orgId, resetValues);
      this.premiseByOrg.delete(orgId);
    }
    await this.appendAuditLog({
      organizationId: orgId,
      actorId: actor?.id || null,
      actorEmail: actor?.email || "admin@ekklesphere.church",
      actorRole: actor?.role || "admin",
      action: "system_settings.reset",
      targetType: "organization_settings",
      targetId: orgId,
      metadata: {
        resetAt: (/* @__PURE__ */ new Date()).toISOString()
      },
      ipAddress: actor?.ipAddress || null
    });
    return this.getSystemSettings(orgId);
  }
  isMissingTenantGatewaySecretsTableError(err) {
    if (!err) return false;
    const msg = `${err.code || ""} ${err.message || ""}`;
    return /tenant_gateway_secrets/i.test(msg) && /does not exist|schema cache|42P01|PGRST205/i.test(msg);
  }
  async readEncryptedGatewayRow(organizationId) {
    const orgId = (organizationId || "").trim().toLowerCase();
    if (!orgId) return {};
    const sb = this.activeSupabase;
    if (sb) {
      if (!UUID_REGEX2.test(orgId)) return {};
      const { data, error } = await sb.from("tenant_gateway_secrets").select("*").eq("organization_id", orgId).maybeSingle();
      if (!error && data) {
        return {
          arkeselApiKeyEnc: data.arkesel_api_key_enc || null,
          arkeselApiKeyMasked: data.arkesel_api_key_masked || null,
          paystackPublicKey: data.paystack_public_key || null,
          paystackSecretKeyEnc: data.paystack_secret_key_enc || null,
          paystackSecretKeyMasked: data.paystack_secret_key_masked || null,
          updatedBy: data.updated_by || null,
          updatedAt: data.updated_at ? String(data.updated_at) : null
        };
      }
      if (error && !this.isMissingTenantGatewaySecretsTableError(error)) {
        throw new Error(`Failed to read tenant gateway keys: ${error.message}`);
      }
      const { data: orgRow } = await sb.from("organizations").select("settings").eq("id", orgId).maybeSingle();
      const rawSettings = orgRow?.settings && typeof orgRow.settings === "object" ? orgRow.settings : {};
      const embedded = rawSettings._encrypted_gateway_secrets;
      if (embedded && typeof embedded === "object") {
        return {
          arkeselApiKeyEnc: embedded.arkesel_api_key_enc || null,
          arkeselApiKeyMasked: embedded.arkesel_api_key_masked || null,
          paystackPublicKey: embedded.paystack_public_key || null,
          paystackSecretKeyEnc: embedded.paystack_secret_key_enc || null,
          paystackSecretKeyMasked: embedded.paystack_secret_key_masked || null,
          updatedBy: embedded.updated_by || null,
          updatedAt: embedded.updated_at ? String(embedded.updated_at) : null
        };
      }
      return {};
    }
    return this.gatewaySecretsByOrg.get(orgId) || {};
  }
  async getTenantGatewayConfigSummary(organizationId) {
    this.assertDatabaseAvailable();
    const orgId = (organizationId || "").trim().toLowerCase();
    const row = orgId ? await this.readEncryptedGatewayRow(orgId) : {};
    const tenantArkesel = unsealTenantSecret(row.arkeselApiKeyEnc);
    const envArkesel = (process.env.ARKESEL_API_KEY || "").trim();
    const arkeselSource = tenantArkesel ? "tenant" : envArkesel ? "platform_env" : "none";
    const tenantPaystackSecret = unsealTenantSecret(row.paystackSecretKeyEnc);
    const tenantPaystackPublic = String(row.paystackPublicKey || "").trim();
    const envPaystackSecret = (process.env.PAYSTACK_SECRET_KEY || "").trim();
    const envPaystackPublic = (process.env.PAYSTACK_PUBLIC_KEY || "").trim();
    const paystackSource = tenantPaystackSecret ? "tenant" : envPaystackSecret ? "platform_env" : "none";
    const effectivePublicKey = tenantPaystackPublic || envPaystackPublic || "";
    const effectiveSecret = tenantPaystackSecret || envPaystackSecret || "";
    return {
      arkeselConfigured: arkeselSource !== "none",
      arkeselSource,
      arkeselKeyMasked: tenantArkesel ? row.arkeselApiKeyMasked || maskSecretTail(tenantArkesel) : envArkesel ? maskSecretTail(envArkesel) : null,
      paystackConfigured: paystackSource !== "none",
      paystackSource,
      paystackPublicKey: effectivePublicKey,
      paystackSecretMasked: tenantPaystackSecret ? row.paystackSecretKeyMasked || maskSecretTail(tenantPaystackSecret) : envPaystackSecret ? maskSecretTail(envPaystackSecret) : null,
      paystackMode: detectPaystackMode(effectivePublicKey, effectiveSecret),
      updatedAt: row.updatedAt || null
    };
  }
  async getResolvedArkeselApiKey(organizationId) {
    this.assertDatabaseAvailable();
    const orgId = (organizationId || "").trim().toLowerCase();
    if (orgId) {
      const row = await this.readEncryptedGatewayRow(orgId);
      const tenantKey = unsealTenantSecret(row.arkeselApiKeyEnc);
      if (tenantKey) {
        return { apiKey: tenantKey, source: "tenant" };
      }
    }
    const envKey = (process.env.ARKESEL_API_KEY || "").trim();
    if (envKey) {
      return { apiKey: envKey, source: "platform_env" };
    }
    return { apiKey: "", source: "none" };
  }
  async getResolvedPaystackKeys(organizationId) {
    this.assertDatabaseAvailable();
    const orgId = (organizationId || "").trim().toLowerCase();
    if (orgId) {
      const row = await this.readEncryptedGatewayRow(orgId);
      const tenantSecret = unsealTenantSecret(row.paystackSecretKeyEnc);
      const tenantPublic = String(row.paystackPublicKey || "").trim();
      if (tenantSecret) {
        return {
          publicKey: tenantPublic,
          secretKey: tenantSecret,
          source: "tenant"
        };
      }
    }
    const envSecret = (process.env.PAYSTACK_SECRET_KEY || "").trim();
    const envPublic = (process.env.PAYSTACK_PUBLIC_KEY || "").trim();
    if (envSecret) {
      return {
        publicKey: envPublic,
        secretKey: envSecret,
        source: "platform_env"
      };
    }
    return { publicKey: "", secretKey: "", source: "none" };
  }
  async saveTenantGatewayKeys(organizationId, patch, actor) {
    this.assertDatabaseAvailable();
    const orgId = (organizationId || "").trim().toLowerCase();
    if (!orgId) {
      throw new Error("Organization ID is required to save gateway API keys.");
    }
    const existing = await this.readEncryptedGatewayRow(orgId);
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    let nextArkeselEnc = existing.arkeselApiKeyEnc || null;
    let nextArkeselMasked = existing.arkeselApiKeyMasked || null;
    if (patch.clearArkeselApiKey) {
      nextArkeselEnc = null;
      nextArkeselMasked = null;
    } else if (typeof patch.arkeselApiKey === "string" && patch.arkeselApiKey.trim()) {
      const clean = patch.arkeselApiKey.trim();
      nextArkeselEnc = sealTenantSecret(clean);
      nextArkeselMasked = maskSecretTail(clean);
    }
    let nextPaystackPublic = existing.paystackPublicKey || null;
    let nextPaystackSecretEnc = existing.paystackSecretKeyEnc || null;
    let nextPaystackSecretMasked = existing.paystackSecretKeyMasked || null;
    if (patch.clearPaystackKeys) {
      nextPaystackPublic = null;
      nextPaystackSecretEnc = null;
      nextPaystackSecretMasked = null;
    } else {
      if (typeof patch.paystackPublicKey === "string") {
        const cleanPub = patch.paystackPublicKey.trim();
        nextPaystackPublic = cleanPub || null;
      }
      if (typeof patch.paystackSecretKey === "string" && patch.paystackSecretKey.trim()) {
        const cleanSec = patch.paystackSecretKey.trim();
        nextPaystackSecretEnc = sealTenantSecret(cleanSec);
        nextPaystackSecretMasked = maskSecretTail(cleanSec);
      }
    }
    const updatedBy = actor?.email || actor?.name || "Administrator";
    const sb = this.activeSupabase;
    if (sb) {
      if (!UUID_REGEX2.test(orgId)) {
        throw new Error("Valid organization UUID is required.");
      }
      const { error } = await sb.from("tenant_gateway_secrets").upsert(
        {
          organization_id: orgId,
          arkesel_api_key_enc: nextArkeselEnc,
          arkesel_api_key_masked: nextArkeselMasked,
          paystack_public_key: nextPaystackPublic,
          paystack_secret_key_enc: nextPaystackSecretEnc,
          paystack_secret_key_masked: nextPaystackSecretMasked,
          updated_by: updatedBy,
          updated_at: nowIso
        },
        { onConflict: "organization_id" }
      );
      if (error) {
        if (!this.isMissingTenantGatewaySecretsTableError(error)) {
          throw new Error(`Failed to persist tenant gateway keys in Supabase: ${error.message}`);
        }
        const { data: orgRow } = await sb.from("organizations").select("settings").eq("id", orgId).maybeSingle();
        const rawSettings = orgRow?.settings && typeof orgRow.settings === "object" ? orgRow.settings : {};
        const nextSettings = {
          ...rawSettings,
          _encrypted_gateway_secrets: {
            arkesel_api_key_enc: nextArkeselEnc,
            arkesel_api_key_masked: nextArkeselMasked,
            paystack_public_key: nextPaystackPublic,
            paystack_secret_key_enc: nextPaystackSecretEnc,
            paystack_secret_key_masked: nextPaystackSecretMasked,
            updated_by: updatedBy,
            updated_at: nowIso
          }
        };
        const { error: orgErr } = await sb.from("organizations").update({ settings: nextSettings, sms_configured: Boolean(nextArkeselEnc), updated_at: nowIso }).eq("id", orgId);
        if (orgErr) {
          throw new Error(`Failed to save gateway keys on organization: ${orgErr.message}`);
        }
      } else {
        await sb.from("organizations").update({ sms_configured: Boolean(nextArkeselEnc), updated_at: nowIso }).eq("id", orgId);
      }
    } else {
      this.gatewaySecretsByOrg.set(orgId, {
        arkeselApiKeyEnc: nextArkeselEnc,
        arkeselApiKeyMasked: nextArkeselMasked,
        paystackPublicKey: nextPaystackPublic,
        paystackSecretKeyEnc: nextPaystackSecretEnc,
        paystackSecretKeyMasked: nextPaystackSecretMasked,
        updatedBy,
        updatedAt: nowIso
      });
      const memOrg = this.orgs.get(orgId);
      if (memOrg) {
        memOrg.smsConfigured = Boolean(nextArkeselEnc);
      }
    }
    await this.appendAuditLog({
      organizationId: orgId,
      actorId: actor?.id || null,
      actorEmail: actor?.email || "admin@ekklesphere.church",
      actorRole: actor?.role || "admin",
      action: "gateways.keys_updated",
      targetType: "tenant_gateway_secrets",
      targetId: orgId,
      metadata: {
        arkeselUpdated: Boolean(patch.arkeselApiKey || patch.clearArkeselApiKey),
        arkeselCleared: Boolean(patch.clearArkeselApiKey),
        paystackUpdated: Boolean(
          patch.paystackPublicKey !== void 0 || patch.paystackSecretKey || patch.clearPaystackKeys
        ),
        paystackCleared: Boolean(patch.clearPaystackKeys)
      },
      ipAddress: actor?.ipAddress || null
    });
    return this.getTenantGatewayConfigSummary(orgId);
  }
  mapSupabaseChurchGroupRow(row) {
    return {
      id: String(row.id),
      name: String(row.name),
      category: row.category || "cell_group",
      leaderName: String(row.leader_name || ""),
      leaderMemberId: row.leader_member_id ? String(row.leader_member_id) : void 0,
      leaderPhone: row.leader_phone || void 0,
      leaderEmail: row.leader_email || void 0,
      assistantLeader: row.assistant_leader || void 0,
      assistantLeaderMemberId: row.assistant_leader_member_id ? String(row.assistant_leader_member_id) : void 0,
      meetingDay: row.meeting_day || void 0,
      meetingTime: row.meeting_time || void 0,
      meetingLocation: row.meeting_location || void 0,
      targetDemographic: row.target_demographic || void 0,
      description: String(row.description || ""),
      active: Boolean(row.active ?? true),
      createdAt: String(row.created_at || (/* @__PURE__ */ new Date()).toISOString()).slice(0, 10),
      updatedAt: row.updated_at ? String(row.updated_at).slice(0, 10) : void 0
    };
  }
  mapSupabaseLeadershipHistoryRow(row) {
    return {
      id: String(row.id),
      organizationId: row.organization_id ? String(row.organization_id) : void 0,
      groupId: String(row.group_id),
      groupName: String(row.group_name),
      category: row.category || "cell_group",
      role: row.role || "primary_leader",
      action: row.action || "changed",
      previousLeaderName: row.previous_leader_name ?? null,
      previousLeaderMemberId: row.previous_leader_member_id ?? null,
      newLeaderName: row.new_leader_name ?? null,
      newLeaderMemberId: row.new_leader_member_id ?? null,
      changedById: row.changed_by_id ?? null,
      changedByName: row.changed_by_name ?? null,
      changedByEmail: row.changed_by_email ?? null,
      changedByRole: row.changed_by_role ?? null,
      reason: row.reason ?? null,
      createdAt: String(row.created_at || (/* @__PURE__ */ new Date()).toISOString())
    };
  }
  mapAuditLogRowToLeadershipHistoryEntry(row) {
    const meta = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
    const groupId = meta.groupId ?? row.target_id;
    const groupName = meta.groupName;
    if (!groupId || !groupName) return null;
    return {
      id: String(row.id || (0, import_crypto4.randomUUID)()),
      organizationId: row.organization_id ? String(row.organization_id) : void 0,
      groupId: String(groupId),
      groupName: String(groupName),
      category: meta.category || "cell_group",
      role: meta.role || "primary_leader",
      action: meta.action || "changed",
      previousLeaderName: meta.previousLeaderName ?? null,
      previousLeaderMemberId: meta.previousLeaderMemberId ?? null,
      newLeaderName: meta.newLeaderName ?? null,
      newLeaderMemberId: meta.newLeaderMemberId ?? null,
      changedById: meta.changedById ?? row.actor_id ?? null,
      changedByName: meta.changedByName ?? row.actor_email ?? null,
      changedByEmail: meta.changedByEmail ?? row.actor_email ?? null,
      changedByRole: meta.changedByRole ?? row.actor_role ?? null,
      reason: meta.reason ?? row.reason ?? null,
      createdAt: String(meta.createdAt || row.created_at || (/* @__PURE__ */ new Date()).toISOString())
    };
  }
  isMissingChurchGroupColumnError(err) {
    if (!err) return false;
    const msg = String(err.message || "");
    const code = String(err.code || "");
    return code === "PGRST204" || code === "42703" || /column .* does not exist|Could not find the '[^']+' column|schema cache/i.test(msg);
  }
  isMissingLeadershipHistoryTableError(err) {
    if (!err) return false;
    const msg = String(err.message || "");
    const code = String(err.code || "");
    return code === "PGRST205" || code === "42P01" || /relation "?(?:public\.)?church_group_leadership_history"? does not exist|Could not find the table '?(?:public\.)?church_group_leadership_history'?|does not exist|schema cache/i.test(
      msg
    );
  }
  normalizeLeaderNameForCompare(value) {
    return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
  }
  isDifferentLeader(prevName, prevMemberId, nextName, nextMemberId) {
    const cleanPrevName = this.normalizeLeaderNameForCompare(prevName);
    const cleanNextName = this.normalizeLeaderNameForCompare(nextName);
    if (!cleanPrevName && !cleanNextName) return false;
    if (Boolean(cleanPrevName) !== Boolean(cleanNextName)) return true;
    const cleanPrevId = (prevMemberId || "").trim();
    const cleanNextId = (nextMemberId || "").trim();
    if (cleanPrevId && cleanNextId) {
      return cleanPrevId !== cleanNextId;
    }
    return cleanPrevName !== cleanNextName;
  }
  async resolveOrganizationLeaderMember(organizationId, opts) {
    this.assertDatabaseAvailable();
    const orgId = organizationId.toLowerCase();
    const field = opts.fieldLabel || "leader";
    const rawId = String(opts.memberId || "").trim();
    const rawName = String(opts.leaderName || "").trim().replace(/\s+/g, " ");
    const members = await this.getMembers(orgId);
    const buildResult = (m) => ({
      id: String(m.id),
      fullName: `${String(m.firstName || "").trim()} ${String(m.lastName || "").trim()}`.trim(),
      phoneE164: m.phoneE164 ? String(m.phoneE164) : void 0,
      email: m.email ? String(m.email) : void 0
    });
    if (rawId) {
      const byId = members.find(
        (m) => String(m.id) === rawId || m.memberId && String(m.memberId) === rawId
      );
      if (byId) {
        const res = buildResult(byId);
        const preferred = String(byId.preferredName || "").trim().replace(/\s+/g, " ").toLowerCase();
        if (!rawName || res.fullName.toLowerCase() === rawName.toLowerCase() || preferred && preferred === rawName.toLowerCase() || String(byId.id).toLowerCase() === rawName.toLowerCase() || byId.memberId && String(byId.memberId).toLowerCase() === rawName.toLowerCase()) {
          return res;
        }
      }
    }
    if (!rawName) {
      const err2 = new Error(
        field === "assistantLeader" ? "Assistant leader must match an enrolled member or be left blank." : "Primary leader must be selected from the enrolled members list."
      );
      err2.status = 400;
      err2.code = "INVALID_LEADER_MEMBER";
      err2.field = field;
      throw err2;
    }
    if (members.length === 0) {
      const err2 = new Error(
        "Cannot assign a group leader because no members are enrolled in this organisation yet."
      );
      err2.status = 400;
      err2.code = "INVALID_LEADER_MEMBER";
      err2.field = field;
      throw err2;
    }
    const targetLower = rawName.toLowerCase();
    const exactFullMatches = members.filter((m) => {
      const fullName = `${String(m.firstName || "").trim()} ${String(m.lastName || "").trim()}`.trim().replace(/\s+/g, " ").toLowerCase();
      return fullName === targetLower;
    });
    if (exactFullMatches.length === 1) {
      return buildResult(exactFullMatches[0]);
    }
    if (exactFullMatches.length > 1) {
      const err2 = new Error(
        `Multiple members match "${rawName}". Please select the specific member from the directory list.`
      );
      err2.status = 400;
      err2.code = "AMBIGUOUS_LEADER_MEMBER";
      err2.field = field;
      throw err2;
    }
    const secondaryMatches = members.filter((m) => {
      const preferred = String(m.preferredName || "").trim().replace(/\s+/g, " ").toLowerCase();
      const memberCode = String(m.memberId || "").trim().toLowerCase();
      const email = String(m.email || "").trim().toLowerCase();
      return preferred && preferred === targetLower || memberCode && memberCode === targetLower || email && email === targetLower;
    });
    if (secondaryMatches.length === 1) {
      return buildResult(secondaryMatches[0]);
    }
    const err = new Error(
      `"${rawName}" was not found in the organisation's enrolled members directory.`
    );
    err.status = 400;
    err.code = "INVALID_LEADER_MEMBER";
    err.field = field;
    throw err;
  }
  async appendChurchGroupLeadershipHistory(organizationId, entries) {
    if (entries.length === 0) return;
    const orgId = organizationId.toLowerCase();
    const baseMs = Date.now();
    const sb = this.activeSupabase;
    const normalizedEntries = entries.map((e, index) => ({
      id: (0, import_crypto4.randomUUID)(),
      organizationId: orgId,
      groupId: String(e.groupId),
      groupName: String(e.groupName),
      category: e.category,
      role: e.role,
      action: e.action,
      previousLeaderName: e.previousLeaderName ?? null,
      previousLeaderMemberId: e.previousLeaderMemberId ?? null,
      newLeaderName: e.newLeaderName ?? null,
      newLeaderMemberId: e.newLeaderMemberId ?? null,
      changedById: e.changedById ?? null,
      changedByName: e.changedByName ?? null,
      changedByEmail: e.changedByEmail ?? null,
      changedByRole: e.changedByRole ?? null,
      reason: e.reason ?? null,
      createdAt: new Date(baseMs + index).toISOString()
    }));
    if (sb) {
      const dbRows = normalizedEntries.map((e) => ({
        organization_id: orgId,
        group_id: e.groupId,
        group_name: e.groupName,
        category: e.category,
        role: e.role,
        action: e.action,
        previous_leader_name: e.previousLeaderName ?? null,
        previous_leader_member_id: e.previousLeaderMemberId ?? null,
        new_leader_name: e.newLeaderName ?? null,
        new_leader_member_id: e.newLeaderMemberId ?? null,
        changed_by_id: e.changedById ?? null,
        changed_by_name: e.changedByName ?? null,
        changed_by_email: e.changedByEmail ?? null,
        changed_by_role: e.changedByRole ?? null,
        reason: e.reason ?? null,
        created_at: e.createdAt
      }));
      const { error } = await sb.from("church_group_leadership_history").insert(dbRows);
      if (error) {
        const isCategoryConstraintError = String(error.code || "") === "23514" && /category/i.test(String(error.message || ""));
        if (this.isMissingLeadershipHistoryTableError(error) || isCategoryConstraintError) {
          console.warn(
            "[Ekklesphere] church_group_leadership_history unable to accept entry directly; persisting transition to audit_log fallback:",
            error.message
          );
          for (const entry of normalizedEntries) {
            await this.appendAuditLog({
              organizationId: orgId,
              actorId: entry.changedById ?? null,
              actorEmail: entry.changedByEmail || "system@ekklesphere.local",
              actorRole: entry.changedByRole || "admin",
              action: "church_group.leadership_transition",
              targetType: "church_group",
              targetId: entry.groupId,
              reason: entry.reason ?? null,
              metadata: {
                groupId: entry.groupId,
                groupName: entry.groupName,
                category: entry.category,
                role: entry.role,
                action: entry.action,
                previousLeaderName: entry.previousLeaderName ?? null,
                previousLeaderMemberId: entry.previousLeaderMemberId ?? null,
                newLeaderName: entry.newLeaderName ?? null,
                newLeaderMemberId: entry.newLeaderMemberId ?? null,
                changedById: entry.changedById ?? null,
                changedByName: entry.changedByName ?? null,
                changedByEmail: entry.changedByEmail ?? null,
                changedByRole: entry.changedByRole ?? null,
                reason: entry.reason ?? null,
                createdAt: entry.createdAt
              }
            });
          }
          const existing2 = this.churchGroupLeadershipHistoryByOrg.get(orgId) || [];
          this.churchGroupLeadershipHistoryByOrg.set(orgId, [
            ...[...normalizedEntries].reverse(),
            ...existing2
          ]);
          return;
        }
        throw new Error(`Failed to record leadership history in Supabase: ${error.message}`);
      }
      return;
    }
    const existing = this.churchGroupLeadershipHistoryByOrg.get(orgId) || [];
    this.churchGroupLeadershipHistoryByOrg.set(orgId, [
      ...[...normalizedEntries].reverse(),
      ...existing
    ]);
  }
  async listChurchGroupLeadershipHistory(organizationId, options) {
    this.assertDatabaseAvailable();
    const orgId = organizationId.toLowerCase();
    const limit = Math.min(Math.max(options?.limit ?? 200, 1), 500);
    const category = options?.category && options.category !== "all" ? options.category : void 0;
    const groupId = options?.groupId?.trim() || void 0;
    const role = options?.role && options.role !== "all" ? options.role : void 0;
    const sb = this.activeSupabase;
    const filterAndSort = (items) => items.filter((entry) => {
      if (category && entry.category !== category) return false;
      if (groupId && entry.groupId !== groupId) return false;
      if (role && entry.role !== role) return false;
      return true;
    }).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, limit);
    if (sb) {
      let query = sb.from("church_group_leadership_history").select("*").eq("organization_id", orgId);
      if (category) query = query.eq("category", category);
      if (groupId) query = query.eq("group_id", groupId);
      if (role) query = query.eq("role", role);
      const { data, error } = await query.order("created_at", { ascending: false }).limit(limit);
      if (error) {
        if (this.isMissingLeadershipHistoryTableError(error)) {
          const fallbackEntries = [];
          const { data: auditRows, error: auditErr } = await sb.from("audit_log").select("*").eq("organization_id", orgId).eq("action", "church_group.leadership_transition").order("created_at", { ascending: false }).limit(Math.min(limit * 3, 500));
          if (!auditErr && Array.isArray(auditRows)) {
            for (const row of auditRows) {
              const mapped = this.mapAuditLogRowToLeadershipHistoryEntry(row);
              if (mapped) fallbackEntries.push(mapped);
            }
          }
          const inMem = this.churchGroupLeadershipHistoryByOrg.get(orgId) || [];
          const seen = new Set(fallbackEntries.map((e) => e.id));
          for (const item of inMem) {
            if (!seen.has(item.id)) {
              fallbackEntries.push(item);
            }
          }
          return filterAndSort(fallbackEntries);
        }
        throw new Error(`Failed to fetch leadership change history: ${error.message}`);
      }
      return (data || []).map((row) => this.mapSupabaseLeadershipHistoryRow(row));
    }
    const list = this.churchGroupLeadershipHistoryByOrg.get(orgId) || [];
    return filterAndSort(list);
  }
  async listChurchGroups(organizationId) {
    this.assertDatabaseAvailable();
    const orgId = organizationId.toLowerCase();
    const sb = this.activeSupabase;
    if (sb) {
      const { data, error } = await sb.from("church_groups").select("*").eq("organization_id", orgId).order("created_at", { ascending: false });
      if (error) {
        throw new Error(`Failed to fetch church groups: ${error.message}`);
      }
      return (data || []).map((row) => this.mapSupabaseChurchGroupRow(row));
    }
    return [...this.churchGroupsByOrg.get(orgId) || []];
  }
  async createChurchGroup(organizationId, payload, actor) {
    this.assertDatabaseAvailable();
    const orgId = organizationId.toLowerCase();
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    let created = null;
    const sb = this.activeSupabase;
    const leaderMemberUuid = payload.leaderMemberId && UUID_REGEX2.test(payload.leaderMemberId) ? payload.leaderMemberId : null;
    const assistantMemberUuid = payload.assistantLeaderMemberId && UUID_REGEX2.test(payload.assistantLeaderMemberId) ? payload.assistantLeaderMemberId : null;
    const normalizedCategory = normalizeIncomingGroupCategory(payload.category) || "cell_group";
    if (sb) {
      const baseInsertPayload = {
        organization_id: orgId,
        name: payload.name.trim(),
        category: normalizedCategory,
        leader_name: payload.leaderName.trim(),
        leader_phone: payload.leaderPhone?.trim() || null,
        leader_email: payload.leaderEmail?.trim() || null,
        assistant_leader: payload.assistantLeader?.trim() || null,
        meeting_day: payload.meetingDay?.trim() || null,
        meeting_time: payload.meetingTime?.trim() || null,
        meeting_location: payload.meetingLocation?.trim() || null,
        target_demographic: payload.targetDemographic?.trim() || null,
        description: (payload.description || "").trim(),
        active: payload.active ?? true
      };
      const extendedInsertPayload = {
        ...baseInsertPayload,
        leader_member_id: leaderMemberUuid,
        assistant_leader_member_id: assistantMemberUuid
      };
      let { data, error } = await sb.from("church_groups").insert(extendedInsertPayload).select("*").single();
      if (error && this.isMissingChurchGroupColumnError(error)) {
        console.warn(
          "[Ekklesphere] church_groups member-link columns not yet in Supabase schema cache; retrying insert without leader_member_id / assistant_leader_member_id:",
          error.message
        );
        const retry = await sb.from("church_groups").insert(baseInsertPayload).select("*").single();
        data = retry.data;
        error = retry.error;
      }
      if (error || !data) {
        if (error && String(error.code || "") === "23514" && /category/i.test(String(error.message || ""))) {
          const schemaErr = new Error(
            "Your live Supabase database needs migration 20261128000000_custom_group_categories.sql applied to store custom group categories."
          );
          schemaErr.status = 400;
          schemaErr.field = "category";
          throw schemaErr;
        }
        throw new Error(`Failed to create church group in Supabase: ${error?.message || "Unknown error"}`);
      }
      created = this.mapSupabaseChurchGroupRow(data);
      if (!created.leaderMemberId && payload.leaderMemberId?.trim()) {
        created.leaderMemberId = payload.leaderMemberId.trim();
      }
      if (!created.assistantLeaderMemberId && payload.assistantLeaderMemberId?.trim()) {
        created.assistantLeaderMemberId = payload.assistantLeaderMemberId.trim();
      }
    } else {
      created = {
        id: (0, import_crypto4.randomUUID)(),
        name: payload.name.trim(),
        category: normalizedCategory,
        leaderName: payload.leaderName.trim(),
        leaderMemberId: payload.leaderMemberId?.trim() || void 0,
        leaderPhone: payload.leaderPhone?.trim() || void 0,
        leaderEmail: payload.leaderEmail?.trim() || void 0,
        assistantLeader: payload.assistantLeader?.trim() || void 0,
        assistantLeaderMemberId: payload.assistantLeaderMemberId?.trim() || void 0,
        meetingDay: payload.meetingDay?.trim() || void 0,
        meetingTime: payload.meetingTime?.trim() || void 0,
        meetingLocation: payload.meetingLocation?.trim() || void 0,
        targetDemographic: payload.targetDemographic?.trim() || void 0,
        description: (payload.description || "").trim(),
        active: payload.active ?? true,
        createdAt: nowIso.slice(0, 10),
        updatedAt: nowIso.slice(0, 10)
      };
      const list = this.churchGroupsByOrg.get(orgId) || [];
      list.unshift(created);
      this.churchGroupsByOrg.set(orgId, list);
    }
    const historyEntries = [];
    if (created.leaderName.trim()) {
      historyEntries.push({
        groupId: created.id,
        groupName: created.name,
        category: created.category,
        role: "primary_leader",
        action: "assigned",
        previousLeaderName: null,
        previousLeaderMemberId: null,
        newLeaderName: created.leaderName,
        newLeaderMemberId: created.leaderMemberId || null,
        changedById: actor?.id || null,
        changedByName: actor?.name || actor?.email || "Administrator",
        changedByEmail: actor?.email || null,
        changedByRole: actor?.role || "admin",
        reason: "Initial group leadership appointment"
      });
    }
    if (created.assistantLeader && created.assistantLeader.trim()) {
      historyEntries.push({
        groupId: created.id,
        groupName: created.name,
        category: created.category,
        role: "assistant_leader",
        action: "assigned",
        previousLeaderName: null,
        previousLeaderMemberId: null,
        newLeaderName: created.assistantLeader,
        newLeaderMemberId: created.assistantLeaderMemberId || null,
        changedById: actor?.id || null,
        changedByName: actor?.name || actor?.email || "Administrator",
        changedByEmail: actor?.email || null,
        changedByRole: actor?.role || "admin",
        reason: "Initial assistant leader appointment"
      });
    }
    await this.appendChurchGroupLeadershipHistory(orgId, historyEntries);
    await this.appendAuditLog({
      organizationId: orgId,
      actorId: actor?.id || null,
      actorEmail: actor?.email || "system@ekklesphere.local",
      actorRole: actor?.role || "admin",
      action: "church_group.created",
      targetType: "church_group",
      targetId: created.id,
      metadata: {
        name: created.name,
        category: created.category,
        leaderName: created.leaderName,
        leaderMemberId: created.leaderMemberId || null,
        assistantLeader: created.assistantLeader || null
      },
      ipAddress: actor?.ipAddress || null
    });
    return created;
  }
  async updateChurchGroup(organizationId, groupId, updates, actor) {
    this.assertDatabaseAvailable();
    const orgId = organizationId.toLowerCase();
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    let existingGroup = null;
    let updated = null;
    const sb = this.activeSupabase;
    if (sb) {
      if (!UUID_REGEX2.test(groupId)) {
        const notFound = new Error("Church group not found.");
        notFound.status = 404;
        throw notFound;
      }
      const { data: existingRow, error: existingErr } = await sb.from("church_groups").select("*").eq("organization_id", orgId).eq("id", groupId).maybeSingle();
      if (existingErr) {
        throw new Error(`Failed to fetch existing church group: ${existingErr.message}`);
      }
      if (!existingRow) {
        const notFound = new Error("Church group not found.");
        notFound.status = 404;
        throw notFound;
      }
      existingGroup = this.mapSupabaseChurchGroupRow(existingRow);
      const dbPatch = { updated_at: nowIso };
      if (updates.name !== void 0) dbPatch.name = updates.name.trim();
      if (updates.category !== void 0) {
        dbPatch.category = normalizeIncomingGroupCategory(updates.category) || updates.category;
      }
      if (updates.leaderName !== void 0) dbPatch.leader_name = updates.leaderName.trim();
      if (updates.leaderMemberId !== void 0) {
        dbPatch.leader_member_id = updates.leaderMemberId && UUID_REGEX2.test(updates.leaderMemberId) ? updates.leaderMemberId : null;
      }
      if (updates.leaderPhone !== void 0) dbPatch.leader_phone = updates.leaderPhone?.trim() || null;
      if (updates.leaderEmail !== void 0) dbPatch.leader_email = updates.leaderEmail?.trim() || null;
      if (updates.assistantLeader !== void 0) dbPatch.assistant_leader = updates.assistantLeader?.trim() || null;
      if (updates.assistantLeaderMemberId !== void 0) {
        dbPatch.assistant_leader_member_id = updates.assistantLeaderMemberId && UUID_REGEX2.test(updates.assistantLeaderMemberId) ? updates.assistantLeaderMemberId : null;
      }
      if (updates.meetingDay !== void 0) dbPatch.meeting_day = updates.meetingDay?.trim() || null;
      if (updates.meetingTime !== void 0) dbPatch.meeting_time = updates.meetingTime?.trim() || null;
      if (updates.meetingLocation !== void 0) dbPatch.meeting_location = updates.meetingLocation?.trim() || null;
      if (updates.targetDemographic !== void 0) dbPatch.target_demographic = updates.targetDemographic?.trim() || null;
      if (updates.description !== void 0) dbPatch.description = updates.description.trim();
      if (updates.active !== void 0) dbPatch.active = Boolean(updates.active);
      let { data, error } = await sb.from("church_groups").update(dbPatch).eq("organization_id", orgId).eq("id", groupId).select("*").maybeSingle();
      if (error && this.isMissingChurchGroupColumnError(error) && ("leader_member_id" in dbPatch || "assistant_leader_member_id" in dbPatch)) {
        console.warn(
          "[Ekklesphere] church_groups member-link columns not yet in Supabase schema cache; retrying update without leader_member_id / assistant_leader_member_id:",
          error.message
        );
        const {
          leader_member_id: _dropLeaderMemberId,
          assistant_leader_member_id: _dropAssistantMemberId,
          ...legacyPatch
        } = dbPatch;
        const retry = await sb.from("church_groups").update(legacyPatch).eq("organization_id", orgId).eq("id", groupId).select("*").maybeSingle();
        data = retry.data;
        error = retry.error;
      }
      if (error) {
        if (String(error.code || "") === "23514" && /category/i.test(String(error.message || ""))) {
          const schemaErr = new Error(
            "Your live Supabase database needs migration 20261128000000_custom_group_categories.sql applied to store custom group categories."
          );
          schemaErr.status = 400;
          schemaErr.field = "category";
          throw schemaErr;
        }
        throw new Error(`Failed to update church group in Supabase: ${error.message}`);
      }
      if (!data) {
        const notFound = new Error("Church group not found.");
        notFound.status = 404;
        throw notFound;
      }
      updated = this.mapSupabaseChurchGroupRow(data);
      if (updates.leaderMemberId !== void 0 && !updated.leaderMemberId && updates.leaderMemberId?.trim()) {
        updated.leaderMemberId = updates.leaderMemberId.trim();
      }
      if (updates.assistantLeaderMemberId !== void 0 && !updated.assistantLeaderMemberId && updates.assistantLeaderMemberId?.trim() && updated.assistantLeader) {
        updated.assistantLeaderMemberId = updates.assistantLeaderMemberId.trim();
      }
    } else {
      const list = this.churchGroupsByOrg.get(orgId) || [];
      const idx = list.findIndex((g) => g.id === groupId);
      if (idx < 0) {
        const notFound = new Error("Church group not found.");
        notFound.status = 404;
        throw notFound;
      }
      existingGroup = { ...list[idx] };
      const { leadershipChangeReason: _ignoredReason, ...restUpdates } = updates;
      if (restUpdates.category !== void 0) {
        restUpdates.category = normalizeIncomingGroupCategory(restUpdates.category) || restUpdates.category;
      }
      updated = {
        ...list[idx],
        ...restUpdates,
        id: list[idx].id,
        updatedAt: nowIso.slice(0, 10)
      };
      if (updates.assistantLeader !== void 0 && !updates.assistantLeader?.trim()) {
        updated.assistantLeader = void 0;
        updated.assistantLeaderMemberId = void 0;
      }
      list[idx] = updated;
      this.churchGroupsByOrg.set(orgId, list);
    }
    const reasonText = updates.leadershipChangeReason?.trim() || null;
    const historyEntries = [];
    if (existingGroup && this.isDifferentLeader(
      existingGroup.leaderName,
      existingGroup.leaderMemberId,
      updated.leaderName,
      updated.leaderMemberId
    )) {
      const hasPrev = Boolean(this.normalizeLeaderNameForCompare(existingGroup.leaderName));
      const hasNext = Boolean(this.normalizeLeaderNameForCompare(updated.leaderName));
      historyEntries.push({
        groupId: updated.id,
        groupName: updated.name,
        category: updated.category,
        role: "primary_leader",
        action: !hasPrev && hasNext ? "assigned" : hasPrev && !hasNext ? "removed" : "changed",
        previousLeaderName: existingGroup.leaderName || null,
        previousLeaderMemberId: existingGroup.leaderMemberId || null,
        newLeaderName: updated.leaderName || null,
        newLeaderMemberId: updated.leaderMemberId || null,
        changedById: actor?.id || null,
        changedByName: actor?.name || actor?.email || "Administrator",
        changedByEmail: actor?.email || null,
        changedByRole: actor?.role || "admin",
        reason: reasonText
      });
    }
    if (existingGroup && this.isDifferentLeader(
      existingGroup.assistantLeader,
      existingGroup.assistantLeaderMemberId,
      updated.assistantLeader,
      updated.assistantLeaderMemberId
    )) {
      const hasPrev = Boolean(this.normalizeLeaderNameForCompare(existingGroup.assistantLeader));
      const hasNext = Boolean(this.normalizeLeaderNameForCompare(updated.assistantLeader));
      historyEntries.push({
        groupId: updated.id,
        groupName: updated.name,
        category: updated.category,
        role: "assistant_leader",
        action: !hasPrev && hasNext ? "assigned" : hasPrev && !hasNext ? "removed" : "changed",
        previousLeaderName: existingGroup.assistantLeader || null,
        previousLeaderMemberId: existingGroup.assistantLeaderMemberId || null,
        newLeaderName: updated.assistantLeader || null,
        newLeaderMemberId: updated.assistantLeaderMemberId || null,
        changedById: actor?.id || null,
        changedByName: actor?.name || actor?.email || "Administrator",
        changedByEmail: actor?.email || null,
        changedByRole: actor?.role || "admin",
        reason: reasonText
      });
    }
    await this.appendChurchGroupLeadershipHistory(orgId, historyEntries);
    await this.appendAuditLog({
      organizationId: orgId,
      actorId: actor?.id || null,
      actorEmail: actor?.email || "system@ekklesphere.local",
      actorRole: actor?.role || "admin",
      action: "church_group.updated",
      targetType: "church_group",
      targetId: updated.id,
      metadata: {
        name: updated.name,
        category: updated.category,
        active: updated.active,
        leadershipChanged: historyEntries.length > 0
      },
      ipAddress: actor?.ipAddress || null
    });
    return updated;
  }
  async deleteChurchGroup(organizationId, groupId, actor) {
    this.assertDatabaseAvailable();
    const orgId = organizationId.toLowerCase();
    let deletedGroup = null;
    const sb = this.activeSupabase;
    if (sb) {
      if (!UUID_REGEX2.test(groupId)) {
        const notFound = new Error("Church group not found.");
        notFound.status = 404;
        throw notFound;
      }
      const { data, error } = await sb.from("church_groups").delete().eq("organization_id", orgId).eq("id", groupId).select("*").maybeSingle();
      if (error) {
        throw new Error(`Failed to delete church group in Supabase: ${error.message}`);
      }
      if (!data) {
        const notFound = new Error("Church group not found.");
        notFound.status = 404;
        throw notFound;
      }
      deletedGroup = this.mapSupabaseChurchGroupRow(data);
    } else {
      const list = this.churchGroupsByOrg.get(orgId) || [];
      const target = list.find((g) => g.id === groupId);
      if (!target) {
        const notFound = new Error("Church group not found.");
        notFound.status = 404;
        throw notFound;
      }
      deletedGroup = { ...target };
      this.churchGroupsByOrg.set(
        orgId,
        list.filter((g) => g.id !== groupId)
      );
    }
    if (deletedGroup) {
      const historyEntries = [];
      if (deletedGroup.leaderName.trim()) {
        historyEntries.push({
          groupId: deletedGroup.id,
          groupName: deletedGroup.name,
          category: deletedGroup.category,
          role: "primary_leader",
          action: "group_deleted",
          previousLeaderName: deletedGroup.leaderName,
          previousLeaderMemberId: deletedGroup.leaderMemberId || null,
          newLeaderName: null,
          newLeaderMemberId: null,
          changedById: actor?.id || null,
          changedByName: actor?.name || actor?.email || "Administrator",
          changedByEmail: actor?.email || null,
          changedByRole: actor?.role || "admin",
          reason: "Group removed from congregation structure"
        });
      }
      if (deletedGroup.assistantLeader && deletedGroup.assistantLeader.trim()) {
        historyEntries.push({
          groupId: deletedGroup.id,
          groupName: deletedGroup.name,
          category: deletedGroup.category,
          role: "assistant_leader",
          action: "group_deleted",
          previousLeaderName: deletedGroup.assistantLeader,
          previousLeaderMemberId: deletedGroup.assistantLeaderMemberId || null,
          newLeaderName: null,
          newLeaderMemberId: null,
          changedById: actor?.id || null,
          changedByName: actor?.name || actor?.email || "Administrator",
          changedByEmail: actor?.email || null,
          changedByRole: actor?.role || "admin",
          reason: "Group removed from congregation structure"
        });
      }
      await this.appendChurchGroupLeadershipHistory(orgId, historyEntries);
    }
    await this.appendAuditLog({
      organizationId: orgId,
      actorId: actor?.id || null,
      actorEmail: actor?.email || "system@ekklesphere.local",
      actorRole: actor?.role || "admin",
      action: "church_group.deleted",
      targetType: "church_group",
      targetId: groupId,
      metadata: { name: deletedGroup?.name || groupId },
      ipAddress: actor?.ipAddress || null
    });
  }
  async getSitesForOrg(organizationId) {
    this.assertDatabaseAvailable();
    const orgId = organizationId.toLowerCase();
    if (this.supabase) {
      const { data, error } = await this.supabase.from("sites").select("*").eq("organization_id", orgId).eq("active", true).order("created_at", { ascending: true });
      if (error) {
        throw new Error(`Failed to fetch sites from Supabase: ${error.message}`);
      }
      return (data || []).filter((row) => typeof row.lat === "number" && typeof row.lng === "number").map((row) => ({
        id: String(row.id),
        organization_id: orgId,
        name: String(row.name || "Campus"),
        address: row.address || "",
        lat: Number(row.lat),
        lng: Number(row.lng),
        radius_m: Number(row.radius_m || 60),
        outer_radius_m: Number(row.outer_radius_m || 300),
        dwell_min: Number(row.dwell_min || 5),
        active: Boolean(row.active ?? true),
        updated_at: String(row.updated_at || row.created_at || (/* @__PURE__ */ new Date()).toISOString()),
        updated_by: row.updated_by || void 0
      }));
    }
    return this.sitesByOrg.get(orgId) || [];
  }
  async getLiveCheckins(organizationId, serviceId, maxRows = 500) {
    this.assertDatabaseAvailable();
    const orgId = organizationId.toLowerCase();
    const safeLimit = Math.min(5e3, Math.max(1, Number(maxRows) || 500));
    if (this.supabase) {
      let query = this.supabase.from("attendance").select("*").eq("organization_id", orgId).order("checked_in_at", { ascending: false }).limit(safeLimit);
      if (serviceId && UUID_REGEX2.test(serviceId)) {
        query = query.eq("event_id", serviceId);
      }
      const { data, error } = await query;
      if (error) {
        throw new Error(`Failed to load live check-ins from Supabase: ${error.message}`);
      }
      return (data || []).map((row) => {
        const checkedIso = String(row.checked_in_at || (/* @__PURE__ */ new Date()).toISOString());
        const dt = new Date(checkedIso);
        const rawMethod = String(row.method || "manual");
        const mappedMethod = rawMethod === "qr_scan" ? "posted_qr" : rawMethod === "web_link" ? "email_link" : ["usher", "posted_qr", "beacon", "geofence", "email_link", "manual"].includes(rawMethod) ? rawMethod : "manual";
        return {
          id: String(row.id),
          tenantId: orgId,
          organizationId: orgId,
          personId: String(row.member_id),
          serviceInstanceId: String(row.event_id),
          campusId: PRIMARY_CAMPUS_SITE_ID,
          method: mappedMethod,
          confidence: Number(row.confidence_score ?? 95),
          checkedInAt: !Number.isNaN(dt.getTime()) ? dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "08:00",
          checkedInIso: checkedIso,
          late: false,
          distanceM: typeof row.distance_m === "number" ? row.distance_m : null,
          note: row.notes || void 0
        };
      });
    }
    const list = this.checkinsByOrg.get(orgId) || [];
    return serviceId ? list.filter((c) => c.serviceInstanceId === serviceId) : [...list];
  }
  async recordLiveCheckin(organizationId, record, options) {
    this.assertDatabaseAvailable();
    const orgId = organizationId.toLowerCase();
    const fullRecord = {
      ...record,
      tenantId: orgId,
      organizationId: orgId
    };
    const rawServiceId = String(fullRecord.serviceInstanceId || "").trim();
    if (!rawServiceId || rawServiceId === "svc-live-main" || rawServiceId === "svc-sun-1") {
      const noSvcErr = new Error(
        "No service is scheduled. Please schedule a service before checking in members."
      );
      noSvcErr.status = 400;
      noSvcErr.code = "NO_SERVICE_SCHEDULED";
      throw noSvcErr;
    }
    if (this.supabase) {
      if (!UUID_REGEX2.test(rawServiceId)) {
        const noSvcErr = new Error(
          "No service is scheduled. Please schedule a service before checking in members."
        );
        noSvcErr.status = 400;
        noSvcErr.code = "NO_SERVICE_SCHEDULED";
        throw noSvcErr;
      }
      const { data: matchedEvent, error: eventLookupErr } = await this.supabase.from("events").select("id, name, status, start_time, end_time, dwell_min").eq("organization_id", orgId).eq("id", rawServiceId).maybeSingle();
      if (eventLookupErr) {
        throw new Error(`Failed to verify scheduled service in Supabase: ${eventLookupErr.message}`);
      }
      if (!matchedEvent?.id) {
        const noSvcErr = new Error(
          "Selected service is not scheduled. Please schedule an active service before checking in members."
        );
        noSvcErr.status = 404;
        noSvcErr.code = "NO_SERVICE_SCHEDULED";
        throw noSvcErr;
      }
      const evStatus = String(matchedEvent.status || "").trim().toLowerCase();
      if (evStatus === "closed" || evStatus === "completed" || evStatus === "cancelled") {
        const closedErr = new Error(
          `Check-in is closed for "${matchedEvent.name}". Reopen or schedule a live service within its active window first.`
        );
        closedErr.status = 400;
        closedErr.code = "SERVICE_NOT_OPEN";
        throw closedErr;
      }
      if (!options?.bypassWindowCheck) {
        const windowResult = resolveServiceWindow({
          startTimeIso: matchedEvent.start_time,
          endTimeIso: matchedEvent.end_time,
          allowanceMinutes: Number(matchedEvent.dwell_min ?? 0) || 0,
          rawStatus: evStatus || "active",
          nowMs: Date.now()
        });
        if (windowResult.status !== "live") {
          const closedErr = new Error(
            `Check-in is closed for "${matchedEvent.name}". Reopen or schedule a live service within its active window first.`
          );
          closedErr.status = 400;
          closedErr.code = "SERVICE_NOT_OPEN";
          throw closedErr;
        }
      }
      const resolvedEventId = String(matchedEvent.id);
      fullRecord.serviceInstanceId = resolvedEventId;
      if (!UUID_REGEX2.test(fullRecord.personId)) {
        const { data: matchedMember } = await this.supabase.from("members").select("id").eq("organization_id", orgId).or(`email.eq.${fullRecord.personId},phone.eq.${fullRecord.personId}`).limit(1).maybeSingle();
        if (matchedMember?.id) {
          fullRecord.personId = String(matchedMember.id);
        } else {
          const invalidErr = new Error("Selected member record does not have a valid database ID.");
          invalidErr.status = 400;
          invalidErr.code = "INVALID_MEMBER_ID";
          throw invalidErr;
        }
      }
      const mappedDbMethod = fullRecord.method === "posted_qr" ? "qr_scan" : fullRecord.method === "email_link" ? "web_link" : fullRecord.method;
      const attendancePayload = {
        organization_id: orgId,
        event_id: resolvedEventId,
        member_id: fullRecord.personId,
        checked_in_at: fullRecord.checkedInIso,
        method: mappedDbMethod,
        status: "accepted",
        confidence_score: Math.min(100, Math.max(0, Math.round(fullRecord.confidence))),
        distance_m: fullRecord.distanceM ?? null,
        notes: fullRecord.note || null
      };
      const { error } = await this.supabase.from("attendance").upsert(attendancePayload, { onConflict: "organization_id,event_id,member_id" });
      if (error) {
        throw new Error(`Failed to record live check-in in Supabase: ${error.message}`);
      }
      await this.resetMemberAbsenceStreakOnCheckin(orgId, fullRecord.personId).catch(() => {
      });
      return { record: fullRecord, liveCheckins: await this.getLiveCheckins(orgId) };
    }
    const orgEvents = this.eventsByOrg.get(orgId) || [];
    const matchedMemEvent = orgEvents.find((ev) => ev.id === rawServiceId);
    if (!matchedMemEvent) {
      const noSvcErr = new Error(
        "No service is scheduled. Please schedule a service before checking in members."
      );
      noSvcErr.status = 400;
      noSvcErr.code = "NO_SERVICE_SCHEDULED";
      throw noSvcErr;
    }
    const memEvStatus = String(matchedMemEvent.status || "").trim().toLowerCase();
    if (memEvStatus === "closed" || memEvStatus === "completed" || memEvStatus === "cancelled") {
      const closedErr = new Error(
        `Check-in is closed for "${matchedMemEvent.name}". Reopen or schedule a live service within its active window first.`
      );
      closedErr.status = 400;
      closedErr.code = "SERVICE_NOT_OPEN";
      throw closedErr;
    }
    if (!options?.bypassWindowCheck) {
      const memWindow = resolveServiceWindow({
        date: matchedMemEvent.date,
        startsAt: matchedMemEvent.starts_at,
        endsAt: matchedMemEvent.ends_at,
        startTimeIso: matchedMemEvent.start_time,
        endTimeIso: matchedMemEvent.end_time,
        allowanceMinutes: Number(matchedMemEvent.dwell_min ?? 0) || 0,
        rawStatus: memEvStatus || "active",
        nowMs: Date.now()
      });
      if (memWindow.status !== "live") {
        const closedErr = new Error(
          `Check-in is closed for "${matchedMemEvent.name}". Reopen or schedule a live service within its active window first.`
        );
        closedErr.status = 400;
        closedErr.code = "SERVICE_NOT_OPEN";
        throw closedErr;
      }
    }
    const list = this.checkinsByOrg.get(orgId) || [];
    const idx = list.findIndex(
      (r) => r.personId === fullRecord.personId && r.serviceInstanceId === fullRecord.serviceInstanceId
    );
    if (idx >= 0) {
      list[idx] = fullRecord;
    } else {
      list.unshift(fullRecord);
    }
    this.checkinsByOrg.set(orgId, list);
    const org = this.orgs.get(orgId);
    if (org) {
      org.lastActivityAt = fullRecord.checkedInIso;
    }
    await this.resetMemberAbsenceStreakOnCheckin(orgId, fullRecord.personId).catch(() => {
    });
    return { record: fullRecord, liveCheckins: await this.getLiveCheckins(orgId) };
  }
  async deleteLiveCheckin(organizationId, personId, serviceId) {
    this.assertDatabaseAvailable();
    const orgId = organizationId.toLowerCase();
    if (this.supabase) {
      if (personId !== "__all__" && !UUID_REGEX2.test(personId)) {
        return this.getLiveCheckins(orgId, serviceId);
      }
      let query = this.supabase.from("attendance").delete().eq("organization_id", orgId);
      if (personId !== "__all__") {
        query = query.eq("member_id", personId);
      }
      if (serviceId && UUID_REGEX2.test(serviceId)) {
        query = query.eq("event_id", serviceId);
      }
      const { error } = await query;
      if (error) {
        throw new Error(`Failed to delete check-in in Supabase: ${error.message}`);
      }
      return this.getLiveCheckins(orgId, serviceId);
    }
    const current = this.checkinsByOrg.get(orgId) || [];
    let filtered;
    if (personId === "__all__") {
      filtered = serviceId ? current.filter((r) => r.serviceInstanceId !== serviceId) : [];
    } else if (serviceId) {
      filtered = current.filter(
        (r) => !(r.personId === personId && r.serviceInstanceId === serviceId)
      );
    } else {
      filtered = current.filter((r) => r.personId !== personId);
    }
    this.checkinsByOrg.set(orgId, filtered);
    return filtered;
  }
  async recordRawGeofenceEvent(organizationId, event) {
    this.assertDatabaseAvailable();
    const orgId = organizationId.toLowerCase();
    const scoped = { ...event, organization_id: orgId };
    if (this.supabase) {
      if (UUID_REGEX2.test(scoped.site_id)) {
        const dbSource = scoped.source === "system_auto_close" ? "admin_edit" : scoped.source;
        const { error } = await this.supabase.from("attendance_events").upsert(
          {
            organization_id: orgId,
            client_event_id: UUID_REGEX2.test(scoped.client_event_id) ? scoped.client_event_id : toDeterministicUuid(scoped.client_event_id),
            user_id: toDeterministicUuid(scoped.user_id),
            person_id: scoped.person_id || null,
            person_name: scoped.person_name || null,
            service_instance_id: scoped.service_instance_id || null,
            site_id: scoped.site_id,
            type: scoped.type,
            source: dbSource,
            platform: scoped.platform,
            lat: scoped.lat,
            lng: scoped.lng,
            location: scoped.lat != null && scoped.lng != null ? `SRID=4326;POINT(${scoped.lng} ${scoped.lat})` : null,
            accuracy_m: scoped.accuracy_m,
            distance_m: scoped.distance_m,
            is_mock: scoped.is_mock,
            device_time: scoped.device_time,
            server_time: scoped.server_time,
            status: scoped.status,
            flag_reasons: scoped.flag_reasons
          },
          { onConflict: "user_id,client_event_id" }
        );
        if (error) {
          throw new Error(`Failed to persist geofence event in Supabase: ${error.message}`);
        }
      }
      return scoped;
    }
    const list = this.rawEventsByOrg.get(orgId) || [];
    list.unshift(scoped);
    this.rawEventsByOrg.set(orgId, list.slice(0, 500));
    const org = this.orgs.get(orgId);
    if (org) {
      org.lastActivityAt = scoped.server_time;
    }
    return scoped;
  }
  async getRawGeofenceEvents(organizationId) {
    this.assertDatabaseAvailable();
    const orgId = organizationId.toLowerCase();
    if (this.supabase) {
      const { data, error } = await this.supabase.from("attendance_events").select("*").eq("organization_id", orgId).order("server_time", { ascending: false }).limit(250);
      if (error) {
        throw new Error(`Failed to fetch geofence events from Supabase: ${error.message}`);
      }
      return (data || []).map((row) => ({
        id: String(row.id),
        organization_id: orgId,
        client_event_id: String(row.client_event_id),
        user_id: String(row.user_id),
        person_id: row.person_id || void 0,
        person_name: row.person_name || void 0,
        service_instance_id: row.service_instance_id || void 0,
        site_id: String(row.site_id),
        type: row.type,
        source: row.source,
        platform: row.platform || "web",
        lat: row.lat ?? null,
        lng: row.lng ?? null,
        accuracy_m: row.accuracy_m ?? null,
        distance_m: row.distance_m ?? null,
        is_mock: Boolean(row.is_mock),
        device_time: String(row.device_time || row.server_time),
        server_time: String(row.server_time),
        status: row.status,
        flag_reasons: Array.isArray(row.flag_reasons) ? row.flag_reasons : []
      }));
    }
    return [...this.rawEventsByOrg.get(orgId) || []];
  }
  mapPersonStatusToDbStatus(status) {
    const s = String(status || "").trim().toLowerCase();
    if (s === "inactive") return "inactive";
    if (s === "pending") return "pending";
    if (s === "archived" || s === "transferred" || s === "deceased") return "archived";
    return "active";
  }
  mapDbStatusToPersonStatus(dbStatus, customAttrs) {
    const customStatus = customAttrs?.memberStatus;
    if (typeof customStatus === "string" && customStatus.trim()) {
      return customStatus.trim();
    }
    if (!dbStatus || dbStatus === "active") return "member";
    if (dbStatus === "archived") return "inactive";
    return dbStatus;
  }
  extractMemberCustomAttributes(payload, existingCustom) {
    const next = { ...existingCustom || {} };
    const extendedKeys = [
      "middleName",
      "preferredName",
      "phoneNumber",
      "specificLocation",
      "remarks",
      "notes",
      "memberId",
      "squads",
      "department",
      "departments",
      "officerName",
      "designation",
      "placeOfResidence",
      "residentialDigitalAddress",
      "hometown",
      "occupation",
      "homeCellGroup",
      "groupName",
      "monthOfBirth",
      "birthMonthGroup",
      "maritalStatus",
      "spouseName",
      "numberOfChildren",
      "emergencyContactPerson",
      "emergencyContactPhone",
      "imageUrl",
      "dateOfBaptism",
      "dateOfMarriage",
      "dateOfSalvation",
      "dateOfMembership",
      "autoCheckinOptedIn",
      "consecutiveAbsences"
    ];
    for (const key of extendedKeys) {
      if (payload[key] === "" || payload[key] === null) {
        delete next[key];
      } else if (payload[key] !== void 0) {
        next[key] = payload[key];
      }
    }
    const resolvedOfficer = payload.officerName ?? payload.designation;
    if (typeof resolvedOfficer === "string" && resolvedOfficer.trim()) {
      next.officerName = resolvedOfficer.trim();
      next.designation = resolvedOfficer.trim();
    } else if (resolvedOfficer === "" || resolvedOfficer === null) {
      delete next.officerName;
      delete next.designation;
    }
    const resolvedInputImg = [
      payload.imageUrl,
      payload.image_url,
      payload.photo_url,
      payload.photoUrl,
      payload.image
    ].find((val) => typeof val === "string" && val.trim().length > 0);
    if (payload.imageUrl === "" || payload.imageUrl === null) {
      delete next.imageUrl;
    } else if (typeof resolvedInputImg === "string") {
      next.imageUrl = resolvedInputImg.trim();
    }
    if (payload.status !== void 0) {
      next.memberStatus = payload.status;
    }
    return next;
  }
  mapSupabaseMemberRow(orgId, row) {
    const custom = row.custom_attributes && typeof row.custom_attributes === "object" ? row.custom_attributes : {};
    const firstName = row.first_name || row.firstName || (row.full_name ? String(row.full_name).split(" ")[0] : "Member");
    const lastName = row.last_name || row.lastName || (row.full_name ? String(row.full_name).split(" ").slice(1).join(" ") : "");
    const groupName = row.group_name || row.home_cell_group || custom.homeCellGroup || custom.groupName || "General Congregation";
    const phoneE164 = row.phone || row.phone_e164 || row.phoneE164 || "";
    const rawDob = row.date_of_birth ?? custom.dateOfBirth;
    const birthFields = resolveMemberBirthFields({
      dateOfBirth: rawDob,
      monthOfBirth: row.month_of_birth ?? custom.monthOfBirth,
      birthMonthGroup: custom.birthMonthGroup
    });
    const deptFields = normalizeMemberDepartmentFields({
      department: typeof custom.department === "string" && custom.department.trim() ? custom.department : row.department,
      departments: Array.isArray(custom.departments) ? custom.departments : void 0
    });
    return {
      ...custom,
      ...row,
      id: String(row.id),
      tenantId: orgId,
      firstName,
      middleName: row.middle_name ?? custom.middleName,
      lastName,
      preferredName: row.preferred_name ?? custom.preferredName ?? `${firstName} ${lastName}`.trim(),
      email: row.email ?? custom.email ?? void 0,
      phoneE164,
      phoneNumber: row.phone_number ?? custom.phoneNumber ?? phoneE164,
      memberId: row.member_id ?? custom.memberId,
      department: deptFields.department,
      departments: deptFields.departments,
      squads: row.squads ?? custom.squads,
      officerName: row.member_officer_name ?? custom.officerName ?? custom.designation,
      designation: row.designation ?? custom.designation ?? row.member_officer_name ?? custom.officerName,
      specificLocation: row.specific_location ?? custom.specificLocation,
      remarks: row.remarks ?? custom.remarks,
      notes: row.notes ?? custom.notes,
      gender: row.gender ?? custom.gender ?? "other",
      dateOfBirth: rawDob,
      placeOfResidence: row.place_of_residence ?? custom.placeOfResidence,
      residentialDigitalAddress: row.residential_digital_address ?? custom.residentialDigitalAddress,
      hometown: row.hometown ?? custom.hometown,
      occupation: row.occupation ?? custom.occupation,
      homeCellGroup: groupName,
      groupName,
      monthOfBirth: birthFields.monthOfBirth,
      birthMonthGroup: birthFields.birthMonthGroup,
      maritalStatus: row.marital_status ?? custom.maritalStatus ?? "Single",
      spouseName: row.spouse_name ?? custom.spouseName,
      numberOfChildren: typeof row.number_of_children === "number" ? row.number_of_children : typeof custom.numberOfChildren === "number" ? custom.numberOfChildren : 0,
      emergencyContactPerson: row.emergency_contact_person ?? custom.emergencyContactPerson,
      emergencyContactPhone: row.emergency_phone ?? custom.emergencyContactPhone,
      imageUrl: [row.image_url, row.photo_url, custom.imageUrl, custom.image, row.avatar_url].find(
        (val) => typeof val === "string" && val.trim().length > 0
      )?.trim() || void 0,
      dateOfBaptism: row.date_of_baptism ?? custom.dateOfBaptism,
      dateOfMarriage: row.date_of_marriage ?? custom.dateOfMarriage,
      dateOfSalvation: row.date_of_salvation ?? custom.dateOfSalvation,
      dateOfMembership: row.date_of_membership ?? custom.dateOfMembership ?? (row.joined_at ? String(row.joined_at).slice(0, 10) : void 0),
      autoCheckinOptedIn: custom.autoCheckinOptedIn ?? true,
      consecutiveAbsences: typeof custom.consecutiveAbsences === "number" ? custom.consecutiveAbsences : 0,
      status: this.mapDbStatusToPersonStatus(row.status, custom)
    };
  }
  async getMembers(organizationId) {
    this.assertDatabaseAvailable();
    const orgId = organizationId.toLowerCase();
    if (this.supabase) {
      const { data, error } = await this.supabase.from("members").select("*").eq("organization_id", orgId).order("created_at", { ascending: false });
      if (error) {
        throw new Error(`Failed to load members from Supabase: ${error.message}`);
      }
      return (data || []).map((row) => this.mapSupabaseMemberRow(orgId, row));
    }
    return (this.membersByOrg.get(orgId) || []).map((m) => {
      const birthFields = resolveMemberBirthFields({
        dateOfBirth: m.dateOfBirth,
        monthOfBirth: m.monthOfBirth,
        birthMonthGroup: m.birthMonthGroup
      });
      const deptFields = normalizeMemberDepartmentFields({
        department: m.department,
        departments: Array.isArray(m.departments) ? m.departments : void 0
      });
      return {
        ...m,
        department: deptFields.department,
        departments: deptFields.departments,
        monthOfBirth: birthFields.monthOfBirth ?? m.monthOfBirth,
        birthMonthGroup: birthFields.birthMonthGroup ?? m.birthMonthGroup
      };
    });
  }
  async getMemberCountForOrg(organizationId) {
    this.assertDatabaseAvailable();
    const orgId = organizationId.toLowerCase();
    if (this.supabase) {
      const { count, error } = await this.supabase.from("members").select("id", { count: "exact", head: true }).eq("organization_id", orgId);
      if (error) {
        throw new Error(`Failed to count members in Supabase: ${error.message}`);
      }
      return typeof count === "number" ? count : 0;
    }
    const localCount = (this.membersByOrg.get(orgId) || []).length;
    const org = this.orgs.get(orgId);
    return Math.max(localCount, org?.memberCount || 0);
  }
  async createMember(organizationId, payload, options) {
    const orgId = organizationId.toLowerCase();
    const evalRes = await this.evaluateOrganizationLicense(orgId);
    if (!evalRes.allowed) {
      const err = new Error(evalRes.message);
      err.code = evalRes.code;
      err.status = evalRes.httpStatus;
      throw err;
    }
    if (evalRes.seatsLimit > 0 && evalRes.seatsUsed + 1 > evalRes.seatsLimit) {
      const err = new Error(
        `Seat limit reached (${evalRes.seatsUsed}/${evalRes.seatsLimit}). Upgrade your license plan to register additional members.`
      );
      err.code = "SEAT_LIMIT_REACHED";
      err.status = 403;
      err.details = { seatsUsed: evalRes.seatsUsed, seatsLimit: evalRes.seatsLimit };
      throw err;
    }
    const firstName = String(payload.firstName ?? payload.first_name ?? "").trim();
    const lastName = String(payload.lastName ?? payload.last_name ?? "").trim();
    const rawPhone = payload.phoneE164 || payload.phoneNumber || payload.phone || null;
    const phone = rawPhone ? normalizePhone(String(rawPhone)) || String(rawPhone).trim() : null;
    const email = payload.email ? String(payload.email).trim().toLowerCase() : null;
    const genderVal = payload.gender && ["male", "female", "other"].includes(String(payload.gender).toLowerCase()) ? String(payload.gender).toLowerCase() : null;
    const dobVal = payload.dateOfBirth && /^\d{4}-\d{2}-\d{2}$/.test(String(payload.dateOfBirth)) ? String(payload.dateOfBirth) : null;
    const birthFields = resolveMemberBirthFields({
      dateOfBirth: dobVal,
      monthOfBirth: payload.monthOfBirth,
      birthMonthGroup: payload.birthMonthGroup
    });
    const deptFields = normalizeMemberDepartmentFields({
      department: payload.department,
      departments: Array.isArray(payload.departments) ? payload.departments : void 0
    });
    const normalizedCreatePayload = {
      ...payload,
      department: deptFields.department,
      departments: deptFields.departments,
      dateOfBirth: dobVal || void 0,
      monthOfBirth: birthFields.monthOfBirth,
      birthMonthGroup: birthFields.birthMonthGroup
    };
    const customAttributes = this.extractMemberCustomAttributes(normalizedCreatePayload);
    const resolvedCreateImage = [
      payload.imageUrl,
      payload.image_url,
      payload.photo_url,
      payload.photoUrl,
      payload.image
    ].find((val) => typeof val === "string" && val.trim().length > 0)?.trim() || null;
    let createdMember;
    if (this.supabase) {
      const baseInsert = {
        organization_id: orgId,
        first_name: firstName,
        last_name: lastName,
        preferred_name: `${firstName} ${lastName}`.trim(),
        email,
        phone_e164: phone,
        role: payload.role && ["owner", "admin", "pastor", "usher", "leader", "member", "guest"].includes(payload.role) ? payload.role : "member",
        status: this.mapPersonStatusToDbStatus(payload.status),
        gender: genderVal,
        date_of_birth: dobVal,
        photo_url: resolvedCreateImage,
        custom_attributes: customAttributes
      };
      const extendedInsert = {
        ...baseInsert,
        phone_number: phone,
        home_cell_group: payload.homeCellGroup || payload.groupName || "General Congregation",
        department: deptFields.department,
        member_id: payload.memberId || null,
        middle_name: payload.middleName || null,
        specific_location: payload.specificLocation || null,
        remarks: payload.remarks || null,
        squads: payload.squads || null,
        member_officer_name: payload.officerName || null,
        place_of_residence: payload.placeOfResidence || null,
        residential_digital_address: payload.residentialDigitalAddress || null,
        hometown: payload.hometown || null,
        occupation: payload.occupation || null,
        month_of_birth: birthFields.monthOfBirth || null,
        marital_status: payload.maritalStatus || null,
        spouse_name: payload.spouseName || null,
        number_of_children: typeof payload.numberOfChildren === "number" ? payload.numberOfChildren : 0,
        emergency_contact_person: payload.emergencyContactPerson || null,
        emergency_phone: payload.emergencyContactPhone || null,
        image_url: resolvedCreateImage,
        date_of_baptism: payload.dateOfBaptism || null,
        date_of_marriage: payload.dateOfMarriage || null,
        date_of_salvation: payload.dateOfSalvation || null,
        date_of_membership: payload.dateOfMembership || null
      };
      let { data, error } = await this.supabase.from("members").insert(extendedInsert).select("*").single();
      if (error && /column .* does not exist|Could not find the '[^']+' column|schema cache/i.test(
        error.message || ""
      )) {
        const retry = await this.supabase.from("members").insert(baseInsert).select("*").single();
        data = retry.data;
        error = retry.error;
        if (error && /column .* does not exist|Could not find the '[^']+' column|schema cache/i.test(
          error.message || ""
        )) {
          const { photo_url: _dropPhoto, ...minimalInsert } = baseInsert;
          const retryMinimal = await this.supabase.from("members").insert(minimalInsert).select("*").single();
          data = retryMinimal.data;
          error = retryMinimal.error;
        }
      }
      if (error || !data) {
        throw new Error(`Failed to create member in Supabase: ${error?.message || "Unknown error"}`);
      }
      createdMember = {
        ...this.mapSupabaseMemberRow(orgId, data),
        avatarInitials: `${firstName[0] || "M"}${lastName[0] || "M"}`.toUpperCase(),
        joinedOn: payload.dateOfMembership || (/* @__PURE__ */ new Date()).toISOString().slice(0, 10)
      };
    } else {
      const newMember = {
        ...normalizedCreatePayload,
        id: payload.id || (0, import_crypto4.randomUUID)(),
        tenantId: orgId,
        firstName,
        lastName,
        phoneE164: phone,
        phoneNumber: phone,
        email,
        status: payload.status || "member",
        groupName: payload.groupName || payload.homeCellGroup || "General Congregation",
        homeCellGroup: payload.homeCellGroup || payload.groupName || "General Congregation",
        autoCheckinOptedIn: payload.autoCheckinOptedIn ?? true,
        avatarInitials: `${firstName[0] || "M"}${lastName[0] || "M"}`.toUpperCase(),
        joinedOn: payload.dateOfMembership || (/* @__PURE__ */ new Date()).toISOString().slice(0, 10),
        consecutiveAbsences: 0
      };
      const list = this.membersByOrg.get(orgId) || [];
      list.unshift(newMember);
      this.membersByOrg.set(orgId, list);
      const org = this.orgs.get(orgId);
      if (org) {
        org.memberCount = list.length;
      }
      createdMember = newMember;
    }
    if (options?.skipAutoCredentials) {
      return createdMember;
    }
    const onboardingCredentials = await this.autoProvisionMemberCredentials({
      organizationId: orgId,
      memberId: String(createdMember.id),
      firstName,
      lastName,
      email: createdMember.email || email,
      phoneE164: createdMember.phoneE164 || phone,
      initialPassword: typeof payload.initialPassword === "string" ? payload.initialPassword : void 0
    });
    return {
      ...createdMember,
      onboardingCredentials
    };
  }
  async validateMemberImport(organizationId, incomingMembers, duplicateMode = "skip") {
    const orgId = organizationId.toLowerCase();
    const [existingMembers, evalRes] = await Promise.all([
      this.getMembers(orgId),
      this.evaluateOrganizationLicense(orgId)
    ]);
    const existingIndex = existingMembers.map((m) => ({
      id: String(m.id),
      memberId: m.memberId ? String(m.memberId) : void 0,
      phoneE164: m.phoneE164 ? String(m.phoneE164) : void 0,
      email: m.email ? String(m.email) : void 0
    }));
    const { rows, summary } = validateMemberImportBatch(
      incomingMembers,
      existingIndex,
      duplicateMode
    );
    const remainingSeats = evalRes.seatsLimit > 0 ? Math.max(0, evalRes.seatsLimit - evalRes.seatsUsed) : null;
    const wouldExceedSeatLimit = evalRes.seatsLimit > 0 && summary.newInserts > 0 && evalRes.seatsUsed + summary.newInserts > evalRes.seatsLimit;
    return {
      summary,
      rows,
      license: {
        allowed: evalRes.allowed,
        code: evalRes.code,
        message: evalRes.message,
        seatsUsed: evalRes.seatsUsed,
        seatsLimit: evalRes.seatsLimit,
        remainingSeats,
        wouldExceedSeatLimit
      }
    };
  }
  async batchImportMembers(organizationId, incomingMembers, options) {
    const orgId = organizationId.toLowerCase();
    const duplicateMode = options?.duplicateMode || "skip";
    const dryRun = Boolean(options?.dryRun);
    const evalRes = await this.evaluateOrganizationLicense(orgId);
    if (!evalRes.allowed) {
      const err = new Error(evalRes.message);
      err.code = evalRes.code;
      err.status = evalRes.httpStatus;
      throw err;
    }
    const validation = await this.validateMemberImport(orgId, incomingMembers, duplicateMode);
    const { summary, rows, license } = validation;
    const rowErrors = rows.filter((r) => !r.isValid).map((r) => ({
      rowIndex: r.rowIndex,
      firstName: r.data.firstName,
      lastName: r.data.lastName,
      phoneE164: r.data.phoneE164,
      errors: r.errors
    }));
    if (dryRun) {
      return {
        dryRun: true,
        summary,
        rows,
        license,
        members: await this.getMembers(orgId),
        importedCount: 0,
        updatedCount: 0,
        skippedCount: summary.skipped,
        invalidCount: summary.invalid,
        credentialsProvisionedCount: 0,
        credentialsExistingCount: 0,
        credentialsSkippedCount: 0,
        errors: rowErrors
      };
    }
    if (summary.newInserts > 0 && license.wouldExceedSeatLimit) {
      const err = new Error(
        `Batch import exceeds seat limit (${evalRes.seatsUsed + summary.newInserts}/${evalRes.seatsLimit}). Only ${license.remainingSeats ?? 0} seat(s) remaining.`
      );
      err.code = "SEAT_LIMIT_REACHED";
      err.status = 403;
      err.details = {
        seatsUsed: evalRes.seatsUsed,
        seatsLimit: evalRes.seatsLimit,
        remainingSeats: license.remainingSeats,
        attemptedNewInserts: summary.newInserts,
        updates: summary.updates,
        skipped: summary.skipped
      };
      throw err;
    }
    if (summary.newInserts === 0 && summary.updates === 0 && summary.invalid > 0) {
      const firstErrorMsg = rowErrors[0]?.errors?.[0] || "All rows failed validation.";
      const err = new Error(
        `Import rejected: 0 valid importable rows (${summary.invalid} failed validation). First issue (Row ${rowErrors[0]?.rowIndex}): ${firstErrorMsg}`
      );
      err.code = "IMPORT_VALIDATION_FAILED";
      err.status = 422;
      err.details = { summary, errors: rowErrors };
      throw err;
    }
    let importedCount = 0;
    let updatedCount = 0;
    let credentialsProvisionedCount = 0;
    let credentialsExistingCount = 0;
    let credentialsSkippedCount = 0;
    let temporaryPassword;
    for (const row of rows) {
      if (row.action === "insert") {
        const created = await this.createMember(orgId, row.data);
        importedCount += 1;
        const credInfo = created.onboardingCredentials;
        if (credInfo?.status === "created") {
          credentialsProvisionedCount += 1;
          temporaryPassword = temporaryPassword || credInfo.temporaryPassword;
        } else if (credInfo?.status === "already_exists") {
          credentialsExistingCount += 1;
        } else {
          credentialsSkippedCount += 1;
        }
      } else if (row.action === "update" && row.matchedMemberId) {
        const updated = await this.updateMember(orgId, row.matchedMemberId, row.data);
        updatedCount += 1;
        const credInfo = updated.onboardingCredentials;
        if (credInfo?.status === "created") {
          credentialsProvisionedCount += 1;
          temporaryPassword = temporaryPassword || credInfo.temporaryPassword;
        } else if (credInfo?.status === "already_exists") {
          credentialsExistingCount += 1;
        }
      }
    }
    const members = await this.getMembers(orgId);
    return {
      dryRun: false,
      summary,
      rows,
      license,
      members,
      importedCount,
      updatedCount,
      skippedCount: summary.skipped,
      invalidCount: summary.invalid,
      credentialsProvisionedCount,
      credentialsExistingCount,
      credentialsSkippedCount,
      ...temporaryPassword ? { temporaryPassword } : {},
      errors: rowErrors
    };
  }
  async updateMember(organizationId, memberId, updates) {
    this.assertDatabaseAvailable();
    const orgId = organizationId.toLowerCase();
    let updatedMember = null;
    if (this.supabase) {
      if (!UUID_REGEX2.test(memberId)) {
        const notFoundErr = new Error("Member not found in organisation");
        notFoundErr.status = 404;
        throw notFoundErr;
      }
      const { data: existingRow } = await this.supabase.from("members").select("*").eq("organization_id", orgId).eq("id", memberId).maybeSingle();
      if (!existingRow) {
        const notFoundErr = new Error("Member not found in organisation");
        notFoundErr.status = 404;
        throw notFoundErr;
      }
      const existingCustom = existingRow?.custom_attributes && typeof existingRow.custom_attributes === "object" ? existingRow.custom_attributes : {};
      const nextDobForBirth = updates.dateOfBirth !== void 0 ? updates.dateOfBirth ? String(updates.dateOfBirth) : null : existingRow?.date_of_birth ?? existingCustom.dateOfBirth;
      const nextMonthInput = updates.dateOfBirth !== void 0 && updates.dateOfBirth ? void 0 : updates.monthOfBirth !== void 0 ? updates.monthOfBirth : existingRow?.month_of_birth ?? existingCustom.monthOfBirth;
      const syncedBirth = resolveMemberBirthFields({
        dateOfBirth: nextDobForBirth,
        monthOfBirth: nextMonthInput,
        birthMonthGroup: updates.birthMonthGroup ?? existingCustom.birthMonthGroup
      });
      const hasDeptUpdate = updates.department !== void 0 || updates.departments !== void 0;
      const syncedDepts = hasDeptUpdate ? normalizeMemberDepartmentFields({
        department: updates.department !== void 0 ? updates.department : existingRow?.department ?? existingCustom.department,
        departments: updates.departments !== void 0 ? Array.isArray(updates.departments) ? updates.departments : void 0 : void 0
      }) : null;
      const syncedUpdates = {
        ...updates,
        ...syncedDepts ? {
          department: syncedDepts.department,
          departments: syncedDepts.departments
        } : {},
        monthOfBirth: syncedBirth.monthOfBirth ?? (updates.dateOfBirth === "" ? "" : updates.monthOfBirth),
        birthMonthGroup: syncedBirth.birthMonthGroup ?? (updates.dateOfBirth === "" && !syncedBirth.monthOfBirth ? "" : updates.birthMonthGroup)
      };
      const patch = {
        updated_at: (/* @__PURE__ */ new Date()).toISOString(),
        custom_attributes: this.extractMemberCustomAttributes(syncedUpdates, existingCustom)
      };
      if (syncedDepts) {
        patch.department = syncedDepts.department;
      }
      const firstName = updates.firstName ?? existingRow?.first_name;
      const lastName = updates.lastName ?? existingRow?.last_name;
      if (updates.firstName !== void 0) patch.first_name = updates.firstName;
      if (updates.lastName !== void 0) patch.last_name = updates.lastName;
      if (updates.preferredName !== void 0) {
        patch.preferred_name = updates.preferredName ? String(updates.preferredName).trim() : `${firstName || ""} ${lastName || ""}`.trim();
      } else if (updates.firstName !== void 0 || updates.lastName !== void 0) {
        patch.preferred_name = `${firstName || ""} ${lastName || ""}`.trim();
      }
      if (updates.email !== void 0) {
        patch.email = updates.email ? String(updates.email).trim().toLowerCase() : null;
      }
      if (updates.phoneE164 !== void 0) {
        patch.phone_e164 = updates.phoneE164 ? normalizePhone(String(updates.phoneE164)) || updates.phoneE164 : null;
      }
      if (updates.gender !== void 0 && ["male", "female", "other"].includes(String(updates.gender).toLowerCase())) {
        patch.gender = String(updates.gender).toLowerCase();
      }
      if (updates.dateOfBirth !== void 0) {
        if (updates.dateOfBirth === "" || updates.dateOfBirth === null) {
          patch.date_of_birth = null;
        } else if (/^\d{4}-\d{2}-\d{2}$/.test(String(updates.dateOfBirth))) {
          patch.date_of_birth = String(updates.dateOfBirth);
        }
      }
      if (updates.imageUrl !== void 0 || updates.image_url !== void 0 || updates.photo_url !== void 0 || updates.photoUrl !== void 0 || updates.image !== void 0) {
        const nextImg = [
          updates.imageUrl,
          updates.image_url,
          updates.photo_url,
          updates.photoUrl,
          updates.image
        ].find((val) => typeof val === "string" && val.trim().length > 0);
        patch.photo_url = typeof nextImg === "string" ? nextImg.trim() : null;
        patch.image_url = typeof nextImg === "string" ? nextImg.trim() : null;
      }
      if (updates.status !== void 0) {
        patch.status = this.mapPersonStatusToDbStatus(updates.status);
      }
      let { data, error } = await this.supabase.from("members").update(patch).eq("organization_id", orgId).eq("id", memberId).select("*").maybeSingle();
      if (error && /column .* does not exist|Could not find the '[^']+' column|schema cache/i.test(
        error.message || ""
      )) {
        const { image_url: _dropImg, ...fallbackPatch } = patch;
        const retry = await this.supabase.from("members").update(fallbackPatch).eq("organization_id", orgId).eq("id", memberId).select("*").maybeSingle();
        data = retry.data;
        error = retry.error;
        if (error && /column .* does not exist|Could not find the '[^']+' column|schema cache/i.test(
          error.message || ""
        )) {
          const { photo_url: _dropPhoto, department: _dropDept, ...minimalPatch } = fallbackPatch;
          const retryMinimal = await this.supabase.from("members").update(minimalPatch).eq("organization_id", orgId).eq("id", memberId).select("*").maybeSingle();
          data = retryMinimal.data;
          error = retryMinimal.error;
        }
      }
      if (error) {
        throw new Error(`Failed to update member in Supabase: ${error.message}`);
      }
      if (!data) {
        const notFoundErr = new Error("Member not found in organisation");
        notFoundErr.status = 404;
        throw notFoundErr;
      }
      updatedMember = this.mapSupabaseMemberRow(orgId, data);
    } else {
      const list = this.membersByOrg.get(orgId) || [];
      const idx = list.findIndex((m) => m.id === memberId);
      if (idx < 0) {
        const notFoundErr = new Error("Member not found in organisation");
        notFoundErr.status = 404;
        throw notFoundErr;
      }
      const nextPhone = updates.phoneE164 !== void 0 ? normalizePhone(String(updates.phoneE164)) || updates.phoneE164 : list[idx].phoneE164;
      const nextEmail = updates.email !== void 0 ? updates.email ? String(updates.email).trim().toLowerCase() : void 0 : list[idx].email;
      const nextDobForBirth = updates.dateOfBirth !== void 0 ? updates.dateOfBirth : list[idx].dateOfBirth;
      const nextMonthInput = updates.dateOfBirth !== void 0 && updates.dateOfBirth ? void 0 : updates.monthOfBirth !== void 0 ? updates.monthOfBirth : list[idx].monthOfBirth;
      const syncedBirth = resolveMemberBirthFields({
        dateOfBirth: nextDobForBirth,
        monthOfBirth: nextMonthInput,
        birthMonthGroup: updates.birthMonthGroup ?? list[idx].birthMonthGroup
      });
      const hasDeptUpdate = updates.department !== void 0 || updates.departments !== void 0;
      const syncedDepts = hasDeptUpdate ? normalizeMemberDepartmentFields({
        department: updates.department !== void 0 ? updates.department : list[idx].department,
        departments: updates.departments !== void 0 ? Array.isArray(updates.departments) ? updates.departments : void 0 : void 0
      }) : normalizeMemberDepartmentFields({
        department: list[idx].department,
        departments: Array.isArray(list[idx].departments) ? list[idx].departments : void 0
      });
      const merged = {
        ...list[idx],
        ...updates,
        department: syncedDepts.department,
        departments: syncedDepts.departments,
        monthOfBirth: syncedBirth.monthOfBirth,
        birthMonthGroup: syncedBirth.birthMonthGroup,
        email: nextEmail,
        phoneE164: nextPhone,
        phoneNumber: nextPhone,
        id: memberId,
        tenantId: orgId
      };
      list[idx] = merged;
      this.membersByOrg.set(orgId, list);
      updatedMember = merged;
    }
    const onboardingCredentials = await this.autoProvisionMemberCredentials({
      organizationId: orgId,
      memberId: String(updatedMember.id),
      firstName: String(updatedMember.firstName || "Congregation"),
      lastName: String(updatedMember.lastName || "Member"),
      email: updatedMember.email ? String(updatedMember.email) : void 0,
      phoneE164: updatedMember.phoneE164 ? String(updatedMember.phoneE164) : void 0
    });
    return {
      ...updatedMember,
      onboardingCredentials
    };
  }
  async getMemberProfileForSession(organizationId, userId, email) {
    const orgId = organizationId.toLowerCase();
    const cleanEmail = (email || "").trim().toLowerCase();
    const list = await this.getMembers(orgId);
    const cred = await this.findCredentialByContactOrMember({
      memberId: userId,
      email: cleanEmail || void 0
    });
    const matched = list.find(
      (m) => m.id === userId || cred?.memberId && m.id === cred.memberId || cleanEmail && String(m.email || "").toLowerCase() === cleanEmail
    );
    return matched || null;
  }
  async updateOwnMemberProfile(organizationId, userId, email, updates, fallbackName) {
    const orgId = organizationId.toLowerCase();
    let matched = await this.getMemberProfileForSession(orgId, userId, email);
    const cred = await this.findCredentialByContactOrMember({
      memberId: userId,
      email: email ? email.trim().toLowerCase() : void 0
    });
    const deriveMonthName = (isoDate) => {
      if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return void 0;
      const monthIdx = Number(isoDate.slice(5, 7)) - 1;
      const months = [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December"
      ];
      return months[monthIdx];
    };
    const nextEmail = updates.email !== void 0 ? updates.email ? String(updates.email).trim().toLowerCase() : "" : void 0;
    const rawPhoneInput = updates.phoneE164 !== void 0 ? updates.phoneE164 : updates.phoneNumber;
    const nextPhone = rawPhoneInput !== void 0 ? rawPhoneInput ? normalizePhone(String(rawPhoneInput)) || String(rawPhoneInput).trim() : "" : void 0;
    if (nextEmail || nextPhone) {
      const orgMembers = await this.getMembers(orgId);
      const conflictMember = orgMembers.find((m) => {
        if (matched && m.id === matched.id) return false;
        const emailMatch = nextEmail && m.email && String(m.email).trim().toLowerCase() === nextEmail;
        const phoneMatch = nextPhone && m.phoneE164 && normalizePhone(String(m.phoneE164)) === nextPhone;
        return Boolean(emailMatch || phoneMatch);
      });
      if (conflictMember) {
        const err = new Error("That email or phone number is already associated with another member.");
        err.code = "CONTACT_ALREADY_IN_USE";
        err.status = 409;
        throw err;
      }
      if (nextEmail) {
        const existingEmailCred = await this.findCredentialByContactOrMember({ email: nextEmail });
        if (existingEmailCred && existingEmailCred.id !== cred?.id && existingEmailCred.id !== userId) {
          const err = new Error("That email address is already linked to another account.");
          err.code = "CONTACT_ALREADY_IN_USE";
          err.status = 409;
          throw err;
        }
      }
      if (nextPhone) {
        const existingPhoneCred = await this.findCredentialByContactOrMember({ phoneE164: nextPhone });
        if (existingPhoneCred && existingPhoneCred.id !== cred?.id && existingPhoneCred.id !== userId) {
          const err = new Error("That phone number is already linked to another account.");
          err.code = "CONTACT_ALREADY_IN_USE";
          err.status = 409;
          throw err;
        }
      }
    }
    const safeUpdates = {};
    const stringFields = [
      "firstName",
      "middleName",
      "lastName",
      "preferredName",
      "dateOfBirth",
      "monthOfBirth",
      "placeOfResidence",
      "specificLocation",
      "residentialDigitalAddress",
      "hometown",
      "occupation",
      "maritalStatus",
      "spouseName",
      "emergencyContactPerson",
      "emergencyContactPhone",
      "groupName",
      "homeCellGroup",
      "department",
      "squads",
      "dateOfSalvation",
      "dateOfBaptism",
      "dateOfMarriage",
      "remarks",
      "notes"
    ];
    for (const field of stringFields) {
      if (updates[field] !== void 0) {
        safeUpdates[field] = typeof updates[field] === "string" ? updates[field].trim() : updates[field];
      }
    }
    if (updates.gender !== void 0 && ["male", "female", "other"].includes(String(updates.gender).toLowerCase())) {
      safeUpdates.gender = String(updates.gender).toLowerCase();
    }
    if (updates.numberOfChildren !== void 0 && Number.isFinite(Number(updates.numberOfChildren))) {
      safeUpdates.numberOfChildren = Math.max(0, Math.min(50, Math.trunc(Number(updates.numberOfChildren))));
    }
    if (nextEmail !== void 0) {
      safeUpdates.email = nextEmail;
    }
    if (nextPhone !== void 0) {
      safeUpdates.phoneE164 = nextPhone;
      safeUpdates.phoneNumber = nextPhone;
    }
    const effectiveDob = safeUpdates.dateOfBirth !== void 0 ? safeUpdates.dateOfBirth : matched?.dateOfBirth;
    const effectiveMonthInput = safeUpdates.dateOfBirth !== void 0 && safeUpdates.dateOfBirth ? void 0 : safeUpdates.monthOfBirth !== void 0 ? safeUpdates.monthOfBirth : matched?.monthOfBirth;
    const syncedBirth = resolveMemberBirthFields({
      dateOfBirth: effectiveDob,
      monthOfBirth: effectiveMonthInput,
      birthMonthGroup: updates.birthMonthGroup ?? matched?.birthMonthGroup
    });
    if (syncedBirth.monthOfBirth) {
      safeUpdates.monthOfBirth = syncedBirth.monthOfBirth;
      safeUpdates.birthMonthGroup = syncedBirth.birthMonthGroup;
    }
    if (updates.departments !== void 0 || updates.department !== void 0) {
      const normalizedDepts = normalizeMemberDepartmentFields({
        department: typeof updates.department === "string" ? updates.department : void 0,
        departments: Array.isArray(updates.departments) ? updates.departments : void 0
      });
      safeUpdates.departments = normalizedDepts.departments;
      safeUpdates.department = normalizedDepts.department;
    }
    if (safeUpdates.homeCellGroup && !safeUpdates.groupName) {
      safeUpdates.groupName = safeUpdates.homeCellGroup;
    } else if (safeUpdates.groupName && !safeUpdates.homeCellGroup) {
      safeUpdates.homeCellGroup = safeUpdates.groupName;
    }
    if (updates.imageUrl !== void 0) safeUpdates.imageUrl = updates.imageUrl || "";
    if (updates.autoCheckinOptedIn !== void 0) {
      safeUpdates.autoCheckinOptedIn = Boolean(updates.autoCheckinOptedIn);
    }
    let resultMember;
    if (!matched) {
      const cleanName = (fallbackName || email?.split("@")[0] || "Church Member").trim();
      const parts = cleanName.split(/\s+/).filter(Boolean);
      const fallbackFirst = parts[0] || "Church";
      const fallbackLast = parts.slice(1).join(" ") || "Member";
      const fallbackDepts = normalizeMemberDepartmentFields({
        department: safeUpdates.department,
        departments: Array.isArray(safeUpdates.departments) ? safeUpdates.departments : void 0
      });
      resultMember = await this.createMember(
        orgId,
        {
          id: UUID_REGEX2.test(userId) ? userId : void 0,
          ...safeUpdates,
          firstName: safeUpdates.firstName || fallbackFirst,
          lastName: safeUpdates.lastName || fallbackLast,
          email: safeUpdates.email !== void 0 ? safeUpdates.email || void 0 : email ? email.trim().toLowerCase() : void 0,
          preferredName: safeUpdates.preferredName || `${safeUpdates.firstName || fallbackFirst} ${safeUpdates.lastName || fallbackLast}`.trim() || cleanName,
          imageUrl: safeUpdates.imageUrl || void 0,
          autoCheckinOptedIn: safeUpdates.autoCheckinOptedIn ?? true,
          groupName: safeUpdates.groupName || safeUpdates.homeCellGroup || "General Congregation",
          homeCellGroup: safeUpdates.homeCellGroup || safeUpdates.groupName || "General Congregation",
          department: fallbackDepts.department,
          departments: fallbackDepts.departments,
          status: "member"
        },
        { skipAutoCredentials: true }
      );
    } else {
      resultMember = await this.updateMember(orgId, String(matched.id), safeUpdates);
    }
    const updatedFullName = `${resultMember.firstName || ""} ${resultMember.lastName || ""}`.trim();
    const sb = this.activeSupabase;
    if (cred) {
      const nextCredEmail = safeUpdates.email !== void 0 ? safeUpdates.email || void 0 : cred.email;
      const nextCredPhone = safeUpdates.phoneE164 !== void 0 ? safeUpdates.phoneE164 || void 0 : cred.phoneE164;
      const nextCredName = updatedFullName || cred.name;
      if (sb && UUID_REGEX2.test(cred.id)) {
        const credPatch = {
          updated_at: (/* @__PURE__ */ new Date()).toISOString(),
          full_name: nextCredName,
          member_id: UUID_REGEX2.test(String(resultMember.id)) ? String(resultMember.id) : cred.memberId || null
        };
        if (safeUpdates.email !== void 0) credPatch.email = nextCredEmail || null;
        if (safeUpdates.phoneE164 !== void 0) credPatch.phone_e164 = nextCredPhone || null;
        await sb.from("account_credentials").update(credPatch).eq("id", cred.id);
      }
      const memCred = this.userCredentials.get(cred.id);
      if (memCred) {
        this.userCredentials.set(cred.id, {
          ...memCred,
          name: nextCredName,
          email: nextCredEmail,
          phoneE164: nextCredPhone,
          memberId: String(resultMember.id)
        });
      }
    }
    await this.recordAuthAuditEvent({
      organizationId: orgId,
      accountId: cred?.id || userId,
      identifier: resultMember.email || resultMember.phoneE164 || userId,
      eventType: "member_profile_updated",
      success: true,
      reason: "self_service_profile_edit"
    });
    return resultMember;
  }
  async deleteMember(organizationId, memberId) {
    this.assertDatabaseAvailable();
    const orgId = organizationId.toLowerCase();
    if (this.supabase) {
      if (!UUID_REGEX2.test(memberId)) {
        const notFound = new Error("Member not found.");
        notFound.code = "MEMBER_NOT_FOUND";
        notFound.status = 404;
        throw notFound;
      }
      const { data: existingMember, error: lookupErr } = await this.supabase.from("members").select("id, user_id, email").eq("organization_id", orgId).eq("id", memberId).maybeSingle();
      if (lookupErr) {
        throw new Error(`Failed to verify member before deletion: ${lookupErr.message}`);
      }
      if (!existingMember) {
        const notFound = new Error("Member not found in database.");
        notFound.code = "MEMBER_NOT_FOUND";
        notFound.status = 404;
        throw notFound;
      }
      const authUserIds = /* @__PURE__ */ new Set();
      const creatorAuthIds = /* @__PURE__ */ new Set();
      const { data: creatorRows } = await this.supabase.from("account_credentials").select("auth_user_id").eq("is_creator", true);
      for (const row of creatorRows || []) {
        if (row.auth_user_id) creatorAuthIds.add(String(row.auth_user_id).toLowerCase());
      }
      if (existingMember.user_id) {
        const uid = String(existingMember.user_id).toLowerCase();
        if (!creatorAuthIds.has(uid)) authUserIds.add(uid);
      }
      const { data: credRows } = await this.supabase.from("account_credentials").select("id, auth_user_id, is_creator").eq("organization_id", orgId).eq("member_id", memberId);
      for (const row of credRows || []) {
        if (!row.is_creator && row.auth_user_id) {
          const uid = String(row.auth_user_id).toLowerCase();
          if (!creatorAuthIds.has(uid)) authUserIds.add(uid);
        }
      }
      const safeDeleteMemberDep = async (table, filters) => {
        let q = this.supabase.from(table).delete();
        for (const [col, val] of Object.entries(filters)) {
          q = q.eq(col, val);
        }
        const { error } = await q;
        if (error && !/does not exist|Could not find the|relation "?(?:public\.)?[^"]+"? does not exist|schema cache|42P01|42703|PGRST205/i.test(
          error.message || ""
        )) {
          throw new Error(`Failed deleting dependent member records from ${table}: ${error.message}`);
        }
      };
      await safeDeleteMemberDep("attendance", { organization_id: orgId, member_id: memberId });
      await safeDeleteMemberDep("attendance_records", { tenant_id: orgId, person_id: memberId });
      await safeDeleteMemberDep("donations", { organization_id: orgId, member_id: memberId });
      await safeDeleteMemberDep("followup_tasks", { organization_id: orgId, member_id: memberId });
      await safeDeleteMemberDep("member_consents", { organization_id: orgId, member_id: memberId });
      await safeDeleteMemberDep("event_rsvps", { organization_id: orgId, member_id: memberId });
      await safeDeleteMemberDep("push_subscriptions", { organization_id: orgId, person_id: memberId });
      await safeDeleteMemberDep("church_wall_posts", { organization_id: orgId, author_id: memberId });
      await safeDeleteMemberDep("church_wall_posts", { organization_id: orgId, target_member_id: memberId });
      await safeDeleteMemberDep("account_credentials", {
        organization_id: orgId,
        member_id: memberId
      });
      const { error: memDelErr } = await this.supabase.from("members").delete().eq("organization_id", orgId).eq("id", memberId);
      if (memDelErr) {
        throw new Error(`Failed to delete member in Supabase: ${memDelErr.message}`);
      }
      for (const authUid of authUserIds) {
        try {
          await this.supabase.auth.admin.deleteUser(authUid);
        } catch {
        }
      }
      return;
    }
    const currentList = this.membersByOrg.get(orgId) || [];
    if (!currentList.some((m) => m.id === memberId)) {
      const notFound = new Error("Member not found.");
      notFound.code = "MEMBER_NOT_FOUND";
      notFound.status = 404;
      throw notFound;
    }
    const list = currentList.filter((m) => m.id !== memberId);
    this.membersByOrg.set(orgId, list);
    const existingCheckins = this.checkinsByOrg.get(orgId) || [];
    this.checkinsByOrg.set(
      orgId,
      existingCheckins.filter((c) => c.personId !== memberId)
    );
    const existingSubs = this.pushSubsByOrg.get(orgId) || [];
    this.pushSubsByOrg.set(
      orgId,
      existingSubs.filter((s) => s.personId !== memberId)
    );
    const existingDonations = this.donationsByOrg.get(orgId) || [];
    this.donationsByOrg.set(
      orgId,
      existingDonations.filter((d) => d.personId !== memberId)
    );
    const existingFollowups = this.followupTasksByOrg.get(orgId) || [];
    this.followupTasksByOrg.set(
      orgId,
      existingFollowups.filter((t) => t.personId !== memberId)
    );
    for (const [credId, cred] of this.userCredentials.entries()) {
      if (cred.organizationId.toLowerCase() === orgId && cred.memberId === memberId && !cred.isCreator) {
        this.userCredentials.delete(credId);
      }
    }
    const org = this.orgs.get(orgId);
    if (org) {
      org.memberCount = list.length;
    }
  }
  async getEvents(organizationId) {
    this.assertDatabaseAvailable();
    const orgId = organizationId.toLowerCase();
    if (this.supabase) {
      const { data, error } = await this.supabase.from("events").select("*").eq("organization_id", orgId).order("start_time", { ascending: true });
      if (error) {
        throw new Error(`Failed to load events from Supabase: ${error.message}`);
      }
      return data || [];
    }
    return [...this.eventsByOrg.get(orgId) || []];
  }
  async createEvent(organizationId, eventData) {
    this.assertDatabaseAvailable();
    const orgId = organizationId.toLowerCase();
    const mapStatusForDb = (raw) => {
      const normalized = String(raw || "").trim().toLowerCase();
      if (normalized === "cancelled") return "cancelled";
      if (normalized === "closed" || normalized === "completed") return "completed";
      return "active";
    };
    if (this.supabase) {
      const { data, error } = await this.supabase.from("events").insert({
        organization_id: orgId,
        name: eventData.name,
        description: eventData.expectedAttendance > 0 ? `Expected attendance: ${eventData.expectedAttendance}` : null,
        start_time: eventData.startTimeIso,
        end_time: eventData.endTimeIso,
        dwell_min: Math.max(0, Math.round(Number(eventData.dwellMin) || 0)),
        status: mapStatusForDb(eventData.status)
      }).select("*").single();
      if (error) {
        throw new Error(`Failed to save scheduled service: ${error.message}`);
      }
      if (data) {
        return {
          ...data,
          date: eventData.date,
          expected_attendance: eventData.expectedAttendance
        };
      }
    }
    const created = {
      id: (0, import_crypto4.randomUUID)(),
      organization_id: orgId,
      name: eventData.name,
      date: eventData.date,
      start_time: eventData.startTimeIso,
      end_time: eventData.endTimeIso,
      starts_at: eventData.startTimeIso,
      ends_at: eventData.endTimeIso,
      dwell_min: eventData.dwellMin,
      status: eventData.status,
      site_id: PRIMARY_CAMPUS_SITE_ID,
      expected_attendance: eventData.expectedAttendance
    };
    const list = this.eventsByOrg.get(orgId) || [];
    list.push(created);
    this.eventsByOrg.set(orgId, list);
    return created;
  }
  async updateEvent(organizationId, eventId, updates) {
    this.assertDatabaseAvailable();
    const orgId = organizationId.toLowerCase();
    if (this.supabase) {
      if (!UUID_REGEX2.test(eventId)) {
        const notFound = new Error("Service event not found.");
        notFound.code = "EVENT_NOT_FOUND";
        notFound.status = 404;
        throw notFound;
      }
      const patch = {};
      if (typeof updates.name === "string" && updates.name.trim()) {
        patch.name = updates.name.trim();
      }
      if (typeof updates.startTimeIso === "string" && updates.startTimeIso.trim()) {
        patch.start_time = updates.startTimeIso.trim();
      }
      if (typeof updates.endTimeIso === "string" && updates.endTimeIso.trim()) {
        patch.end_time = updates.endTimeIso.trim();
      }
      if (typeof updates.dwellMin === "number" && Number.isFinite(updates.dwellMin)) {
        patch.dwell_min = Math.max(0, Math.round(updates.dwellMin));
      }
      if (typeof updates.status === "string" && updates.status.trim()) {
        const st = updates.status.trim().toLowerCase();
        patch.status = st === "cancelled" ? "cancelled" : st === "closed" || st === "completed" ? "completed" : "active";
      }
      if (typeof updates.expectedAttendance === "number" && Number.isFinite(updates.expectedAttendance)) {
        const cleanExpected = Math.max(0, Math.round(updates.expectedAttendance));
        patch.description = cleanExpected > 0 ? `Expected attendance: ${cleanExpected}` : null;
      }
      const { data, error } = await this.supabase.from("events").update(patch).eq("organization_id", orgId).eq("id", eventId).select("*").maybeSingle();
      if (error) {
        throw new Error(`Failed to update service event in Supabase: ${error.message}`);
      }
      if (!data) {
        const notFound = new Error("Service event not found in database.");
        notFound.code = "EVENT_NOT_FOUND";
        notFound.status = 404;
        throw notFound;
      }
      return {
        ...data,
        ...updates.date ? { date: updates.date } : {},
        ...typeof updates.expectedAttendance === "number" ? { expected_attendance: Math.max(0, Math.round(updates.expectedAttendance)) } : {}
      };
    }
    const list = this.eventsByOrg.get(orgId) || [];
    const idx = list.findIndex((ev) => ev.id === eventId);
    if (idx < 0) {
      const notFound = new Error("Service event not found.");
      notFound.code = "EVENT_NOT_FOUND";
      notFound.status = 404;
      throw notFound;
    }
    const current = list[idx];
    const next = {
      ...current,
      ...typeof updates.name === "string" && updates.name.trim() ? { name: updates.name.trim() } : {},
      ...updates.date ? { date: updates.date } : {},
      ...updates.startTimeIso ? { start_time: updates.startTimeIso, starts_at: updates.startTimeIso } : {},
      ...updates.endTimeIso ? { end_time: updates.endTimeIso, ends_at: updates.endTimeIso } : {},
      ...typeof updates.dwellMin === "number" && Number.isFinite(updates.dwellMin) ? { dwell_min: Math.max(0, Math.round(updates.dwellMin)) } : {},
      ...typeof updates.status === "string" && updates.status.trim() ? { status: updates.status.trim() } : {},
      ...typeof updates.expectedAttendance === "number" && Number.isFinite(updates.expectedAttendance) ? { expected_attendance: Math.max(0, Math.round(updates.expectedAttendance)) } : {}
    };
    list[idx] = next;
    this.eventsByOrg.set(orgId, list);
    return next;
  }
  async deleteEvent(organizationId, eventId) {
    this.assertDatabaseAvailable();
    const orgId = organizationId.toLowerCase();
    if (this.supabase) {
      if (!UUID_REGEX2.test(eventId)) {
        const notFound = new Error("Service event not found.");
        notFound.code = "EVENT_NOT_FOUND";
        notFound.status = 404;
        throw notFound;
      }
      const { data: existingEvent, error: lookupErr } = await this.supabase.from("events").select("id").eq("organization_id", orgId).eq("id", eventId).maybeSingle();
      if (lookupErr) {
        throw new Error(`Failed to verify service event before deletion: ${lookupErr.message}`);
      }
      if (!existingEvent) {
        const notFound = new Error("Service event not found in database.");
        notFound.code = "EVENT_NOT_FOUND";
        notFound.status = 404;
        throw notFound;
      }
      await this.supabase.from("attendance").delete().eq("organization_id", orgId).eq("event_id", eventId);
      const { error: delErr } = await this.supabase.from("events").delete().eq("organization_id", orgId).eq("id", eventId);
      if (delErr) {
        throw new Error(`Failed to delete service event in Supabase: ${delErr.message}`);
      }
      return;
    }
    const list = this.eventsByOrg.get(orgId) || [];
    if (!list.some((ev) => ev.id === eventId)) {
      const notFound = new Error("Service event not found.");
      notFound.code = "EVENT_NOT_FOUND";
      notFound.status = 404;
      throw notFound;
    }
    this.eventsByOrg.set(
      orgId,
      list.filter((ev) => ev.id !== eventId)
    );
    const checkins = this.checkinsByOrg.get(orgId) || [];
    this.checkinsByOrg.set(
      orgId,
      checkins.filter((c) => c.serviceInstanceId !== eventId)
    );
  }
  async getServiceHistory(organizationId) {
    this.assertDatabaseAvailable();
    const orgId = organizationId.toLowerCase();
    const [eventsList, allCheckins, membersList] = await Promise.all([
      this.getEvents(orgId),
      this.getLiveCheckins(orgId, null, 2500),
      this.getMembers(orgId)
    ]);
    const memberMap = /* @__PURE__ */ new Map();
    for (const m of membersList) {
      if (m && m.id) {
        memberMap.set(String(m.id), m);
      }
    }
    const checkinsByService = /* @__PURE__ */ new Map();
    const uniquePeople = /* @__PURE__ */ new Set();
    for (const rec of allCheckins) {
      const svcKey = rec.serviceInstanceId || "unassigned";
      const existingList = checkinsByService.get(svcKey) || [];
      if (!existingList.some((r) => r.personId === rec.personId)) {
        existingList.push(rec);
        checkinsByService.set(svcKey, existingList);
      }
      if (rec.personId) {
        uniquePeople.add(rec.personId);
      }
    }
    const formatTimeShort = (raw, fallback) => {
      if (typeof raw !== "string" || !raw.trim()) return fallback;
      const trimmed = raw.trim();
      if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(trimmed)) {
        const [h, m] = trimmed.split(":");
        return `${h.padStart(2, "0")}:${m.padStart(2, "0")}`;
      }
      const parsed = new Date(trimmed);
      if (!Number.isNaN(parsed.getTime())) {
        return `${String(parsed.getHours()).padStart(2, "0")}:${String(parsed.getMinutes()).padStart(2, "0")}`;
      }
      return fallback;
    };
    const todayIso = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
    const nowMs = Date.now();
    const seenServiceIds = /* @__PURE__ */ new Set();
    const buildEntry = (ev) => {
      const id = String(ev.id);
      seenServiceIds.add(id);
      const startRaw = ev.start_time || ev.starts_at || null;
      const endRaw = ev.end_time || ev.ends_at || null;
      let dateStr = typeof ev.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(ev.date) ? ev.date : "";
      if (!dateStr && typeof startRaw === "string" && startRaw.includes("T")) {
        dateStr = startRaw.split("T")[0];
      }
      if (!dateStr) {
        dateStr = todayIso;
      }
      const startsAt = formatTimeShort(startRaw, "08:00");
      const endsAt = formatTimeShort(endRaw, "10:30");
      let expectedAttendance = Number(ev.expected_attendance) || 0;
      if (!expectedAttendance && typeof ev.description === "string") {
        const match = ev.description.match(/Expected attendance:\s*(\d+)/i);
        if (match) expectedAttendance = Number(match[1]) || 0;
      }
      if (!expectedAttendance && membersList.length > 0) {
        expectedAttendance = membersList.length;
      }
      const rawStatus = String(ev.status || "active").toLowerCase();
      const allowanceMinutes = Math.max(
        0,
        Number(ev.dwell_min ?? ev.dwellMinutes ?? ev.allowance_minutes ?? 0) || 0
      );
      const startTimeIso = typeof startRaw === "string" && startRaw.includes("T") ? startRaw : void 0;
      const endTimeIso = typeof endRaw === "string" && endRaw.includes("T") ? endRaw : void 0;
      const resolvedWindow = resolveServiceWindow({
        date: dateStr,
        startsAt,
        endsAt,
        startTimeIso,
        endTimeIso,
        allowanceMinutes,
        rawStatus,
        nowMs
      });
      const computedStatus = resolvedWindow.status;
      const serviceRecs = checkinsByService.get(id) || [];
      const [sh, sm] = startsAt.split(":").map((n) => Number(n) || 0);
      const graceMins = sh * 60 + sm + (allowanceMinutes > 0 ? allowanceMinutes : 15);
      const methodBreakdown = {
        geofence: 0,
        beacon: 0,
        usher: 0,
        posted_qr: 0,
        manual: 0,
        email_link: 0
      };
      let onTimeCount = 0;
      let lateCount = 0;
      let autoProximityCount = 0;
      let confidenceSum = 0;
      const attendees = serviceRecs.map((rec) => {
        const person = memberMap.get(rec.personId);
        const first = person?.firstName || "";
        const last = person?.lastName || "";
        const resolvedName = `${first} ${last}`.trim() || rec.personName || "Registered Member";
        const initials = person?.avatarInitials || resolvedName.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() || "").join("") || "M";
        let isLate = Boolean(rec.late);
        if (!isLate && rec.checkedInIso) {
          const dt = new Date(rec.checkedInIso);
          if (!Number.isNaN(dt.getTime())) {
            const recDate = dt.toISOString().split("T")[0];
            if (recDate === dateStr) {
              const recMins = dt.getHours() * 60 + dt.getMinutes();
              if (recMins > graceMins) isLate = true;
            }
          }
        }
        if (isLate) lateCount += 1;
        else onTimeCount += 1;
        const methodKey = rec.method || "manual";
        methodBreakdown[methodKey] = (methodBreakdown[methodKey] || 0) + 1;
        if (methodKey === "geofence" || methodKey === "beacon") {
          autoProximityCount += 1;
        }
        const conf = typeof rec.confidence === "number" ? rec.confidence : 95;
        confidenceSum += conf;
        return {
          id: rec.id,
          personId: rec.personId,
          name: resolvedName,
          imageUrl: person?.imageUrl || void 0,
          initials,
          groupName: person?.homeCellGroup || person?.groupName || "General Congregation",
          department: person?.department || "General",
          status: person?.status || "member",
          method: methodKey,
          checkedInAt: rec.checkedInAt,
          checkedInIso: rec.checkedInIso,
          late: isLate,
          confidence: conf,
          distanceM: rec.distanceM ?? null
        };
      });
      const totalCheckedIn = attendees.length;
      const assistedDoorCount = Math.max(0, totalCheckedIn - autoProximityCount);
      const fillRatePct = expectedAttendance > 0 ? Math.min(100, Math.round(totalCheckedIn / expectedAttendance * 100)) : 0;
      const onTimePct = totalCheckedIn > 0 ? Math.round(onTimeCount / totalCheckedIn * 100) : 0;
      const autoPct = totalCheckedIn > 0 ? Math.round(autoProximityCount / totalCheckedIn * 100) : 0;
      const avgConfidence = totalCheckedIn > 0 ? Math.round(confidenceSum / totalCheckedIn) : 0;
      return {
        id,
        name: String(ev.name || "Worship Service"),
        date: dateStr,
        startsAt,
        endsAt,
        startTimeIso,
        endTimeIso,
        allowanceMinutes,
        closesAtIso: resolvedWindow.closesAtIso,
        status: computedStatus,
        rawStatus,
        expectedAttendance,
        totalCheckedIn,
        fillRatePct,
        onTimeCount,
        lateCount,
        onTimePct,
        autoProximityCount,
        assistedDoorCount,
        autoPct,
        avgConfidence,
        methodBreakdown,
        attendees
      };
    };
    const entries = eventsList.map(buildEntry);
    for (const [svcId, recs] of checkinsByService.entries()) {
      if (seenServiceIds.has(svcId)) continue;
      const earliestIso = recs[recs.length - 1]?.checkedInIso || (/* @__PURE__ */ new Date()).toISOString();
      const dateStr = earliestIso.split("T")[0] || todayIso;
      entries.push(
        buildEntry({
          id: svcId,
          name: svcId === "svc-sun-1" ? "Sunday Worship Service" : `Recorded Service (${dateStr})`,
          date: dateStr,
          starts_at: "08:00",
          ends_at: "10:30",
          status: dateStr < todayIso ? "closed" : "active"
        })
      );
    }
    entries.sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      return b.startsAt.localeCompare(a.startsAt);
    });
    let liveServices = 0;
    let closedServices = 0;
    let totalHistoricalCheckins = 0;
    let peakServiceId = null;
    let peakServiceName = null;
    let peakServiceCount = 0;
    for (const entry of entries) {
      if (entry.status === "live") liveServices += 1;
      else closedServices += 1;
      totalHistoricalCheckins += entry.totalCheckedIn;
      if (entry.totalCheckedIn > peakServiceCount) {
        peakServiceCount = entry.totalCheckedIn;
        peakServiceId = entry.id;
        peakServiceName = entry.name;
      }
    }
    const averageAttendancePerService = entries.length > 0 ? Math.round(totalHistoricalCheckins / entries.length * 10) / 10 : 0;
    return {
      summary: {
        totalServices: entries.length,
        liveServices,
        closedServices,
        completedServices: closedServices,
        upcomingServices: 0,
        totalHistoricalCheckins,
        uniqueAttendees: uniquePeople.size,
        averageAttendancePerService,
        peakServiceId,
        peakServiceName,
        peakServiceCount
      },
      services: entries
    };
  }
  async upsertPushSubscription(organizationId, sub) {
    this.assertDatabaseAvailable();
    const orgId = organizationId.toLowerCase();
    const record = { ...sub, organizationId: orgId };
    if (this.supabase) {
      const { error } = await this.supabase.from("push_subscriptions").upsert(
        {
          organization_id: orgId,
          person_id: record.personId || null,
          person_name: record.personName || null,
          endpoint: record.endpoint,
          p256dh: record.keys?.p256dh || null,
          auth_key: record.keys?.auth || null,
          user_agent: record.userAgent || null,
          subscribed_at: record.subscribedAt
        },
        { onConflict: "organization_id,endpoint" }
      );
      if (error) {
        throw new Error(`Failed to save push subscription in Supabase: ${error.message}`);
      }
      const subs = await this.getPushSubscriptions(orgId);
      return { subscription: record, totalSubscribers: subs.length };
    }
    const list = this.pushSubsByOrg.get(orgId) || [];
    const idx = list.findIndex((s) => s.id === record.id || s.endpoint === record.endpoint);
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...record };
    } else {
      list.unshift(record);
    }
    this.pushSubsByOrg.set(orgId, list);
    const org = this.orgs.get(orgId);
    if (org) {
      org.pushConfigured = true;
    }
    return { subscription: record, totalSubscribers: list.length };
  }
  async getPushSubscriptions(organizationId) {
    this.assertDatabaseAvailable();
    const orgId = organizationId.toLowerCase();
    if (this.supabase) {
      const { data, error } = await this.supabase.from("push_subscriptions").select("*").eq("organization_id", orgId).order("subscribed_at", { ascending: false });
      if (error) {
        throw new Error(`Failed to load push subscriptions from Supabase: ${error.message}`);
      }
      return (data || []).map((row) => ({
        id: String(row.id),
        organizationId: orgId,
        endpoint: String(row.endpoint),
        personId: row.person_id || void 0,
        personName: row.person_name || void 0,
        userAgent: row.user_agent || void 0,
        subscribedAt: String(row.subscribed_at)
      }));
    }
    return [...this.pushSubsByOrg.get(orgId) || []];
  }
  // ===========================================================================
  // CREATOR CONSOLE: ORGANISATIONS, PLANS, LICENSES, PAYMENTS, AUDIT, USAGE
  // ===========================================================================
  async appendAuditLog(entry) {
    const record = {
      id: (0, import_crypto4.randomUUID)(),
      actorId: entry.actorId || null,
      actorEmail: entry.actorEmail,
      actorRole: entry.actorRole,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId || null,
      organizationId: entry.organizationId ? entry.organizationId.toLowerCase() : null,
      organizationName: entry.organizationId ? (await this.getOrganisationById(entry.organizationId))?.name : void 0,
      reason: entry.reason || null,
      metadata: entry.metadata || {},
      ipAddress: entry.ipAddress || null,
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    const sb = this.activeSupabase;
    if (sb) {
      const { error } = await sb.from("audit_log").insert({
        id: record.id,
        actor_id: record.actorId && UUID_REGEX2.test(record.actorId) ? record.actorId : null,
        actor_email: record.actorEmail,
        actor_role: record.actorRole,
        action: record.action,
        target_type: record.targetType,
        target_id: record.targetId,
        organization_id: record.organizationId && UUID_REGEX2.test(record.organizationId) ? record.organizationId : null,
        reason: record.reason,
        metadata: record.metadata,
        ip_address: record.ipAddress,
        created_at: record.createdAt
      });
      if (error) {
        console.warn("[Ekklesphere Audit] Failed to insert audit_log in Supabase:", error.message);
      }
      return record;
    }
    this.auditLogs.unshift(record);
    return record;
  }
  async mutateAuditLogProhibited() {
    throw new Error("audit_log is strictly append-only; UPDATE and DELETE operations are prohibited");
  }
  async listAuditLogs(filters) {
    this.assertDatabaseAvailable();
    const limit = Math.min(500, Math.max(1, filters?.limit || 150));
    if (this.supabase) {
      let query = this.supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(limit);
      if (filters?.organizationId) query = query.eq("organization_id", filters.organizationId.toLowerCase());
      if (filters?.action) query = query.ilike("action", `%${filters.action}%`);
      if (filters?.actorEmail) query = query.ilike("actor_email", `%${filters.actorEmail}%`);
      const { data, error } = await query;
      if (error) {
        throw new Error(`Failed to fetch audit logs from Supabase: ${error.message}`);
      }
      return (data || []).map((row) => ({
        id: String(row.id),
        actorId: row.actor_id,
        actorEmail: String(row.actor_email),
        actorRole: String(row.actor_role),
        action: String(row.action),
        targetType: String(row.target_type),
        targetId: row.target_id,
        organizationId: row.organization_id,
        reason: row.reason,
        metadata: row.metadata || {},
        ipAddress: row.ip_address,
        createdAt: String(row.created_at)
      }));
    }
    return this.auditLogs.filter((item) => {
      if (filters?.organizationId && item.organizationId !== filters.organizationId.toLowerCase()) {
        return false;
      }
      if (filters?.action && !item.action.toLowerCase().includes(filters.action.toLowerCase())) {
        return false;
      }
      if (filters?.actorEmail && !item.actorEmail.toLowerCase().includes(filters.actorEmail.toLowerCase())) {
        return false;
      }
      return true;
    }).slice(0, limit);
  }
  async listPlans() {
    this.assertDatabaseAvailable();
    if (this.supabase) {
      const { data, error } = await this.supabase.from("plans").select("*").order("annual_cost_usd", { ascending: true });
      if (error) {
        throw new Error(`Failed to fetch plans from Supabase: ${error.message}`);
      }
      if (Array.isArray(data)) {
        return data.map((row) => ({
          id: row.id,
          name: String(row.name),
          description: String(row.description || ""),
          monthlyCostUSD: Number(row.monthly_cost_usd),
          annualCostUSD: Number(row.annual_cost_usd),
          seatsLimit: Number(row.seats_limit),
          sitesLimit: Number(row.sites_limit),
          monthlyCheckinsLimit: Number(row.monthly_checkins_limit),
          featureFlags: {
            ...DEFAULT_PLANS[row.id]?.featureFlags,
            ...row.feature_flags || {}
          },
          isActive: Boolean(row.is_active ?? true),
          updatedAt: String(row.updated_at || (/* @__PURE__ */ new Date()).toISOString())
        }));
      }
      return [];
    }
    return Array.from(this.plans.values());
  }
  async getPlan(planId) {
    const plans = await this.listPlans();
    return plans.find((p) => p.id === planId) || DEFAULT_PLANS[planId] || null;
  }
  async updatePlan(planId, updates) {
    this.assertDatabaseAvailable();
    const existing = await this.getPlan(planId) || DEFAULT_PLANS[planId];
    const merged = {
      ...existing,
      ...updates,
      id: planId,
      featureFlags: {
        ...existing.featureFlags,
        ...updates.featureFlags || {}
      },
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    if (this.supabase) {
      const { error } = await this.supabase.from("plans").update({
        name: merged.name,
        description: merged.description,
        monthly_cost_usd: merged.monthlyCostUSD,
        annual_cost_usd: merged.annualCostUSD,
        seats_limit: merged.seatsLimit,
        sites_limit: merged.sitesLimit,
        monthly_checkins_limit: merged.monthlyCheckinsLimit,
        feature_flags: merged.featureFlags,
        is_active: merged.isActive,
        updated_at: merged.updatedAt
      }).eq("id", planId);
      if (error) {
        throw new Error(`Failed to update plan in Supabase: ${error.message}`);
      }
      return merged;
    }
    this.plans.set(planId, merged);
    return merged;
  }
  async listOrganisations(filters) {
    this.assertDatabaseAvailable();
    let items = [];
    if (this.supabase) {
      const { data: orgRows, error } = await this.supabase.from("organizations").select("*").order("created_at", { ascending: false });
      if (error) {
        throw new Error(`Failed to load organisations from Supabase: ${error.message}`);
      }
      const allLicenses = await this.listLicenses();
      const licByOrg = /* @__PURE__ */ new Map();
      for (const lic of allLicenses) {
        const oid = (lic.organizationId || lic.tenantId).toLowerCase();
        if (!licByOrg.has(oid)) licByOrg.set(oid, lic);
      }
      items = await Promise.all(
        (orgRows || []).map(async (row) => {
          const oid = String(row.id).toLowerCase();
          const lic = licByOrg.get(oid);
          const plan = DEFAULT_PLANS[lic?.tier || "grace_starter"];
          const memberCount = await this.getMemberCountForOrg(oid);
          const sites = await this.getSitesForOrg(oid);
          const settings = row.settings && typeof row.settings === "object" ? row.settings : {};
          return {
            id: oid,
            name: String(row.name),
            slug: String(row.slug),
            orgType: settings.org_type || row.org_type || "church",
            campusCode: settings.campus_code || row.campus_code || String(row.slug).slice(0, 8).toUpperCase(),
            city: settings.city || row.city || "Accra",
            country: settings.country || row.country || "Ghana",
            seniorPastor: settings.senior_pastor || row.senior_pastor || settings.contact_name || row.contact_name || "Administrator",
            contactName: settings.contact_name || row.contact_name || "",
            contactEmail: row.email || settings.contact_email || row.contact_email || "",
            contactPhone: row.phone || settings.contact_phone || row.contact_phone || "",
            status: row.status || settings.status || "trial",
            memberCount,
            maxCapacity: lic?.overrides?.seatsLimit ?? lic?.seatsLimit ?? plan.seatsLimit,
            sitesCount: sites.length,
            sitesLimit: lic?.overrides?.sitesLimit ?? lic?.sitesLimit ?? plan.sitesLimit,
            licenseKey: lic?.key || "UNLICENSED",
            licenseTier: lic?.tier || "grace_starter",
            licenseStatus: lic?.status || "expired",
            renewalDate: lic?.expiresDate || "",
            billingCycle: lic?.billingCycle || "annual",
            customDomain: row.website || settings.custom_domain || row.custom_domain || void 0,
            geofenceRadiusMeters: Number(settings.outer_geofence_m || row.outer_geofence_m || 300),
            geofenceConfigured: sites.length > 0,
            smsConfigured: Boolean(settings.sms_configured || row.sms_configured),
            pushConfigured: Boolean(settings.push_configured || row.push_configured),
            features: {
              ...plan.featureFlags,
              ...lic?.overrides?.features || {}
            },
            createdAt: String(row.created_at)
          };
        })
      );
    } else {
      for (const org of this.orgs.values()) {
        const lic = await this.getLatestLicenseForOrg(org.id);
        const plan = lic && await this.getPlan(lic.tier) || DEFAULT_PLANS.grace_starter;
        const memberCount = await this.getMemberCountForOrg(org.id);
        const sites = await this.getSitesForOrg(org.id);
        const checkins30d = this.computeOrg30dAggregateCheckins(org.id);
        items.push({
          ...org,
          memberCount,
          sitesCount: sites.length,
          maxCapacity: lic?.overrides?.seatsLimit ?? lic?.seatsLimit ?? plan.seatsLimit,
          sitesLimit: lic?.overrides?.sitesLimit ?? lic?.sitesLimit ?? plan.sitesLimit,
          licenseKey: lic?.key || "UNLICENSED",
          licenseTier: lic?.tier || org.licenseTier,
          licenseStatus: lic?.status,
          renewalDate: lic?.expiresDate || org.renewalDate,
          billingCycle: lic?.billingCycle || org.billingCycle,
          geofenceConfigured: sites.length > 0,
          checkins30d,
          features: {
            ...plan.featureFlags,
            ...lic?.overrides?.features || {}
          }
        });
      }
    }
    return items.filter((org) => {
      if (filters?.status && filters.status !== "all" && org.status !== filters.status) return false;
      if (filters?.orgType && filters.orgType !== "all" && org.orgType !== filters.orgType) return false;
      if (filters?.tier && filters.tier !== "all" && org.licenseTier !== filters.tier) return false;
      if (filters?.country && filters.country !== "all" && org.country.toLowerCase() !== filters.country.toLowerCase()) {
        return false;
      }
      if (filters?.search) {
        const q = filters.search.trim().toLowerCase();
        const hay = `${org.name} ${org.slug} ${org.city} ${org.country} ${org.seniorPastor} ${org.campusCode} ${org.contactEmail}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }
  async getOrganisationById(organizationId) {
    this.assertDatabaseAvailable();
    const orgId = organizationId.toLowerCase();
    const list = await this.listOrganisations();
    return list.find((o) => o.id === orgId) || null;
  }
  async createOrganisation(params) {
    this.assertDatabaseAvailable();
    const id = (params.id && UUID_REGEX2.test(params.id) ? params.id : (0, import_crypto4.randomUUID)()).toLowerCase();
    let baseSlug = (params.slug || params.name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || `org-${id.slice(0, 6)}`;
    const planTier = params.initialPlan || "grace_starter";
    const plan = await this.getPlan(planTier) || DEFAULT_PLANS.grace_starter;
    const shouldAutoTrial = params.autoIssueTrial !== false;
    const now = /* @__PURE__ */ new Date();
    const trialEnds = new Date(now.getTime() + TRIAL_DURATION_DAYS * DAY_MS).toISOString().slice(0, 10);
    if (this.supabase) {
      const { data: existing } = await this.supabase.from("organizations").select("id").eq("slug", baseSlug).maybeSingle();
      if (existing) {
        baseSlug = `${baseSlug}-${Math.random().toString(36).substring(2, 6)}`;
      }
      const orgSettings = {
        org_type: params.orgType || "church",
        country: params.country || "Ghana",
        city: params.city || "Accra",
        campus_code: params.campusCode || baseSlug.slice(0, 7).toUpperCase(),
        senior_pastor: params.seniorPastor || params.contactName || "Administrator",
        contact_name: params.contactName || params.seniorPastor || "",
        contact_email: params.contactEmail || "",
        contact_phone: params.contactPhone || "",
        status: shouldAutoTrial ? "trial" : "active",
        custom_domain: params.customDomain || null,
        initial_plan: planTier
      };
      await this.supabase.from("tenants").upsert({
        id,
        name: params.name.trim(),
        slug: baseSlug,
        settings: orgSettings
      });
      const { error } = await this.supabase.from("organizations").insert({
        id,
        name: params.name.trim(),
        slug: baseSlug,
        phone: params.contactPhone || null,
        email: params.contactEmail || null,
        website: params.customDomain || null,
        org_type: params.orgType || "church",
        country: params.country || "Ghana",
        city: params.city || "Accra",
        campus_code: params.campusCode || baseSlug.slice(0, 7).toUpperCase(),
        senior_pastor: params.seniorPastor || params.contactName || "Administrator",
        contact_name: params.contactName || params.seniorPastor || "",
        contact_email: params.contactEmail || null,
        contact_phone: params.contactPhone || null,
        status: shouldAutoTrial ? "trial" : "active",
        custom_domain: params.customDomain || null,
        settings: orgSettings
      });
      if (error) {
        throw new Error(`Failed to create organisation: ${error.message}`);
      }
      let createdLic = null;
      if (shouldAutoTrial) {
        createdLic = await this.issueLicense({
          organizationId: id,
          tier: planTier,
          billingCycle: "annual",
          status: "trial",
          notes: "Auto-issued 14-day trial on creation"
        });
      }
      const createdOrg = await this.getOrganisationById(id);
      return { organisation: createdOrg, license: createdLic };
    }
    const hasDuplicateSlug = Array.from(this.orgs.values()).some(
      (o) => o.slug.toLowerCase() === baseSlug
    );
    if (hasDuplicateSlug) {
      baseSlug = `${baseSlug}-${Math.random().toString(36).substring(2, 6)}`;
    }
    const newOrg = {
      id,
      name: params.name.trim(),
      slug: baseSlug,
      orgType: params.orgType || "church",
      campusCode: params.campusCode || baseSlug.slice(0, 7).toUpperCase(),
      city: params.city || "Accra",
      country: params.country || "Ghana",
      seniorPastor: params.seniorPastor || params.contactName || "Administrator",
      contactName: params.contactName || params.seniorPastor || "",
      contactEmail: params.contactEmail || "",
      contactPhone: params.contactPhone || "",
      status: shouldAutoTrial ? "trial" : "active",
      memberCount: 0,
      maxCapacity: plan.seatsLimit,
      sitesCount: 0,
      sitesLimit: plan.sitesLimit,
      licenseKey: "UNLICENSED",
      licenseTier: planTier,
      renewalDate: shouldAutoTrial ? trialEnds : "",
      billingCycle: "annual",
      customDomain: params.customDomain,
      geofenceRadiusMeters: 300,
      geofenceConfigured: false,
      smsConfigured: false,
      pushConfigured: false,
      features: { ...plan.featureFlags },
      createdAt: now.toISOString()
    };
    this.orgs.set(id, newOrg);
    let issuedLicense = null;
    if (shouldAutoTrial) {
      issuedLicense = await this.issueLicense({
        organizationId: id,
        tier: planTier,
        billingCycle: "annual",
        status: "trial",
        durationDays: TRIAL_DURATION_DAYS,
        notes: "Auto-provisioned 14-day onboarding trial (+7d expiry grace)"
      });
    }
    const hydrated = await this.getOrganisationById(id);
    return { organisation: hydrated, license: issuedLicense };
  }
  async updateOrganisation(organizationId, updates) {
    this.assertDatabaseAvailable();
    const orgId = organizationId.toLowerCase();
    if (this.supabase) {
      const dbPatch = { updated_at: (/* @__PURE__ */ new Date()).toISOString() };
      if (updates.name !== void 0) dbPatch.name = updates.name;
      if (updates.orgType !== void 0) dbPatch.org_type = updates.orgType;
      if (updates.country !== void 0) dbPatch.country = updates.country;
      if (updates.city !== void 0) dbPatch.city = updates.city;
      if (updates.campusCode !== void 0) dbPatch.campus_code = updates.campusCode;
      if (updates.seniorPastor !== void 0) dbPatch.senior_pastor = updates.seniorPastor;
      if (updates.contactName !== void 0) dbPatch.contact_name = updates.contactName;
      if (updates.contactEmail !== void 0) dbPatch.contact_email = updates.contactEmail;
      if (updates.contactPhone !== void 0) dbPatch.contact_phone = updates.contactPhone;
      if (updates.geofenceRadiusMeters !== void 0) {
        dbPatch.geofence_radius_meters = updates.geofenceRadiusMeters;
      }
      if (updates.status !== void 0) {
        dbPatch.status = updates.status;
        const { data: curRow } = await this.supabase.from("organizations").select("settings").eq("id", orgId).maybeSingle();
        const curSettings = curRow?.settings && typeof curRow.settings === "object" ? curRow.settings : {};
        dbPatch.settings = { ...curSettings, status: updates.status };
      }
      if (updates.customDomain !== void 0) dbPatch.custom_domain = updates.customDomain;
      if (updates.smsConfigured !== void 0) dbPatch.sms_configured = updates.smsConfigured;
      if (updates.pushConfigured !== void 0) dbPatch.push_configured = updates.pushConfigured;
      const { error } = await this.supabase.from("organizations").update(dbPatch).eq("id", orgId);
      if (error) throw new Error(`Failed to update organisation: ${error.message}`);
      const refreshed = await this.getOrganisationById(orgId);
      if (!refreshed) throw new Error("Organisation not found");
      return refreshed;
    }
    const existing = this.orgs.get(orgId);
    if (!existing) throw new Error("Organisation not found");
    const updated = {
      ...existing,
      ...updates,
      customDomain: updates.customDomain === null ? void 0 : updates.customDomain ?? existing.customDomain
    };
    this.orgs.set(orgId, updated);
    return await this.getOrganisationById(orgId);
  }
  async revokeOrganisation(organizationId, reason) {
    this.assertDatabaseAvailable();
    const orgId = (organizationId || "").trim().toLowerCase();
    const cleanReason = (reason || "").trim();
    if (cleanReason.length < 3) {
      const err = new Error("A clear audit reason (min 3 characters) is required to revoke an organisation.");
      err.code = "INVALID_INPUT";
      err.status = 400;
      throw err;
    }
    const existingOrg = await this.getOrganisationById(orgId);
    if (!existingOrg) {
      const err = new Error("Organisation not found.");
      err.code = "ORG_NOT_FOUND";
      err.status = 404;
      throw err;
    }
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    let revokedGrantsCount = 0;
    let suspendedCredentialsCount = 0;
    if (this.supabase) {
      const { error: licErr } = await this.supabase.from("licenses").update({
        status: "revoked",
        revoked_reason: cleanReason,
        updated_at: nowIso
      }).eq("organization_id", orgId);
      if (licErr && /column .* does not exist|Could not find the '[^']+' column|schema cache/i.test(
        licErr.message || ""
      )) {
        await this.supabase.from("licenses").update({ status: "revoked" }).or(`organization_id.eq.${orgId},tenant_id.eq.${orgId}`);
      } else if (licErr) {
        throw new Error(`Failed to revoke organisation licenses: ${licErr.message}`);
      }
      const { data: revokedGrants } = await this.supabase.from("support_grants").update({ revoked_at: nowIso }).eq("organization_id", orgId).is("revoked_at", null).select("id");
      revokedGrantsCount = Array.isArray(revokedGrants) ? revokedGrants.length : 0;
      const { data: suspendedCreds } = await this.supabase.from("account_credentials").update({ status: "suspended", updated_at: nowIso }).eq("organization_id", orgId).eq("is_creator", false).neq("status", "suspended").select("id");
      suspendedCredentialsCount = Array.isArray(suspendedCreds) ? suspendedCreds.length : 0;
      const { data: curRow } = await this.supabase.from("organizations").select("settings").eq("id", orgId).maybeSingle();
      const curSettings = curRow?.settings && typeof curRow.settings === "object" ? curRow.settings : {};
      const { error: orgErr } = await this.supabase.from("organizations").update({
        status: "suspended",
        settings: { ...curSettings, status: "suspended", revoked_reason: cleanReason, revoked_at: nowIso },
        updated_at: nowIso
      }).eq("id", orgId);
      if (orgErr) {
        throw new Error(`Failed to suspend organisation status: ${orgErr.message}`);
      }
    } else {
      for (const [licId, lic] of this.licenses.entries()) {
        if ((lic.organizationId || lic.tenantId).toLowerCase() === orgId) {
          this.licenses.set(licId, {
            ...lic,
            status: "revoked",
            notes: cleanReason
          });
        }
      }
      for (const [grantId, grant] of this.supportGrants.entries()) {
        if (grant.organizationId.toLowerCase() === orgId && !grant.revokedAt) {
          this.supportGrants.set(grantId, {
            ...grant,
            revokedAt: nowIso,
            active: false
          });
          revokedGrantsCount++;
        }
      }
      for (const [credId, cred] of this.userCredentials.entries()) {
        if (cred.organizationId.toLowerCase() === orgId && !cred.isCreator && cred.status !== "suspended") {
          this.userCredentials.set(credId, {
            ...cred,
            status: "suspended"
          });
          suspendedCredentialsCount++;
        }
      }
      const memOrg = this.orgs.get(orgId);
      if (memOrg) {
        this.orgs.set(orgId, {
          ...memOrg,
          status: "suspended",
          licenseStatus: "revoked"
        });
      }
    }
    const refreshedOrg = await this.getOrganisationById(orgId);
    const refreshedLic = await this.getLatestLicenseForOrg(orgId);
    return {
      organisation: refreshedOrg,
      license: refreshedLic,
      revokedGrantsCount,
      suspendedCredentialsCount
    };
  }
  async deleteOrganisation(organizationId) {
    this.assertDatabaseAvailable();
    const orgId = (organizationId || "").trim().toLowerCase();
    const existingOrg = await this.getOrganisationById(orgId);
    if (!existingOrg) {
      const err = new Error("Organisation not found.");
      err.code = "ORG_NOT_FOUND";
      err.status = 404;
      throw err;
    }
    let deletedAuthUsersCount = 0;
    if (this.supabase) {
      const authUserIds = /* @__PURE__ */ new Set();
      const creatorAuthIds = /* @__PURE__ */ new Set();
      const { data: creatorRows } = await this.supabase.from("account_credentials").select("auth_user_id").eq("is_creator", true);
      for (const row of creatorRows || []) {
        if (row.auth_user_id) creatorAuthIds.add(String(row.auth_user_id).toLowerCase());
      }
      const { data: credRows } = await this.supabase.from("account_credentials").select("auth_user_id, is_creator").eq("organization_id", orgId);
      for (const row of credRows || []) {
        if (!row.is_creator && row.auth_user_id) {
          const uid = String(row.auth_user_id).toLowerCase();
          if (!creatorAuthIds.has(uid)) authUserIds.add(uid);
        }
      }
      const { data: memberRows } = await this.supabase.from("members").select("user_id").eq("organization_id", orgId);
      for (const row of memberRows || []) {
        if (row.user_id) {
          const uid = String(row.user_id).toLowerCase();
          if (!creatorAuthIds.has(uid)) authUserIds.add(uid);
        }
      }
      const safeDeleteByCol = async (table, col) => {
        const { error } = await this.supabase.from(table).delete().eq(col, orgId);
        if (error && !/does not exist|Could not find the|relation "?(?:public\.)?[^"]+"? does not exist|schema cache|42P01|42703|PGRST205/i.test(
          error.message || ""
        )) {
          throw new Error(`Failed deleting from ${table}.${col}: ${error.message}`);
        }
      };
      const deleteOrder = [
        ["license_payments", "organization_id"],
        ["data_requests", "organization_id"],
        ["support_grants", "organization_id"],
        ["licenses", "organization_id"],
        ["licenses", "tenant_id"],
        ["account_credentials", "organization_id"],
        ["auth_audit_events", "organization_id"],
        ["attendance", "organization_id"],
        ["attendance_records", "tenant_id"],
        ["attendance_events", "organization_id"],
        ["donations", "organization_id"],
        ["donations", "tenant_id"],
        ["followup_tasks", "organization_id"],
        ["followup_tasks", "tenant_id"],
        ["member_consents", "organization_id"],
        ["event_rsvps", "organization_id"],
        ["service_instances", "tenant_id"],
        ["services", "tenant_id"],
        ["events", "organization_id"],
        ["sites", "organization_id"],
        ["campuses", "tenant_id"],
        ["persons", "tenant_id"],
        ["members", "organization_id"],
        ["church_groups", "organization_id"],
        ["church_wall_posts", "organization_id"],
        ["push_subscriptions", "organization_id"],
        ["usage_daily", "organization_id"],
        ["alerts", "organization_id"],
        ["system_settings", "tenant_id"],
        ["system_settings", "organization_id"],
        ["church_public_profiles", "organization_id"],
        ["service_times", "organization_id"],
        ["ministries", "organization_id"],
        ["church_events", "organization_id"],
        ["news_posts", "organization_id"],
        ["user_roles", "organization_id"],
        ["user_roles", "tenant_id"],
        ["users", "tenant_id"]
      ];
      for (const [table, col] of deleteOrder) {
        await safeDeleteByCol(table, col);
      }
      const { error: orgDelErr } = await this.supabase.from("organizations").delete().eq("id", orgId);
      if (orgDelErr) {
        throw new Error(`Failed to delete organisation record: ${orgDelErr.message}`);
      }
      await safeDeleteByCol("tenants", "id");
      for (const authUid of authUserIds) {
        try {
          const { error: authDelErr } = await this.supabase.auth.admin.deleteUser(authUid);
          if (!authDelErr) deletedAuthUsersCount++;
        } catch {
        }
      }
    }
    this.orgs.delete(orgId);
    for (const [licId, lic] of this.licenses.entries()) {
      if ((lic.organizationId || lic.tenantId).toLowerCase() === orgId) {
        this.licenses.delete(licId);
      }
    }
    this.payments = this.payments.filter((p) => p.organizationId.toLowerCase() !== orgId);
    for (const [uKey, uVal] of this.usageDaily.entries()) {
      if (uVal.organizationId.toLowerCase() === orgId) {
        this.usageDaily.delete(uKey);
      }
    }
    for (const [aId, aVal] of this.alerts.entries()) {
      if ((aVal.organizationId || "").toLowerCase() === orgId) {
        this.alerts.delete(aId);
      }
    }
    for (const [drId, drVal] of this.dataRequests.entries()) {
      if (drVal.organizationId.toLowerCase() === orgId) {
        this.dataRequests.delete(drId);
      }
    }
    for (const [gId, gVal] of this.supportGrants.entries()) {
      if (gVal.organizationId.toLowerCase() === orgId) {
        this.supportGrants.delete(gId);
      }
    }
    this.sitesByOrg.delete(orgId);
    this.premiseByOrg.delete(orgId);
    this.systemSettingsByOrg.delete(orgId);
    this.churchGroupsByOrg.delete(orgId);
    this.churchGroupLeadershipHistoryByOrg.delete(orgId);
    this.checkinsByOrg.delete(orgId);
    this.rawEventsByOrg.delete(orgId);
    this.membersByOrg.delete(orgId);
    this.eventsByOrg.delete(orgId);
    this.pushSubsByOrg.delete(orgId);
    this.donationsByOrg.delete(orgId);
    this.followupTasksByOrg.delete(orgId);
    this.memberConsentsByOrg.delete(orgId);
    this.eventRsvpsByOrg.delete(orgId);
    for (const [credId, cred] of this.userCredentials.entries()) {
      if (cred.organizationId.toLowerCase() === orgId && !cred.isCreator) {
        this.userCredentials.delete(credId);
      }
    }
    churchWallStore.clearOrganizationInMemory(orgId);
    return {
      deleted: true,
      organizationId: orgId,
      organizationName: existingOrg.name,
      deletedAuthUsersCount
    };
  }
  async listLicenses() {
    this.assertDatabaseAvailable();
    if (this.supabase) {
      const { data, error } = await this.supabase.from("licenses").select("*").order("created_at", { ascending: false });
      if (error) {
        throw new Error(`Failed to fetch licenses from Supabase: ${error.message}`);
      }
      return (data || []).map((row) => {
        const tier = row.tier || row.plan_id || "grace_starter";
        const plan = DEFAULT_PLANS[tier] || DEFAULT_PLANS.grace_starter;
        const orgId = String(row.tenant_id || row.organization_id || "").toLowerCase();
        const overrides = row.overrides || {};
        return {
          id: String(row.id),
          key: String(row.key || row.license_key),
          tier,
          tenantId: orgId,
          organizationId: orgId,
          tenantName: "Organisation",
          seatsLimit: Number(row.seats_limit ?? overrides.seatsLimit ?? plan.seatsLimit),
          sitesLimit: overrides.sitesLimit ?? plan.sitesLimit,
          monthlyCheckinsLimit: overrides.monthlyCheckinsLimit ?? plan.monthlyCheckinsLimit,
          status: row.status || "trial",
          issuedDate: String(row.issued_date || row.issued_at || (/* @__PURE__ */ new Date()).toISOString()).slice(0, 10),
          expiresDate: String(row.expires_date || row.expires_at || (/* @__PURE__ */ new Date()).toISOString()).slice(0, 10),
          graceEndsDate: null,
          billingCycle: row.billing_cycle || "annual",
          annualCostUSD: Number(row.annual_cost_usd ?? plan.annualCostUSD),
          overrides,
          notes: row.notes || void 0,
          enabledFeatures: Array.isArray(row.enabled_features) && row.enabled_features.length > 0 ? row.enabled_features : enabledFeatureLabelsFromFlags({
            ...plan.featureFlags,
            ...overrides.features || {}
          })
        };
      });
    }
    const result = [];
    for (const lic of this.licenses.values()) {
      const orgId = (lic.organizationId || lic.tenantId).toLowerCase();
      const org = this.orgs.get(orgId);
      const seatsUsed = await this.getMemberCountForOrg(orgId);
      const sitesUsed = (await this.getSitesForOrg(orgId)).length;
      result.push({
        ...lic,
        tenantName: org?.name || lic.tenantName,
        seatsUsed,
        sitesUsed
      });
    }
    return result;
  }
  async getLatestLicenseForOrg(organizationId) {
    const orgId = organizationId.toLowerCase();
    const all = await this.listLicenses();
    return all.find((l) => (l.organizationId || l.tenantId).toLowerCase() === orgId) || null;
  }
  async issueLicense(params) {
    this.assertDatabaseAvailable();
    const orgId = params.organizationId.toLowerCase();
    const org = this.supabase ? await this.getOrganisationById(orgId) : this.orgs.get(orgId) || await this.getOrganisationById(orgId);
    if (!org) {
      throw new Error(`Cannot issue license: organisation ${orgId} not found`);
    }
    const plan = await this.getPlan(params.tier) || DEFAULT_PLANS.grace_starter;
    const status = params.status || "active";
    const durationDays = params.durationDays ?? (status === "trial" ? TRIAL_DURATION_DAYS : params.billingCycle === "monthly" ? 30 : params.billingCycle === "lifetime" ? 36500 : 365);
    const now = /* @__PURE__ */ new Date();
    const expires = new Date(now.getTime() + durationDays * DAY_MS);
    const graceEnds = new Date(expires.getTime() + GRACE_PERIOD_DAYS * DAY_MS);
    const key = generateLicenseKey(org.name, status === "trial" ? "TRIAL" : "LIC");
    const annualCostUSD = status === "trial" ? 0 : params.billingCycle === "monthly" ? plan.monthlyCostUSD * 12 : plan.annualCostUSD;
    const overrides = params.overrides || {};
    if (this.supabase) {
      const canonicalPayload = {
        organization_id: orgId,
        license_key: key,
        plan_id: params.tier,
        status,
        issued_at: now.toISOString(),
        expires_at: expires.toISOString(),
        grace_ends_at: graceEnds.toISOString(),
        billing_cycle: params.billingCycle,
        annual_cost_usd: annualCostUSD,
        overrides,
        notes: params.notes || null
      };
      const attemptPayload = {
        ...canonicalPayload,
        tenant_id: orgId,
        key,
        tier: params.tier,
        seats_limit: overrides.seatsLimit ?? plan.seatsLimit,
        issued_date: now.toISOString(),
        expires_date: expires.toISOString(),
        enabled_features: Object.keys(plan.featureFlags).filter((k) => plan.featureFlags[k])
      };
      let insertResult = await this.supabase.from("licenses").insert(attemptPayload).select("*").single();
      for (let attempt = 0; attempt < 8 && insertResult.error; attempt++) {
        const msg = insertResult.error.message || "";
        const colMatch = msg.match(/Could not find the '([^']+)' column/i) || msg.match(/column "([^"]+)"(?: of relation "[^"]+")? does not exist/i);
        if (colMatch && colMatch[1] && Object.prototype.hasOwnProperty.call(attemptPayload, colMatch[1])) {
          delete attemptPayload[colMatch[1]];
          insertResult = await this.supabase.from("licenses").insert(attemptPayload).select("*").single();
          continue;
        }
        if (attemptPayload.status === "trial" && /check constraint/i.test(msg)) {
          attemptPayload.status = "active";
          insertResult = await this.supabase.from("licenses").insert(attemptPayload).select("*").single();
          continue;
        }
        if (/column .* does not exist|schema cache/i.test(msg)) {
          const fallbackPayload = { ...canonicalPayload };
          if (Object.prototype.hasOwnProperty.call(attemptPayload, "key")) {
            fallbackPayload.key = key;
          }
          insertResult = await this.supabase.from("licenses").insert(fallbackPayload).select("*").single();
        }
        break;
      }
      if (insertResult.error || !insertResult.data) {
        throw new Error(`Failed to issue license: ${insertResult.error?.message || "Unknown error"}`);
      }
      return await this.getLatestLicenseForOrg(orgId);
    }
    for (const [existingId, existingLic] of this.licenses.entries()) {
      if ((existingLic.organizationId || existingLic.tenantId).toLowerCase() === orgId) {
        this.licenses.delete(existingId);
      }
    }
    const newLic = {
      id: (0, import_crypto4.randomUUID)(),
      key,
      tier: params.tier,
      tenantId: orgId,
      organizationId: orgId,
      tenantName: org.name,
      seatsLimit: overrides.seatsLimit ?? plan.seatsLimit,
      sitesLimit: overrides.sitesLimit ?? plan.sitesLimit,
      monthlyCheckinsLimit: overrides.monthlyCheckinsLimit ?? plan.monthlyCheckinsLimit,
      status,
      issuedDate: now.toISOString().slice(0, 10),
      expiresDate: expires.toISOString().slice(0, 10),
      graceEndsDate: graceEnds.toISOString().slice(0, 10),
      billingCycle: params.billingCycle,
      annualCostUSD,
      overrides,
      notes: params.notes,
      enabledFeatures: enabledFeatureLabelsFromFlags({
        ...plan.featureFlags,
        ...overrides.features || {}
      })
    };
    const reordered = /* @__PURE__ */ new Map();
    reordered.set(newLic.id, newLic);
    for (const [k, v] of this.licenses.entries()) reordered.set(k, v);
    this.licenses = reordered;
    const memOrg = this.orgs.get(orgId);
    if (memOrg) {
      memOrg.licenseKey = newLic.key;
      memOrg.licenseTier = newLic.tier;
      memOrg.renewalDate = newLic.expiresDate;
      memOrg.status = status === "trial" ? "trial" : "active";
    }
    return newLic;
  }
  async performLicenseAction(licenseId, actionPayload) {
    this.assertDatabaseAvailable();
    const all = await this.listLicenses();
    const target = all.find((l) => l.id === licenseId);
    if (!target) {
      throw new Error("License not found");
    }
    const orgId = (target.organizationId || target.tenantId).toLowerCase();
    let nextStatus = target.status;
    let nextTier = target.tier;
    let nextExpires = new Date(
      target.expiresDate.includes("T") ? target.expiresDate : `${target.expiresDate}T00:00:00.000Z`
    );
    let nextOverrides = { ...target.overrides || {} };
    let nextNotes = actionPayload.notes ?? target.notes;
    switch (actionPayload.action) {
      case "renew": {
        const months = Math.max(1, actionPayload.durationMonths || 12);
        const baseTime = Math.max(Date.now(), nextExpires.getTime());
        nextExpires = new Date(baseTime + months * 30 * DAY_MS);
        nextStatus = "active";
        break;
      }
      case "upgrade":
      case "downgrade": {
        if (!actionPayload.targetTier) throw new Error("targetTier is required for tier change");
        nextTier = actionPayload.targetTier;
        if (nextStatus === "expired" || nextStatus === "grace_period") {
          nextStatus = "active";
        }
        break;
      }
      case "start_trial": {
        nextStatus = "trial";
        nextExpires = new Date(Date.now() + TRIAL_DURATION_DAYS * DAY_MS);
        break;
      }
      case "suspend": {
        nextStatus = "suspended";
        break;
      }
      case "reactivate": {
        nextStatus = "active";
        if (nextExpires.getTime() < Date.now()) {
          nextExpires = new Date(Date.now() + 30 * DAY_MS);
        }
        break;
      }
      case "revoke": {
        nextStatus = "revoked";
        break;
      }
      case "set_overrides": {
        nextOverrides = { ...nextOverrides, ...actionPayload.overrides || {} };
        break;
      }
    }
    if (actionPayload.expiresDate) {
      nextExpires = /* @__PURE__ */ new Date(`${actionPayload.expiresDate}T23:59:59.000Z`);
    }
    const nextGrace = new Date(nextExpires.getTime() + GRACE_PERIOD_DAYS * DAY_MS);
    const plan = await this.getPlan(nextTier) || DEFAULT_PLANS.grace_starter;
    const annualCostUSD = nextStatus === "trial" ? 0 : plan.annualCostUSD;
    if (this.supabase) {
      const { error } = await this.supabase.from("licenses").update({
        plan_id: nextTier,
        status: nextStatus,
        expires_at: nextExpires.toISOString(),
        grace_ends_at: nextGrace.toISOString(),
        annual_cost_usd: annualCostUSD,
        overrides: nextOverrides,
        notes: nextNotes || null,
        suspended_reason: actionPayload.action === "suspend" ? actionPayload.reason || null : void 0,
        revoked_reason: actionPayload.action === "revoke" ? actionPayload.reason || null : void 0,
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      }).eq("id", licenseId);
      if (error) throw new Error(`Failed to update license: ${error.message}`);
      if (actionPayload.action === "suspend" || actionPayload.action === "revoke") {
        await this.updateOrganisation(orgId, { status: "suspended" });
      } else if (actionPayload.action === "reactivate" || actionPayload.action === "renew") {
        await this.updateOrganisation(orgId, { status: "active" });
      }
      return (await this.listLicenses()).find((l) => l.id === licenseId);
    }
    const updated = {
      ...target,
      tier: nextTier,
      status: nextStatus,
      seatsLimit: nextOverrides.seatsLimit ?? plan.seatsLimit,
      sitesLimit: nextOverrides.sitesLimit ?? plan.sitesLimit,
      monthlyCheckinsLimit: nextOverrides.monthlyCheckinsLimit ?? plan.monthlyCheckinsLimit,
      expiresDate: nextExpires.toISOString().slice(0, 10),
      graceEndsDate: nextGrace.toISOString().slice(0, 10),
      annualCostUSD,
      overrides: nextOverrides,
      notes: nextNotes,
      enabledFeatures: enabledFeatureLabelsFromFlags({
        ...plan.featureFlags,
        ...nextOverrides.features || {}
      })
    };
    this.licenses.set(licenseId, updated);
    const memOrg = this.orgs.get(orgId);
    if (memOrg) {
      memOrg.licenseTier = nextTier;
      memOrg.renewalDate = updated.expiresDate;
      if (actionPayload.action === "suspend" || actionPayload.action === "revoke") {
        memOrg.status = "suspended";
      }
      if (actionPayload.action === "reactivate" || actionPayload.action === "renew") memOrg.status = "active";
      if (actionPayload.action === "start_trial") memOrg.status = "trial";
    }
    return updated;
  }
  async upgradeOrganisationSubscription(params) {
    const orgId = params.organizationId.toLowerCase();
    const org = await this.getOrganisationById(orgId);
    if (!org) {
      const err = new Error("Organisation not found.");
      err.code = "ORG_NOT_FOUND";
      err.status = 404;
      throw err;
    }
    const existingLic = await this.getLatestLicenseForOrg(orgId);
    if (existingLic?.status === "revoked") {
      const err = new Error(
        "This organisation license has been revoked by Platform Governance. Contact support."
      );
      err.code = "LICENSE_REVOKED";
      err.status = 403;
      throw err;
    }
    const plan = await this.getPlan(params.tier) || DEFAULT_PLANS[params.tier] || DEFAULT_PLANS.ministry_pro;
    const billedAmountUSD = params.billingCycle === "monthly" ? plan.monthlyCostUSD : params.billingCycle === "lifetime" ? plan.annualCostUSD * 5 : plan.annualCostUSD;
    const upgradedLicense = await this.issueLicense({
      organizationId: orgId,
      tier: params.tier,
      billingCycle: params.billingCycle,
      status: "active",
      notes: params.notes?.trim() || `Self-service upgrade to ${plan.name} (${params.billingCycle})`
    });
    if (this.supabase) {
      await this.supabase.from("organizations").update({
        status: "active",
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      }).eq("id", orgId);
    } else {
      const memOrg = this.orgs.get(orgId);
      if (memOrg) {
        memOrg.status = "active";
        memOrg.licenseTier = params.tier;
        memOrg.licenseKey = upgradedLicense.key;
        memOrg.renewalDate = upgradedLicense.expiresDate;
        memOrg.billingCycle = params.billingCycle;
        memOrg.maxCapacity = upgradedLicense.seatsLimit;
        memOrg.sitesLimit = upgradedLicense.sitesLimit ?? plan.sitesLimit;
        memOrg.features = { ...plan.featureFlags };
      }
    }
    const payment = await this.recordLicensePayment({
      licenseId: upgradedLicense.id,
      amount: Math.max(1, billedAmountUSD),
      currency: params.currency || "USD",
      method: params.paymentMethod,
      reference: params.paymentReference.trim(),
      notes: `Plan upgrade to ${plan.name} (${params.billingCycle})`,
      recordedById: params.actorId,
      recordedByEmail: params.actorEmail
    });
    const evaluation = await this.evaluateOrganizationLicense(orgId);
    const updatedOrg = await this.getOrganisationById(orgId);
    return {
      license: upgradedLicense,
      evaluation,
      organization: updatedOrg,
      payment
    };
  }
  async deleteAllLicensesForOrgInTest(organizationId) {
    if (!this.isTestRuntime) {
      throw new Error("deleteAllLicensesForOrgInTest is restricted to Vitest.");
    }
    const orgId = organizationId.toLowerCase();
    for (const [id, lic] of this.licenses.entries()) {
      if ((lic.organizationId || lic.tenantId).toLowerCase() === orgId) {
        this.licenses.delete(id);
      }
    }
  }
  async recordLicensePayment(params) {
    const lic = (await this.listLicenses()).find((l) => l.id === params.licenseId);
    if (!lic) throw new Error("License not found for payment");
    const orgId = (lic.organizationId || lic.tenantId).toLowerCase();
    const paidAt = params.paidAt || (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    if (this.supabase) {
      const { data, error } = await this.supabase.from("license_payments").insert({
        license_id: params.licenseId,
        organization_id: orgId,
        amount: params.amount,
        currency: params.currency,
        method: params.method,
        reference: params.reference,
        paid_at: paidAt,
        notes: params.notes || null,
        recorded_by: params.recordedById && UUID_REGEX2.test(params.recordedById) ? params.recordedById : null,
        recorded_by_email: params.recordedByEmail
      }).select("*").single();
      if (error || !data) throw new Error(`Failed to record payment: ${error?.message}`);
      return {
        id: String(data.id),
        licenseId: params.licenseId,
        organizationId: orgId,
        organizationName: lic.tenantName,
        amount: Number(data.amount),
        currency: data.currency,
        method: data.method,
        reference: String(data.reference),
        paidAt: String(data.paid_at),
        notes: data.notes || void 0,
        recordedByEmail: String(data.recorded_by_email || params.recordedByEmail),
        createdAt: String(data.created_at)
      };
    }
    const payment = {
      id: (0, import_crypto4.randomUUID)(),
      licenseId: params.licenseId,
      organizationId: orgId,
      organizationName: lic.tenantName,
      amount: params.amount,
      currency: params.currency,
      method: params.method,
      reference: params.reference,
      paidAt,
      notes: params.notes,
      recordedByEmail: params.recordedByEmail,
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    this.payments.unshift(payment);
    return payment;
  }
  async listPayments(organizationId) {
    this.assertDatabaseAvailable();
    if (this.supabase) {
      let query = this.supabase.from("license_payments").select("*, organizations(name)").order("paid_at", { ascending: false }).limit(300);
      if (organizationId) query = query.eq("organization_id", organizationId.toLowerCase());
      const { data, error } = await query;
      if (error) {
        throw new Error(`Failed to fetch payments from Supabase: ${error.message}`);
      }
      return (data || []).map((row) => ({
        id: String(row.id),
        licenseId: String(row.license_id),
        organizationId: String(row.organization_id).toLowerCase(),
        organizationName: row.organizations?.name || void 0,
        amount: Number(row.amount),
        currency: row.currency,
        method: row.method,
        reference: String(row.reference),
        paidAt: String(row.paid_at),
        notes: row.notes || void 0,
        recordedByEmail: String(row.recorded_by_email || "creator"),
        createdAt: String(row.created_at)
      }));
    }
    return organizationId ? this.payments.filter((p) => p.organizationId === organizationId.toLowerCase()) : [...this.payments];
  }
  // ===========================================================================
  // PRIVACY-SAFE NIGHTLY ROLLUP, ALERTS & AGGREGATE TELEMETRY
  // ===========================================================================
  computeOrg30dAggregateCheckins(organizationId) {
    const orgId = organizationId.toLowerCase();
    const cutoff = Date.now() - 30 * DAY_MS;
    const live = (this.checkinsByOrg.get(orgId) || []).filter(
      (c) => new Date(c.checkedInIso).getTime() >= cutoff
    ).length;
    let rolled = 0;
    for (const row of this.usageDaily.values()) {
      if (row.organizationId === orgId && new Date(row.usageDate).getTime() >= cutoff) {
        rolled += row.checkinsCount;
      }
    }
    return Math.max(live, rolled);
  }
  async runNightlyUsageRollup(targetDateIso) {
    this.assertDatabaseAvailable();
    const dateStr = targetDateIso && /^\d{4}-\d{2}-\d{2}$/.test(targetDateIso) ? targetDateIso : (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    if (this.supabase) {
      const { data, error } = await this.supabase.rpc("rollup_usage_daily", {
        p_target_date: dateStr
      });
      if (error) {
        throw new Error(`Failed to run usage rollup in Supabase: ${error.message}`);
      }
      return {
        targetDate: dateStr,
        organizationsProcessed: Number(data?.organizationsProcessed ?? 0),
        alertsGenerated: Number(data?.alertsUpserted ?? 0)
      };
    }
    const orgs = await this.listOrganisations();
    let alertsGenerated = 0;
    for (const org of orgs) {
      if (org.status === "archived") continue;
      const orgId = org.id.toLowerCase();
      const checkins = (this.checkinsByOrg.get(orgId) || []).filter(
        (c) => c.checkedInIso.startsWith(dateStr)
      );
      const rawEvents = (this.rawEventsByOrg.get(orgId) || []).filter(
        (e) => e.server_time.startsWith(dateStr)
      );
      const sites = await this.getSitesForOrg(orgId);
      const subs = await this.getPushSubscriptions(orgId);
      const uniqueUsers = new Set(checkins.map((c) => c.personId)).size;
      const flaggedCount = rawEvents.filter((e) => e.status === "flagged").length;
      const rejectedCount = rawEvents.filter((e) => e.status === "rejected").length;
      const mockLocationAttempts = rawEvents.filter(
        (e) => e.is_mock || e.flag_reasons.includes("mock_location")
      ).length;
      const latestActivity = checkins[0]?.checkedInIso || rawEvents[0]?.server_time || org.lastActivityAt || null;
      const row = {
        organizationId: orgId,
        organizationName: org.name,
        usageDate: dateStr,
        activeUsers: uniqueUsers,
        checkinsCount: checkins.length,
        flaggedCount,
        rejectedCount,
        mockLocationAttempts,
        sitesCount: sites.length,
        pushSubscribers: subs.length,
        lastActivityAt: latestActivity
      };
      this.usageDaily.set(`${orgId}::${dateStr}`, row);
      const evalLic = await this.evaluateOrganizationLicense(orgId);
      if (evalLic.daysRemaining !== null && evalLic.daysRemaining <= 30 && ["active", "trial", "grace_period"].includes(evalLic.status)) {
        this.upsertAlertInternal({
          dedupeKey: `expiring:${orgId}:${evalLic.expiresDate}`,
          organizationId: orgId,
          organizationName: org.name,
          alertType: "expiring_license",
          severity: evalLic.daysRemaining <= 7 || evalLic.inGracePeriod ? "critical" : "warning",
          title: `License expiring for ${org.name}`,
          message: `${evalLic.tier?.replace("_", " ")} (${evalLic.status}) expires ${evalLic.expiresDate}.`
        });
        alertsGenerated++;
      }
      if (evalLic.seatsLimit > 0 && evalLic.seatsUsed >= evalLic.seatsLimit || evalLic.sitesLimit > 0 && evalLic.sitesUsed >= evalLic.sitesLimit) {
        this.upsertAlertInternal({
          dedupeKey: `limit:${orgId}`,
          organizationId: orgId,
          organizationName: org.name,
          alertType: "limit_exceeded",
          severity: "warning",
          title: `Capacity limit reached for ${org.name}`,
          message: `Seats ${evalLic.seatsUsed}/${evalLic.seatsLimit}, Sites ${evalLic.sitesUsed}/${evalLic.sitesLimit}.`
        });
        alertsGenerated++;
      }
      if (sites.length === 0) {
        this.upsertAlertInternal({
          dedupeKey: `geofence:${orgId}`,
          organizationId: orgId,
          organizationName: org.name,
          alertType: "geofence_not_configured",
          severity: "warning",
          title: `Geofence not configured for ${org.name}`,
          message: "No active campus geofence coordinates are configured."
        });
        alertsGenerated++;
      }
      if (!org.smsConfigured && !org.pushConfigured && subs.length === 0) {
        this.upsertAlertInternal({
          dedupeKey: `comms:${orgId}`,
          organizationId: orgId,
          organizationName: org.name,
          alertType: "comms_not_configured",
          severity: "info",
          title: `SMS & Push unconfigured for ${org.name}`,
          message: "Neither SMS gateway nor Web Push subscribers are active yet."
        });
        alertsGenerated++;
      }
      if (mockLocationAttempts >= 3) {
        this.upsertAlertInternal({
          dedupeKey: `spoof:${orgId}:${dateStr}`,
          organizationId: orgId,
          organizationName: org.name,
          alertType: "high_spoofing_rate",
          severity: "critical",
          title: `High GPS spoofing rate at ${org.name}`,
          message: `${mockLocationAttempts} mock-location attempts blocked on ${dateStr}.`
        });
        alertsGenerated++;
      }
    }
    return {
      targetDate: dateStr,
      organizationsProcessed: orgs.length,
      alertsGenerated
    };
  }
  upsertAlertInternal(params) {
    const existing = this.alerts.get(params.dedupeKey);
    if (existing && existing.status === "resolved") return;
    this.alerts.set(params.dedupeKey, {
      id: existing?.id || (0, import_crypto4.randomUUID)(),
      organizationId: params.organizationId,
      organizationName: params.organizationName,
      alertType: params.alertType,
      severity: params.severity,
      status: existing?.status || "open",
      title: params.title,
      message: params.message,
      createdAt: existing?.createdAt || (/* @__PURE__ */ new Date()).toISOString(),
      acknowledgedAt: existing?.acknowledgedAt || null,
      resolvedAt: null
    });
  }
  async listUsageDaily(organizationId, days = 30) {
    this.assertDatabaseAvailable();
    const cutoffDate = new Date(Date.now() - days * DAY_MS).toISOString().slice(0, 10);
    if (this.supabase) {
      let query = this.supabase.from("usage_daily").select("*, organizations(name)").gte("usage_date", cutoffDate).order("usage_date", { ascending: false });
      if (organizationId) query = query.eq("organization_id", organizationId.toLowerCase());
      const { data, error } = await query;
      if (error) {
        throw new Error(`Failed to fetch usage_daily from Supabase: ${error.message}`);
      }
      return (data || []).map((row) => ({
        organizationId: String(row.organization_id).toLowerCase(),
        organizationName: row.organizations?.name || void 0,
        usageDate: String(row.usage_date),
        activeUsers: Number(row.active_users ?? 0),
        checkinsCount: Number(row.checkins_count ?? 0),
        flaggedCount: Number(row.flagged_count ?? 0),
        rejectedCount: Number(row.rejected_count ?? 0),
        mockLocationAttempts: Number(row.mock_location_attempts ?? 0),
        sitesCount: Number(row.sites_count ?? 0),
        pushSubscribers: Number(row.push_subscribers ?? 0),
        lastActivityAt: row.last_activity_at || null
      }));
    }
    await this.runNightlyUsageRollup((/* @__PURE__ */ new Date()).toISOString().slice(0, 10));
    return Array.from(this.usageDaily.values()).filter((u) => {
      if (organizationId && u.organizationId !== organizationId.toLowerCase()) return false;
      return u.usageDate >= cutoffDate;
    }).sort((a, b) => b.usageDate.localeCompare(a.usageDate));
  }
  async listAlerts(filters) {
    this.assertDatabaseAvailable();
    if (this.supabase) {
      let query = this.supabase.from("alerts").select("*, organizations(name)").order("created_at", { ascending: false });
      if (filters?.status && filters.status !== "all") query = query.eq("status", filters.status);
      if (filters?.severity && filters.severity !== "all") query = query.eq("severity", filters.severity);
      const { data, error } = await query;
      if (error) {
        throw new Error(`Failed to fetch alerts from Supabase: ${error.message}`);
      }
      return (data || []).map((row) => ({
        id: String(row.id),
        organizationId: row.organization_id ? String(row.organization_id).toLowerCase() : null,
        organizationName: row.organizations?.name || void 0,
        alertType: row.alert_type,
        severity: row.severity,
        status: row.status,
        title: String(row.title),
        message: String(row.message),
        metadata: row.metadata || {},
        createdAt: String(row.created_at),
        acknowledgedAt: row.acknowledged_at || null,
        resolvedAt: row.resolved_at || null
      }));
    }
    return Array.from(this.alerts.values()).filter((a) => {
      if (filters?.status && filters.status !== "all" && a.status !== filters.status) return false;
      if (filters?.severity && filters.severity !== "all" && a.severity !== filters.severity) return false;
      return true;
    });
  }
  async updateAlertStatus(alertId, status) {
    this.assertDatabaseAvailable();
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    if (this.supabase) {
      const patch = status === "acknowledged" ? { status: "acknowledged", acknowledged_at: nowIso } : { status: "resolved", resolved_at: nowIso };
      const { data, error } = await this.supabase.from("alerts").update(patch).eq("id", alertId).select("*, organizations(name)").single();
      if (error || !data) throw new Error("Alert not found");
      return {
        id: String(data.id),
        organizationId: data.organization_id,
        organizationName: data.organizations?.name,
        alertType: data.alert_type,
        severity: data.severity,
        status: data.status,
        title: data.title,
        message: data.message,
        createdAt: data.created_at,
        acknowledgedAt: data.acknowledged_at,
        resolvedAt: data.resolved_at
      };
    }
    for (const [key, item] of this.alerts.entries()) {
      if (item.id === alertId) {
        const updated = {
          ...item,
          status,
          acknowledgedAt: status === "acknowledged" ? nowIso : item.acknowledgedAt,
          resolvedAt: status === "resolved" ? nowIso : item.resolvedAt
        };
        this.alerts.set(key, updated);
        return updated;
      }
    }
    throw new Error("Alert not found");
  }
  // ===========================================================================
  // ANNOUNCEMENTS, FEATURE FLAGS, DATA REQUESTS, SUPPORT GRANTS, LANDING CMS
  // ===========================================================================
  async listAnnouncements() {
    this.assertDatabaseAvailable();
    if (this.supabase) {
      const { data, error } = await this.supabase.from("announcements").select("*").order("created_at", { ascending: false });
      if (error) {
        throw new Error(`Failed to fetch announcements from Supabase: ${error.message}`);
      }
      return (data || []).map((row) => ({
        id: String(row.id),
        title: String(row.title),
        body: String(row.body),
        severity: row.severity,
        targetTiers: row.target_tiers || [],
        targetOrganizationIds: row.target_organization_ids || [],
        active: Boolean(row.active),
        startsAt: String(row.starts_at),
        expiresAt: row.expires_at || null,
        createdByEmail: row.created_by_email || void 0,
        createdAt: String(row.created_at)
      }));
    }
    return Array.from(this.announcements.values());
  }
  async createAnnouncement(params) {
    this.assertDatabaseAvailable();
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    if (this.supabase) {
      const { data, error } = await this.supabase.from("announcements").insert({
        title: params.title,
        body: params.body,
        severity: params.severity,
        target_tiers: params.targetTiers || [],
        target_organization_ids: params.targetOrganizationIds || [],
        expires_at: params.expiresAt || null,
        created_by_email: params.createdByEmail,
        active: true
      }).select("*").single();
      if (error || !data) throw new Error(`Failed to create announcement: ${error?.message}`);
      return {
        id: String(data.id),
        title: data.title,
        body: data.body,
        severity: data.severity,
        targetTiers: data.target_tiers || [],
        targetOrganizationIds: data.target_organization_ids || [],
        active: Boolean(data.active),
        startsAt: data.starts_at,
        expiresAt: data.expires_at,
        createdByEmail: data.created_by_email,
        createdAt: data.created_at
      };
    }
    const item = {
      id: (0, import_crypto4.randomUUID)(),
      title: params.title,
      body: params.body,
      severity: params.severity,
      targetTiers: params.targetTiers || [],
      targetOrganizationIds: params.targetOrganizationIds || [],
      active: true,
      startsAt: nowIso,
      expiresAt: params.expiresAt || null,
      createdByEmail: params.createdByEmail,
      createdAt: nowIso
    };
    this.announcements.set(item.id, item);
    return item;
  }
  async toggleAnnouncement(id, active) {
    this.assertDatabaseAvailable();
    if (this.supabase) {
      const { data, error } = await this.supabase.from("announcements").update({ active, updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", id).select("*").single();
      if (error || !data) throw new Error("Announcement not found");
      return {
        id: String(data.id),
        title: data.title,
        body: data.body,
        severity: data.severity,
        targetTiers: data.target_tiers || [],
        targetOrganizationIds: data.target_organization_ids || [],
        active: Boolean(data.active),
        startsAt: data.starts_at,
        expiresAt: data.expires_at,
        createdAt: data.created_at
      };
    }
    const existing = this.announcements.get(id);
    if (!existing) throw new Error("Announcement not found");
    const updated = { ...existing, active };
    this.announcements.set(id, updated);
    return updated;
  }
  async listFeatureFlags() {
    this.assertDatabaseAvailable();
    if (this.supabase) {
      const { data, error } = await this.supabase.from("feature_flags").select("*").order("key", { ascending: true });
      if (error) {
        throw new Error(`Failed to fetch feature flags from Supabase: ${error.message}`);
      }
      return (data || []).map((row) => ({
        key: String(row.key),
        name: String(row.name),
        description: String(row.description || ""),
        enabledGlobally: Boolean(row.enabled_globally),
        enabledTiers: row.enabled_tiers || [],
        organizationOverrides: row.organization_overrides || {},
        updatedAt: String(row.updated_at)
      }));
    }
    return Array.from(this.featureFlags.values());
  }
  async upsertFeatureFlag(key, updates) {
    this.assertDatabaseAvailable();
    if (this.supabase) {
      const { data: existingRow } = await this.supabase.from("feature_flags").select("*").eq("key", key).maybeSingle();
      const merged2 = {
        key,
        name: updates.name,
        description: updates.description ?? existingRow?.description ?? "",
        enabledGlobally: updates.enabledGlobally,
        enabledTiers: updates.enabledTiers,
        organizationOverrides: updates.organizationOverrides ?? existingRow?.organization_overrides ?? {},
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      const { error } = await this.supabase.from("feature_flags").upsert({
        key: merged2.key,
        name: merged2.name,
        description: merged2.description,
        enabled_globally: merged2.enabledGlobally,
        enabled_tiers: merged2.enabledTiers,
        organization_overrides: merged2.organizationOverrides,
        updated_at: merged2.updatedAt
      });
      if (error) {
        throw new Error(`Failed to save feature flag in Supabase: ${error.message}`);
      }
      return merged2;
    }
    const existing = this.featureFlags.get(key);
    const merged = {
      key,
      name: updates.name,
      description: updates.description ?? existing?.description ?? "",
      enabledGlobally: updates.enabledGlobally,
      enabledTiers: updates.enabledTiers,
      organizationOverrides: updates.organizationOverrides ?? existing?.organizationOverrides ?? {},
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    this.featureFlags.set(key, merged);
    return merged;
  }
  async listDataRequests() {
    this.assertDatabaseAvailable();
    if (this.supabase) {
      const { data, error } = await this.supabase.from("data_requests").select("*, organizations(name)").order("created_at", { ascending: false });
      if (error) {
        throw new Error(`Failed to fetch data requests from Supabase: ${error.message}`);
      }
      return (data || []).map((row) => ({
        id: String(row.id),
        organizationId: String(row.organization_id).toLowerCase(),
        organizationName: row.organizations?.name || void 0,
        requestType: row.request_type,
        status: row.status,
        requestedByEmail: String(row.requested_by_email),
        reason: row.reason || void 0,
        notes: row.notes || void 0,
        dueAt: String(row.due_at),
        completedAt: row.completed_at || null,
        createdAt: String(row.created_at)
      }));
    }
    return Array.from(this.dataRequests.values());
  }
  async createDataRequest(params) {
    const orgId = params.organizationId.toLowerCase();
    const org = await this.getOrganisationById(orgId);
    if (!org) throw new Error("Organisation not found");
    const now = /* @__PURE__ */ new Date();
    const dueAt = new Date(now.getTime() + 30 * DAY_MS).toISOString();
    if (this.supabase) {
      const { data, error } = await this.supabase.from("data_requests").insert({
        organization_id: orgId,
        request_type: params.requestType,
        requested_by_email: params.requestedByEmail,
        reason: params.reason || null,
        notes: params.notes || null,
        due_at: dueAt
      }).select("*").single();
      if (error || !data) throw new Error(`Failed to create data request: ${error?.message}`);
      return {
        id: String(data.id),
        organizationId: orgId,
        organizationName: org.name,
        requestType: data.request_type,
        status: data.status,
        requestedByEmail: data.requested_by_email,
        reason: data.reason,
        notes: data.notes,
        dueAt: data.due_at,
        completedAt: data.completed_at,
        createdAt: data.created_at
      };
    }
    const reqItem = {
      id: (0, import_crypto4.randomUUID)(),
      organizationId: orgId,
      organizationName: org.name,
      requestType: params.requestType,
      status: "pending",
      requestedByEmail: params.requestedByEmail,
      reason: params.reason,
      notes: params.notes,
      dueAt,
      completedAt: null,
      createdAt: now.toISOString()
    };
    this.dataRequests.set(reqItem.id, reqItem);
    return reqItem;
  }
  async updateDataRequestStatus(id, status, notes) {
    const completedAt = status === "completed" ? (/* @__PURE__ */ new Date()).toISOString() : null;
    if (this.supabase) {
      const { data, error } = await this.supabase.from("data_requests").update({ status, notes, completed_at: completedAt, updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", id).select("*, organizations(name)").single();
      if (error || !data) throw new Error("Data request not found");
      return {
        id: String(data.id),
        organizationId: String(data.organization_id).toLowerCase(),
        organizationName: data.organizations?.name,
        requestType: data.request_type,
        status: data.status,
        requestedByEmail: data.requested_by_email,
        reason: data.reason,
        notes: data.notes,
        dueAt: data.due_at,
        completedAt: data.completed_at,
        createdAt: data.created_at
      };
    }
    const existing = this.dataRequests.get(id);
    if (!existing) throw new Error("Data request not found");
    const updated = {
      ...existing,
      status,
      notes: notes ?? existing.notes,
      completedAt
    };
    this.dataRequests.set(id, updated);
    return updated;
  }
  async createSupportGrant(params) {
    const orgId = params.organizationId.toLowerCase();
    const org = await this.getOrganisationById(orgId);
    if (!org) throw new Error("Organisation not found");
    const starts = /* @__PURE__ */ new Date();
    const clampedMinutes = Math.min(120, Math.max(5, params.durationMinutes));
    const expires = new Date(starts.getTime() + clampedMinutes * 60 * 1e3);
    if (this.supabase) {
      const { data, error } = await this.supabase.from("support_grants").insert({
        organization_id: orgId,
        creator_user_id: toDeterministicUuid(params.creatorUserId),
        creator_email: params.creatorEmail,
        reason: params.reason.trim(),
        access_level: "read_only_admin",
        starts_at: starts.toISOString(),
        expires_at: expires.toISOString()
      }).select("*").single();
      if (error || !data) throw new Error(`Failed to create support grant: ${error?.message}`);
      return {
        id: String(data.id),
        organizationId: orgId,
        organizationName: org.name,
        creatorUserId: params.creatorUserId,
        creatorEmail: params.creatorEmail,
        reason: data.reason,
        accessLevel: "read_only_admin",
        startsAt: data.starts_at,
        expiresAt: data.expires_at,
        revokedAt: null,
        active: true
      };
    }
    const grant = {
      id: (0, import_crypto4.randomUUID)(),
      organizationId: orgId,
      organizationName: org.name,
      creatorUserId: params.creatorUserId,
      creatorEmail: params.creatorEmail,
      reason: params.reason.trim(),
      accessLevel: "read_only_admin",
      startsAt: starts.toISOString(),
      expiresAt: expires.toISOString(),
      revokedAt: null,
      active: true
    };
    this.supportGrants.set(grant.id, grant);
    return grant;
  }
  async verifyActiveSupportGrant(grantId, creatorUserId) {
    const nowMs = Date.now();
    if (this.supabase) {
      const { data, error } = await this.supabase.from("support_grants").select("*").eq("id", grantId).is("revoked_at", null).maybeSingle();
      if (error || !data) return null;
      const expectedUuid = toDeterministicUuid(creatorUserId);
      if (String(data.creator_user_id).toLowerCase() !== expectedUuid) return null;
      if (new Date(data.expires_at).getTime() <= nowMs) return null;
      return {
        id: String(data.id),
        organizationId: String(data.organization_id).toLowerCase(),
        creatorUserId,
        reason: String(data.reason),
        expiresAt: String(data.expires_at)
      };
    }
    const grant = this.supportGrants.get(grantId);
    if (!grant) return null;
    if (grant.creatorUserId !== creatorUserId) return null;
    if (grant.revokedAt) return null;
    if (new Date(grant.expiresAt).getTime() <= nowMs) return null;
    return {
      id: grant.id,
      organizationId: grant.organizationId,
      creatorUserId: grant.creatorUserId,
      reason: grant.reason,
      expiresAt: grant.expiresAt
    };
  }
  async revokeSupportGrant(grantId) {
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    if (this.supabase) {
      const { data, error } = await this.supabase.from("support_grants").update({ revoked_at: nowIso }).eq("id", grantId).select("*, organizations(name)").single();
      if (error || !data) throw new Error("Support grant not found");
      return {
        id: String(data.id),
        organizationId: String(data.organization_id).toLowerCase(),
        organizationName: data.organizations?.name || "Organisation",
        creatorUserId: String(data.creator_user_id),
        creatorEmail: String(data.creator_email),
        reason: String(data.reason),
        accessLevel: "read_only_admin",
        startsAt: String(data.starts_at),
        expiresAt: String(data.expires_at),
        revokedAt: nowIso,
        active: false
      };
    }
    const grant = this.supportGrants.get(grantId);
    if (!grant) throw new Error("Support grant not found");
    const updated = { ...grant, revokedAt: nowIso, active: false };
    this.supportGrants.set(grantId, updated);
    return updated;
  }
  async listSupportGrants() {
    this.assertDatabaseAvailable();
    const nowMs = Date.now();
    if (this.supabase) {
      const { data, error } = await this.supabase.from("support_grants").select("*, organizations(name)").order("created_at", { ascending: false }).limit(100);
      if (error) {
        throw new Error(`Failed to fetch support grants from Supabase: ${error.message}`);
      }
      return (data || []).map((row) => ({
        id: String(row.id),
        organizationId: String(row.organization_id).toLowerCase(),
        organizationName: row.organizations?.name || "Organisation",
        creatorUserId: String(row.creator_user_id),
        creatorEmail: String(row.creator_email),
        reason: String(row.reason),
        accessLevel: "read_only_admin",
        startsAt: String(row.starts_at),
        expiresAt: String(row.expires_at),
        revokedAt: row.revoked_at || null,
        active: !row.revoked_at && new Date(row.expires_at).getTime() > nowMs
      }));
    }
    return Array.from(this.supportGrants.values()).map((g) => ({
      ...g,
      active: !g.revokedAt && new Date(g.expiresAt).getTime() > nowMs
    }));
  }
  async getLandingConfig() {
    this.assertDatabaseAvailable();
    if (this.supabase) {
      const { data, error } = await this.supabase.from("landing_cms_config").select("config").eq("id", "default").maybeSingle();
      if (error && !/does not exist|schema cache|42P01/i.test(error.message || "")) {
        throw new Error(`Failed to load landing CMS config from Supabase: ${error.message}`);
      }
      return data?.config ? { ...DEFAULT_LANDING_CMS, ...data.config } : { ...DEFAULT_LANDING_CMS };
    }
    return { ...this.landingConfig };
  }
  async updateLandingConfig(updates, actorEmail) {
    this.assertDatabaseAvailable();
    const current = await this.getLandingConfig();
    const merged = {
      ...current,
      ...updates,
      featuredStats: {
        ...current.featuredStats,
        ...updates.featuredStats || {}
      }
    };
    if (this.supabase) {
      const { error } = await this.supabase.from("landing_cms_config").upsert({
        id: "default",
        config: merged,
        updated_by_email: actorEmail,
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      });
      if (error) {
        throw new Error(`Failed to persist landing CMS config in Supabase: ${error.message}`);
      }
      return merged;
    }
    this.landingConfig = merged;
    return merged;
  }
  mapLandingLeadRow(row) {
    return {
      id: String(row.id),
      leadType: row.lead_type || "demo_request",
      email: String(row.email || ""),
      fullName: row.full_name || null,
      phone: row.phone || null,
      churchName: String(row.church_name || ""),
      interest: row.interest || null,
      message: row.message || null,
      sourceSection: row.source_section || null,
      status: row.status || "new",
      creatorNotes: row.creator_notes || null,
      assignedOrganizationId: row.assigned_organization_id || null,
      contactedAt: row.contacted_at || null,
      convertedAt: row.converted_at || null,
      metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {},
      createdAt: String(row.created_at || (/* @__PURE__ */ new Date()).toISOString()),
      updatedAt: String(row.updated_at || row.created_at || (/* @__PURE__ */ new Date()).toISOString())
    };
  }
  async createLandingLead(input) {
    this.assertDatabaseAvailable();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const id = (0, import_crypto4.randomUUID)();
    const cleanEmail = input.email.trim().toLowerCase();
    const cleanChurch = input.churchName.trim() || "Prospective Church";
    const record = {
      id,
      leadType: input.leadType || "demo_request",
      email: cleanEmail,
      fullName: input.fullName?.trim() || null,
      phone: input.phone?.trim() || null,
      churchName: cleanChurch,
      interest: input.interest?.trim() || null,
      message: input.message?.trim() || null,
      sourceSection: input.sourceSection?.trim() || "landing_page",
      status: "new",
      creatorNotes: null,
      assignedOrganizationId: null,
      contactedAt: null,
      convertedAt: null,
      metadata: input.metadata || {},
      createdAt: now,
      updatedAt: now
    };
    if (this.supabase) {
      const { data, error } = await this.supabase.from("landing_leads").insert({
        id: record.id,
        lead_type: record.leadType,
        email: record.email,
        full_name: record.fullName,
        phone: record.phone,
        church_name: record.churchName,
        interest: record.interest,
        message: record.message,
        source_section: record.sourceSection,
        status: "new",
        metadata: record.metadata,
        created_at: now,
        updated_at: now
      }).select("*").single();
      if (!error && data) {
        const mapped = this.mapLandingLeadRow(data);
        this.landingLeads.set(mapped.id, mapped);
        return mapped;
      }
      if (error && !/does not exist|schema cache|42P01|PGRST205/i.test(error.message || "")) {
        throw new Error(`Failed to persist landing lead in Supabase: ${error.message}`);
      }
    }
    this.landingLeads.set(record.id, record);
    return record;
  }
  async listLandingLeads(filter) {
    this.assertDatabaseAvailable();
    let list = Array.from(this.landingLeads.values());
    if (this.supabase) {
      const { data, error } = await this.supabase.from("landing_leads").select("*").order("created_at", { ascending: false }).limit(250);
      if (!error && Array.isArray(data)) {
        const fromDb = data.map((r) => this.mapLandingLeadRow(r));
        const seen = new Set(fromDb.map((r) => r.id));
        list = [...fromDb, ...list.filter((local) => !seen.has(local.id))];
      } else if (error && !/does not exist|schema cache|42P01|PGRST205/i.test(error.message || "")) {
        throw new Error(`Failed to load landing leads from Supabase: ${error.message}`);
      }
    }
    return list.filter((item) => {
      if (filter?.status && filter.status !== "all" && item.status !== filter.status) return false;
      if (filter?.leadType && filter.leadType !== "all" && item.leadType !== filter.leadType) return false;
      return true;
    }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
  async updateLandingLead(id, patch) {
    this.assertDatabaseAvailable();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const existingList = await this.listLandingLeads();
    const current = existingList.find((l) => l.id === id);
    if (!current) {
      const err = new Error("Landing lead not found.");
      err.status = 404;
      err.code = "NOT_FOUND";
      throw err;
    }
    const nextStatus = patch.status ?? current.status;
    const contactedAt = nextStatus === "contacted" && !current.contactedAt ? now : current.contactedAt || null;
    const convertedAt = nextStatus === "converted" && !current.convertedAt ? now : current.convertedAt || null;
    const updated = {
      ...current,
      status: nextStatus,
      creatorNotes: patch.creatorNotes !== void 0 ? patch.creatorNotes : current.creatorNotes,
      assignedOrganizationId: patch.assignedOrganizationId !== void 0 ? patch.assignedOrganizationId : current.assignedOrganizationId,
      contactedAt,
      convertedAt,
      updatedAt: now
    };
    if (this.supabase) {
      const { data, error } = await this.supabase.from("landing_leads").update({
        status: updated.status,
        creator_notes: updated.creatorNotes,
        assigned_organization_id: updated.assignedOrganizationId,
        contacted_at: updated.contactedAt,
        converted_at: updated.convertedAt,
        updated_at: now
      }).eq("id", id).select("*").maybeSingle();
      if (!error && data) {
        const mapped = this.mapLandingLeadRow(data);
        this.landingLeads.set(mapped.id, mapped);
        return mapped;
      }
      if (error && !/does not exist|schema cache|42P01|PGRST205/i.test(error.message || "")) {
        throw new Error(`Failed to update landing lead in Supabase: ${error.message}`);
      }
    }
    this.landingLeads.set(updated.id, updated);
    return updated;
  }
  async markMatchingLandingLeadsConverted(email, organizationId) {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) return;
    const now = (/* @__PURE__ */ new Date()).toISOString();
    for (const [id, lead] of this.landingLeads.entries()) {
      if (lead.email.toLowerCase() === cleanEmail && lead.status !== "converted") {
        this.landingLeads.set(id, {
          ...lead,
          status: "converted",
          assignedOrganizationId: organizationId,
          convertedAt: now,
          updatedAt: now
        });
      }
    }
    if (this.supabase) {
      await this.supabase.from("landing_leads").update({
        status: "converted",
        assigned_organization_id: organizationId,
        converted_at: now,
        updated_at: now
      }).ilike("email", cleanEmail).neq("status", "converted");
    }
  }
  async convertLandingLeadToOrganization(leadId, actorEmail) {
    const leads = await this.listLandingLeads();
    const lead = leads.find((l) => l.id === leadId);
    if (!lead) {
      const err = new Error("Landing lead not found.");
      err.status = 404;
      err.code = "NOT_FOUND";
      throw err;
    }
    const { organisation, license } = await this.createOrganisation({
      name: lead.churchName,
      orgType: "church",
      city: "Accra",
      country: "Ghana",
      seniorPastor: lead.fullName || void 0,
      contactName: lead.fullName || void 0,
      contactEmail: lead.email,
      contactPhone: lead.phone || void 0,
      initialPlan: "grace_starter",
      autoIssueTrial: true
    });
    const issuedLicense = license || await this.issueLicense({
      organizationId: organisation.id,
      tier: "grace_starter",
      billingCycle: "annual",
      status: "trial",
      notes: "Trial provisioned from landing lead conversion"
    });
    const updatedLead = await this.updateLandingLead(lead.id, {
      status: "converted",
      assignedOrganizationId: organisation.id,
      creatorNotes: lead.creatorNotes || `Converted to 14-day trial workspace (${organisation.slug}) by ${actorEmail}.`
    });
    return { lead: updatedLead, organisation, license: issuedLicense };
  }
  async getOrganizationSessionTimeoutMinutes(organizationId) {
    if (!organizationId) return DEFAULT_IDLE_SESSION_TIMEOUT_MINUTES;
    try {
      const res = await this.getSystemSettings(organizationId);
      return normalizeIdleTimeoutMinutes(res.settings.sessionTimeoutMinutes);
    } catch {
      return DEFAULT_IDLE_SESSION_TIMEOUT_MINUTES;
    }
  }
  async getPublicLandingOverview() {
    this.assertDatabaseAvailable();
    const [landingConfig, allPlans, orgs, usage] = await Promise.all([
      this.getLandingConfig(),
      this.listPlans(),
      this.listOrganisations(),
      this.listUsageDaily(void 0, 90)
    ]);
    const activeOrgs = orgs.filter((o) => o.status !== "archived" && o.status !== "suspended");
    const activeSitesCount = activeOrgs.reduce((acc, o) => acc + (o.sitesCount || 0), 0);
    const totalCheckinsRecorded = usage.reduce((acc, u) => acc + (u.checkinsCount || 0), 0);
    return {
      landingConfig,
      plans: allPlans.filter((p) => p.isActive),
      liveStats: {
        activeChurchesCount: activeOrgs.length,
        activeSitesCount,
        totalCheckinsRecorded
      }
    };
  }
  // ===========================================================================
  // ORGANISATION 6-TAB DETAIL & DASHBOARD AGGREGATES (STRICT PRIVACY)
  // ===========================================================================
  async getOrganisationDetail(organizationId) {
    const orgId = organizationId.toLowerCase();
    const organisation = await this.getOrganisationById(orgId);
    if (!organisation) return null;
    const license = await this.getLatestLicenseForOrg(orgId);
    const evaluation = await this.evaluateOrganizationLicense(orgId);
    const payments = await this.listPayments(orgId);
    const usageDaily = await this.listUsageDaily(orgId, 30);
    const sites = await this.getSitesForOrg(orgId);
    const audit = await this.listAuditLogs({ organizationId: orgId, limit: 100 });
    const members = await this.getMembers(orgId);
    const staffByRole = {
      admin: 1,
      pastor: 0,
      usher: 0,
      finance: 0,
      group_leader: 0,
      member: 0
    };
    let visitorsCount = 0;
    let optedInProximityCount = 0;
    const staffAccounts = [];
    for (const m of members) {
      const role = String(m.role || "member");
      staffByRole[role] = (staffByRole[role] || 0) + 1;
      if (m.status === "visitor") visitorsCount++;
      if (m.autoCheckinOptedIn) optedInProximityCount++;
      if (["owner", "admin", "pastor", "usher", "finance"].includes(role)) {
        staffAccounts.push({
          id: String(m.id).slice(0, 8),
          role,
          status: String(m.status || "active"),
          joinedAt: String(m.joinedOn || m.created_at || (/* @__PURE__ */ new Date()).toISOString().slice(0, 10))
        });
      }
    }
    return {
      organisation,
      license,
      evaluation,
      payments,
      usageDaily,
      usersSummary: {
        totalMembersCount: Math.max(members.length, organisation.memberCount),
        visitorsCount,
        optedInProximityCount,
        staffByRole,
        staffAccounts
      },
      sites: sites.map((s) => ({
        id: s.id,
        name: s.name,
        address: s.address,
        lat: s.lat,
        lng: s.lng,
        radius_m: s.radius_m,
        outer_radius_m: s.outer_radius_m,
        active: s.active
      })),
      audit
    };
  }
  async getDashboardSummary() {
    const orgs = await this.listOrganisations();
    const licenses = await this.listLicenses();
    const payments = await this.listPayments();
    const usage = await this.listUsageDaily(void 0, 30);
    const openAlerts = await this.listAlerts({ status: "open" });
    const organisationsByStatus = {
      active: 0,
      trial: 0,
      suspended: 0,
      archived: 0
    };
    for (const o of orgs) {
      organisationsByStatus[o.status] = (organisationsByStatus[o.status] || 0) + 1;
    }
    const licensesByTier = {
      grace_starter: 0,
      ministry_pro: 0,
      cathedral_enterprise: 0
    };
    const licensesByStatus = {
      active: 0,
      trial: 0,
      grace_period: 0,
      expired: 0,
      revoked: 0,
      suspended: 0
    };
    const nowMs = Date.now();
    const expiringIn7Days = [];
    const expiringIn30Days = [];
    let annualRunRateUSD = 0;
    for (const lic of licenses) {
      licensesByTier[lic.tier] = (licensesByTier[lic.tier] || 0) + 1;
      licensesByStatus[lic.status] = (licensesByStatus[lic.status] || 0) + 1;
      if (lic.status === "active" || lic.status === "grace_period") {
        annualRunRateUSD += lic.annualCostUSD;
      }
      const expMs = (/* @__PURE__ */ new Date(`${lic.expiresDate}T23:59:59Z`)).getTime();
      const diffDays = Math.ceil((expMs - nowMs) / DAY_MS);
      if (diffDays >= -7 && diffDays <= 7 && ["active", "trial", "grace_period"].includes(lic.status)) {
        expiringIn7Days.push(lic);
      }
      if (diffDays >= -7 && diffDays <= 30 && ["active", "trial", "grace_period"].includes(lic.status)) {
        expiringIn30Days.push(lic);
      }
    }
    let paymentsTotalGHS = 0;
    let paymentsTotalUSD = 0;
    for (const p of payments) {
      if (p.currency === "GHS") paymentsTotalGHS += p.amount;
      else paymentsTotalUSD += p.amount;
    }
    const trendMap = /* @__PURE__ */ new Map();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(nowMs - i * DAY_MS).toISOString().slice(0, 10);
      trendMap.set(d, { date: d, checkins: 0, flagged: 0, mockAttempts: 0 });
    }
    for (const u of usage) {
      const bucket = trendMap.get(u.usageDate);
      if (bucket) {
        bucket.checkins += u.checkinsCount;
        bucket.flagged += u.flaggedCount;
        bucket.mockAttempts += u.mockLocationAttempts;
      }
    }
    const topOrganisations = [...orgs].sort((a, b) => (b.checkins30d || 0) - (a.checkins30d || 0)).slice(0, 5).map((o) => ({
      id: o.id,
      name: o.name,
      city: o.city,
      tier: o.licenseTier,
      checkins30d: o.checkins30d || 0,
      seatsUsed: o.memberCount,
      seatsLimit: o.maxCapacity
    }));
    const fourteenDaysAgo = nowMs - 14 * DAY_MS;
    const inactiveOrganisations = orgs.filter((o) => {
      if (o.status === "archived") return false;
      if (!o.lastActivityAt && (o.checkins30d || 0) === 0) return true;
      return o.lastActivityAt ? new Date(o.lastActivityAt).getTime() < fourteenDaysAgo : false;
    }).map((o) => ({
      id: o.id,
      name: o.name,
      city: o.city,
      status: o.status,
      lastActivityAt: o.lastActivityAt || null
    }));
    const nearOrOverLimits = orgs.map((o) => {
      const seatsLimit = Math.max(1, o.maxCapacity);
      const sitesLimit = Math.max(1, o.sitesLimit || 1);
      const seatUtilizationPct = Math.round(o.memberCount / seatsLimit * 100);
      const siteUtilizationPct = Math.round((o.sitesCount || 0) / sitesLimit * 100);
      return {
        id: o.id,
        name: o.name,
        seatsUsed: o.memberCount,
        seatsLimit,
        sitesUsed: o.sitesCount || 0,
        sitesLimit,
        seatUtilizationPct,
        siteUtilizationPct
      };
    }).filter((item) => item.seatUtilizationPct >= 80 || item.siteUtilizationPct >= 80);
    const allLeads = await this.listLandingLeads({ status: "new" }).catch(() => []);
    return {
      organisationsByStatus,
      licensesByTier,
      licensesByStatus,
      expiringIn7Days,
      expiringIn30Days,
      annualRunRateUSD,
      paymentsTotalGHS,
      paymentsTotalUSD,
      checkinsTrend: Array.from(trendMap.values()),
      topOrganisations,
      inactiveOrganisations,
      nearOrOverLimits,
      openAlertsCount: openAlerts.length,
      newLandingLeadsCount: allLeads.length,
      storageBackend: this.storageBackend,
      generatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  // ===========================================================================
  // LEGACY TENANTS -> ORGANIZATIONS MIGRATION (Dry-Run & Live)
  // ===========================================================================
  seedLegacyTenantInTest(legacy) {
    if (!this.isTestRuntime) return;
    this.legacyTenantsForDryRun.push(legacy);
  }
  async migrateTenantsToOrganizations(dryRun = true) {
    this.assertDatabaseAvailable();
    if (this.supabase) {
      const { data, error } = await this.supabase.rpc("migrate_tenants_to_organizations", {
        p_dry_run: dryRun
      });
      if (error) throw new Error(`Migration RPC failed: ${error.message}`);
      return data || {};
    }
    const toInsert = this.legacyTenantsForDryRun.filter(
      (t) => !this.orgs.has(t.id.toLowerCase()) && !Array.from(this.orgs.values()).some((o) => o.slug.toLowerCase() === t.slug.toLowerCase())
    );
    if (dryRun) {
      return {
        dryRun: true,
        legacyTenantsTableFound: true,
        tenantsTotal: this.legacyTenantsForDryRun.length,
        organizationsToInsert: toInsert.length,
        organizationsAlreadyPresent: this.legacyTenantsForDryRun.length - toInsert.length,
        checkedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
    }
    for (const t of toInsert) {
      await this.createOrganisation({
        id: t.id,
        name: t.name,
        slug: t.slug,
        orgType: "church",
        autoIssueTrial: true
      });
    }
    return {
      dryRun: false,
      organizationsInserted: toInsert.length,
      completedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  // ===========================================================================
  // DONATIONS / MOBILE GIVING LEDGER (ORG-SCOPED)
  // ===========================================================================
  mapSupabaseDonationRow(row) {
    const fundName = String(row.fund_name || "General Tithe");
    const fundId = String(row.fund_key || row.fund_id || fundName.toLowerCase().replace(/\s+/g, "-"));
    const rawProvider = String(row.provider || "MTN MoMo");
    const provider = rawProvider === "Telecel Cash" || rawProvider === "Card" || rawProvider === "Cash" ? rawProvider : "MTN MoMo";
    const rawMethod = String(row.method || "momo");
    const method = rawMethod === "card" || rawMethod === "cash" || rawMethod === "bank" ? rawMethod : "momo";
    const rawStatus = String(row.status || "paid");
    const status = rawStatus === "pending" || rawStatus === "failed" ? rawStatus : "paid";
    const paidIso = String(row.paid_at || row.created_at || (/* @__PURE__ */ new Date()).toISOString());
    return {
      id: String(row.id),
      personId: row.member_id ? String(row.member_id) : row.person_id ? String(row.person_id) : void 0,
      personName: row.person_name ? String(row.person_name) : void 0,
      fundId,
      fundName,
      amountMinor: Number(row.amount_minor || 0),
      currency: "GHS",
      method,
      provider,
      status,
      paidAt: paidIso.slice(0, 10),
      ...row.reference ? { reference: String(row.reference) } : {}
    };
  }
  async listDonations(organizationId, filters) {
    this.assertDatabaseAvailable();
    const orgId = (organizationId || "").trim().toLowerCase();
    if (!orgId) return [];
    if (this.supabase) {
      if (!UUID_REGEX2.test(orgId)) return [];
      const { data, error } = await this.supabase.from("donations").select("*").or(`organization_id.eq.${orgId},tenant_id.eq.${orgId}`).order("paid_at", { ascending: false }).limit(250);
      if (error) {
        if (/does not exist|schema cache|42P01|PGRST205/i.test(error.message || "")) {
          return [];
        }
        throw new Error(`Failed to fetch donations from Supabase: ${error.message}`);
      }
      const mapped = (data || []).map((row) => this.mapSupabaseDonationRow(row));
      if (filters?.personId) {
        return mapped.filter((d) => d.personId === filters.personId);
      }
      return mapped;
    }
    const list = [...this.donationsByOrg.get(orgId) || []];
    if (filters?.personId) {
      return list.filter((d) => d.personId === filters.personId);
    }
    return list;
  }
  async createDonation(organizationId, input) {
    this.assertDatabaseAvailable();
    const orgId = (organizationId || "").trim().toLowerCase();
    const cleanFundName = (input.fundName || "Tithe").trim();
    const cleanFundKey = (input.fundId || cleanFundName.toLowerCase().replace(/\s+/g, "-")).trim();
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    const paidAtIso = input.paidAt ? new Date(input.paidAt).toISOString() : nowIso;
    const amountMinor = Math.max(1, Math.round(Number(input.amountMinor || 0)));
    const reference = input.reference ? String(input.reference).trim() : void 0;
    if (this.supabase) {
      if (!UUID_REGEX2.test(orgId)) {
        throw new Error("Valid organisation ID is required to record donations.");
      }
      const memberUuid = input.personId && UUID_REGEX2.test(input.personId) ? input.personId : null;
      const insertRow = {
        id: (0, import_crypto4.randomUUID)(),
        organization_id: orgId,
        member_id: memberUuid,
        person_name: input.personName || "Member",
        fund_key: cleanFundKey,
        fund_name: cleanFundName,
        amount_minor: amountMinor,
        currency: "GHS",
        method: input.method,
        provider: input.provider,
        status: input.status || "paid",
        paid_at: paidAtIso,
        ...reference ? { reference } : {},
        ...input.gatewayProvider ? { gateway_provider: input.gatewayProvider } : {}
      };
      let { data, error } = await this.supabase.from("donations").insert(insertRow).select("*").single();
      for (let attempt = 0; attempt < 2 && error; attempt++) {
        const msg = error.message || "";
        const colMatch = msg.match(/Could not find the '([^']+)' column/i) || msg.match(/column "([^"]+)"(?: of relation "[^"]+")? does not exist/i);
        if (colMatch && colMatch[1] && Object.prototype.hasOwnProperty.call(insertRow, colMatch[1])) {
          delete insertRow[colMatch[1]];
          const retry = await this.supabase.from("donations").insert(insertRow).select("*").single();
          data = retry.data;
          error = retry.error;
          continue;
        }
        break;
      }
      if (error) {
        throw new Error(`Failed to record donation in Supabase: ${error.message}`);
      }
      return this.mapSupabaseDonationRow(data);
    }
    const created = {
      id: (0, import_crypto4.randomUUID)(),
      personId: input.personId,
      personName: input.personName || "Member",
      fundId: cleanFundKey,
      fundName: cleanFundName,
      amountMinor,
      currency: "GHS",
      method: input.method,
      provider: input.provider,
      status: input.status || "paid",
      paidAt: paidAtIso.slice(0, 10),
      ...reference ? { reference } : {}
    };
    const existing = this.donationsByOrg.get(orgId) || [];
    this.donationsByOrg.set(orgId, [created, ...existing]);
    return created;
  }
  async updateDonationStatusByReference(organizationId, reference, status, meta) {
    this.assertDatabaseAvailable();
    const orgId = (organizationId || "").trim().toLowerCase();
    const cleanRef = (reference || "").trim();
    if (!orgId || !cleanRef) return null;
    if (this.supabase) {
      if (!UUID_REGEX2.test(orgId)) return null;
      const updatePayload = {
        status,
        ...meta?.paidAt ? { paid_at: meta.paidAt } : {},
        ...meta?.gatewayMetadata ? { gateway_metadata: meta.gatewayMetadata } : {}
      };
      const { data, error } = await this.supabase.from("donations").update(updatePayload).eq("organization_id", orgId).eq("reference", cleanRef).select("*").maybeSingle();
      if (error || !data) {
        return null;
      }
      return this.mapSupabaseDonationRow(data);
    }
    const existing = this.donationsByOrg.get(orgId) || [];
    const idx = existing.findIndex((d) => d.reference === cleanRef);
    if (idx < 0) return null;
    const updated = {
      ...existing[idx],
      status,
      ...meta?.paidAt ? { paidAt: meta.paidAt.slice(0, 10) } : {}
    };
    const next = [...existing];
    next[idx] = updated;
    this.donationsByOrg.set(orgId, next);
    return updated;
  }
  // ===========================================================================
  // PASTORAL CARE FOLLOW-UP TASKS (ORG-SCOPED)
  // ===========================================================================
  mapSupabaseFollowupRow(row) {
    const rawReason = String(row.reason || "manual");
    const reason = rawReason === "absent_2" || rawReason === "absent_3" || rawReason === "first_timer" || rawReason === "manual" ? rawReason : "manual";
    const rawStatus = String(row.status || "open");
    const status = rawStatus === "contacted" || rawStatus === "resolved" || rawStatus === "dismissed" ? rawStatus : "open";
    const createdIso = String(row.created_at || (/* @__PURE__ */ new Date()).toISOString());
    return {
      id: String(row.id),
      personId: String(row.member_id || row.person_id || ""),
      personName: String(row.person_name || "Member"),
      personPhone: row.person_phone ? String(row.person_phone) : void 0,
      personEmail: row.person_email ? String(row.person_email) : void 0,
      groupName: String(row.group_name || "General"),
      reason,
      assignedToName: String(row.assigned_to_name || "Pastoral Care Team"),
      assignedToMemberId: row.assigned_to_member_id ? String(row.assigned_to_member_id) : void 0,
      assignedToRole: row.assigned_to_role ? String(row.assigned_to_role) : void 0,
      assignedToPhone: row.assigned_to_phone ? String(row.assigned_to_phone) : void 0,
      assignedToEmail: row.assigned_to_email ? String(row.assigned_to_email) : void 0,
      autoAssigned: typeof row.auto_assigned === "boolean" ? row.auto_assigned : void 0,
      lastReminderAt: row.last_reminder_at ? String(row.last_reminder_at) : void 0,
      reminderCount: typeof row.reminder_count === "number" ? row.reminder_count : 0,
      serviceEventId: row.service_event_id ? String(row.service_event_id) : void 0,
      serviceName: row.service_name ? String(row.service_name) : void 0,
      acknowledgedAt: row.acknowledged_at ? String(row.acknowledged_at) : void 0,
      status,
      dueOn: String(row.due_label || row.due_on || "In 3 days"),
      outcome: row.outcome ? String(row.outcome) : void 0,
      notes: row.notes ? String(row.notes) : void 0,
      createdAt: createdIso.slice(0, 10),
      resolvedAt: row.resolved_at ? String(row.resolved_at) : void 0
    };
  }
  enrichFollowupTasksWithMembers(tasks, orgMembers, churchGroups = []) {
    const byId = /* @__PURE__ */ new Map();
    const byName = /* @__PURE__ */ new Map();
    for (const m of orgMembers) {
      byId.set(String(m.id), m);
      const fullName = `${String(m.firstName || "").trim()} ${String(m.lastName || "").trim()}`.trim().toLowerCase();
      if (fullName) byName.set(fullName, m);
    }
    const groupByLeader = /* @__PURE__ */ new Map();
    for (const g of churchGroups) {
      const k = normalizeSettingLabel(g.leaderName).toLowerCase();
      if (k && !groupByLeader.has(k)) groupByLeader.set(k, g);
    }
    return tasks.map((t) => {
      const targetMember = byId.get(String(t.personId));
      const assigneeMember = (t.assignedToMemberId ? byId.get(t.assignedToMemberId) : void 0) || byName.get(normalizeSettingLabel(t.assignedToName).toLowerCase());
      const matchedGroup = groupByLeader.get(normalizeSettingLabel(t.assignedToName).toLowerCase());
      return {
        ...t,
        personPhone: t.personPhone || (targetMember?.phoneE164 ? String(targetMember.phoneE164) : void 0) || (targetMember?.phoneNumber ? String(targetMember.phoneNumber) : void 0),
        personEmail: t.personEmail || (targetMember?.email ? String(targetMember.email) : void 0),
        assignedToMemberId: t.assignedToMemberId || (assigneeMember ? String(assigneeMember.id) : void 0) || matchedGroup?.leaderMemberId || void 0,
        assignedToRole: t.assignedToRole || (assigneeMember?.officerName || assigneeMember?.designation ? String(assigneeMember.officerName || assigneeMember.designation) : matchedGroup ? matchedGroup.category === "cell_group" ? "Cell Leader" : "Ministry Leader" : void 0),
        assignedToPhone: t.assignedToPhone || (assigneeMember?.phoneE164 ? String(assigneeMember.phoneE164) : void 0) || matchedGroup?.leaderPhone || void 0,
        assignedToEmail: t.assignedToEmail || (assigneeMember?.email ? String(assigneeMember.email) : void 0) || matchedGroup?.leaderEmail || void 0
      };
    });
  }
  async listFollowupTasks(organizationId) {
    this.assertDatabaseAvailable();
    const orgId = (organizationId || "").trim().toLowerCase();
    if (!orgId) return [];
    const [orgMembers, churchGroups] = await Promise.all([
      this.getMembers(orgId),
      this.listChurchGroups(orgId).catch(() => [])
    ]);
    if (this.supabase) {
      if (!UUID_REGEX2.test(orgId)) return [];
      const { data, error } = await this.supabase.from("followup_tasks").select("*").or(`organization_id.eq.${orgId},tenant_id.eq.${orgId}`).order("created_at", { ascending: false }).limit(200);
      if (error) {
        if (/does not exist|schema cache|42P01|PGRST205/i.test(error.message || "")) {
          return [];
        }
        throw new Error(`Failed to fetch follow-up tasks from Supabase: ${error.message}`);
      }
      const mapped = (data || []).map((row) => this.mapSupabaseFollowupRow(row));
      return this.enrichFollowupTasksWithMembers(mapped, orgMembers, churchGroups);
    }
    const memTasks = [...this.followupTasksByOrg.get(orgId) || []];
    return this.enrichFollowupTasksWithMembers(memTasks, orgMembers, churchGroups);
  }
  async createFollowupTask(organizationId, input) {
    this.assertDatabaseAvailable();
    const orgId = (organizationId || "").trim().toLowerCase();
    const [orgMembers, churchGroups] = await Promise.all([
      this.getMembers(orgId),
      this.listChurchGroups(orgId).catch(() => [])
    ]);
    const matchedMember = orgMembers.find((m) => String(m.id) === input.personId);
    const resolvedPersonName = (input.personName || "").trim() || (matchedMember ? `${matchedMember.firstName} ${matchedMember.lastName}`.trim() : "Member");
    const resolvedGroupName = (input.groupName || "").trim() || matchedMember?.homeCellGroup || matchedMember?.groupName || "General";
    const resolvedAssignee = (input.assignedToName || "").trim() || "Pastoral Care Team";
    const resolvedDueLabel = (input.dueOn || "").trim() || (input.reason === "first_timer" ? "Tomorrow 10:00 AM" : "In 3 days");
    const resolvedPersonPhone = (input.personPhone || "").trim() || (matchedMember?.phoneE164 ? String(matchedMember.phoneE164) : void 0);
    const resolvedPersonEmail = (input.personEmail || "").trim() || (matchedMember?.email ? String(matchedMember.email) : void 0);
    if (this.supabase) {
      if (!UUID_REGEX2.test(orgId)) {
        throw new Error("Valid organisation ID is required for follow-up tasks.");
      }
      const memberUuid = UUID_REGEX2.test(input.personId) ? input.personId : null;
      const assigneeMemberUuid = input.assignedToMemberId && UUID_REGEX2.test(input.assignedToMemberId) ? input.assignedToMemberId : null;
      const serviceEventUuid = input.serviceEventId && UUID_REGEX2.test(input.serviceEventId) ? input.serviceEventId : null;
      let insertRow = {
        id: (0, import_crypto4.randomUUID)(),
        organization_id: orgId,
        member_id: memberUuid,
        person_name: resolvedPersonName,
        group_name: resolvedGroupName,
        reason: input.reason,
        assigned_to_name: resolvedAssignee,
        assigned_to_member_id: assigneeMemberUuid,
        assigned_to_role: input.assignedToRole || null,
        assigned_to_phone: input.assignedToPhone || null,
        assigned_to_email: input.assignedToEmail || null,
        auto_assigned: Boolean(input.autoAssigned),
        service_event_id: serviceEventUuid,
        service_name: input.serviceName || null,
        reminder_count: 0,
        status: "open",
        due_label: resolvedDueLabel,
        notes: input.notes || null
      };
      let { data, error } = await this.supabase.from("followup_tasks").insert(insertRow).select("*").single();
      for (let attempt = 0; attempt < 8 && error; attempt++) {
        const msg = error.message || "";
        const colMatch = msg.match(/Could not find the '([^']+)' column/i) || msg.match(/column "([^"]+)"(?: of relation "[^"]+")? does not exist/i);
        if (!colMatch) break;
        const badCol = colMatch[1];
        if (badCol in insertRow) {
          const { [badCol]: _omitted, ...rest } = insertRow;
          insertRow = rest;
          const retry = await this.supabase.from("followup_tasks").insert(insertRow).select("*").single();
          data = retry.data;
          error = retry.error;
        } else {
          break;
        }
      }
      if (error) {
        throw new Error(`Failed to create follow-up task in Supabase: ${error.message}`);
      }
      const mapped = this.mapSupabaseFollowupRow(data);
      return this.enrichFollowupTasksWithMembers(
        [
          {
            ...mapped,
            ...input.assignedToMemberId ? { assignedToMemberId: input.assignedToMemberId } : {},
            ...input.assignedToRole ? { assignedToRole: input.assignedToRole } : {},
            ...input.assignedToPhone ? { assignedToPhone: input.assignedToPhone } : {},
            ...input.assignedToEmail ? { assignedToEmail: input.assignedToEmail } : {},
            ...input.autoAssigned !== void 0 ? { autoAssigned: input.autoAssigned } : {},
            ...input.serviceEventId ? { serviceEventId: input.serviceEventId } : {},
            ...input.serviceName ? { serviceName: input.serviceName } : {}
          }
        ],
        orgMembers,
        churchGroups
      )[0];
    }
    const created = {
      id: (0, import_crypto4.randomUUID)(),
      personId: input.personId,
      personName: resolvedPersonName,
      personPhone: resolvedPersonPhone,
      personEmail: resolvedPersonEmail,
      groupName: resolvedGroupName,
      reason: input.reason,
      assignedToName: resolvedAssignee,
      assignedToMemberId: input.assignedToMemberId,
      assignedToRole: input.assignedToRole,
      assignedToPhone: input.assignedToPhone,
      assignedToEmail: input.assignedToEmail,
      autoAssigned: input.autoAssigned,
      serviceEventId: input.serviceEventId,
      serviceName: input.serviceName,
      reminderCount: 0,
      status: "open",
      dueOn: resolvedDueLabel,
      notes: input.notes || void 0,
      createdAt: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10)
    };
    const existing = this.followupTasksByOrg.get(orgId) || [];
    this.followupTasksByOrg.set(orgId, [created, ...existing]);
    return this.enrichFollowupTasksWithMembers([created], orgMembers, churchGroups)[0];
  }
  async autoAssignAbsenteeFollowupTasks(organizationId, opts) {
    this.assertDatabaseAvailable();
    const orgId = (organizationId || "").trim().toLowerCase();
    if (!orgId) {
      return {
        assignedCount: 0,
        skippedExistingCount: 0,
        tasks: [],
        allTasks: [],
        leaderRemindersSent: 0
      };
    }
    const [membersRaw, churchGroups, existingTasks, settingsRes] = await Promise.all([
      this.getMembers(orgId),
      this.listChurchGroups(orgId),
      this.listFollowupTasks(orgId),
      this.getSystemSettings(orgId)
    ]);
    const typedMembers = membersRaw;
    const unarrivedSet = Array.isArray(opts?.unarrivedMemberIds) && opts.unarrivedMemberIds.length > 0 ? new Set(opts.unarrivedMemberIds.map((id) => String(id))) : void 0;
    const plan = buildAutoAssignAbsenteesPlan({
      members: typedMembers,
      churchGroups,
      existingTasks,
      systemSettings: settingsRes.settings,
      fallbackActorName: opts?.fallbackActorName,
      unarrivedMemberIdsForLatestService: unarrivedSet
    });
    const createdTasks = [];
    for (const item of plan) {
      const created = await this.createFollowupTask(orgId, {
        personId: item.personId,
        personName: item.personName,
        personPhone: item.personPhone,
        personEmail: item.personEmail,
        groupName: item.groupName,
        reason: item.reason,
        assignedToName: item.assignedToName,
        assignedToMemberId: item.assignedToMemberId,
        assignedToRole: item.assignedToRole,
        assignedToPhone: item.assignedToPhone,
        autoAssigned: true,
        serviceEventId: opts?.serviceEventId,
        serviceName: opts?.serviceName,
        dueOn: item.dueOn,
        notes: item.notes
      });
      createdTasks.push(created);
    }
    let leaderRemindersSent = 0;
    const shouldNotifyLeaders = opts?.sendLeaderReminders ?? settingsRes.settings.autoSendLeaderCareReminders !== false;
    if (shouldNotifyLeaders && createdTasks.length > 0) {
      const reminderRes = await this.sendPendingLeaderCareReminders(orgId, {
        taskIds: createdTasks.map((t) => t.id),
        actorName: opts?.fallbackActorName || "Pastoral Care Automation"
      });
      leaderRemindersSent = reminderRes.sentCount;
    }
    const allTasks = await this.listFollowupTasks(orgId);
    const activeOpenIds = existingTasks.filter(
      (t) => t.status === "open" || t.status === "contacted"
    ).length;
    return {
      assignedCount: createdTasks.length,
      skippedExistingCount: activeOpenIds,
      tasks: createdTasks,
      allTasks,
      leaderRemindersSent
    };
  }
  async updateFollowupTask(organizationId, taskId, patch) {
    this.assertDatabaseAvailable();
    const orgId = (organizationId || "").trim().toLowerCase();
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    if (this.supabase) {
      if (!UUID_REGEX2.test(taskId)) {
        const err = new Error("Follow-up task not found.");
        err.status = 404;
        throw err;
      }
      let updateFields = {};
      if (patch.status !== void 0) {
        updateFields.status = patch.status;
        if (patch.status === "resolved" || patch.status === "dismissed") {
          updateFields.resolved_at = nowIso;
        }
      }
      if (patch.outcome !== void 0) updateFields.outcome = patch.outcome;
      if (patch.assignedToName !== void 0) updateFields.assigned_to_name = patch.assignedToName;
      if (patch.notes !== void 0) updateFields.notes = patch.notes;
      if (patch.lastReminderAt !== void 0) updateFields.last_reminder_at = patch.lastReminderAt;
      if (patch.reminderCount !== void 0) updateFields.reminder_count = patch.reminderCount;
      if (patch.acknowledgedAt !== void 0) updateFields.acknowledged_at = patch.acknowledgedAt;
      let { data, error } = await this.supabase.from("followup_tasks").update(updateFields).eq("organization_id", orgId).eq("id", taskId).select("*").maybeSingle();
      for (let attempt = 0; attempt < 6 && error; attempt++) {
        const msg = error.message || "";
        const colMatch = msg.match(/Could not find the '([^']+)' column/i) || msg.match(/column "([^"]+)"(?: of relation "[^"]+")? does not exist/i);
        if (!colMatch) break;
        const badCol = colMatch[1];
        if (badCol in updateFields) {
          const { [badCol]: _omitted, ...rest } = updateFields;
          updateFields = rest;
          if (Object.keys(updateFields).length === 0) {
            const existing = await this.supabase.from("followup_tasks").select("*").eq("organization_id", orgId).eq("id", taskId).maybeSingle();
            data = existing.data;
            error = existing.error;
            break;
          }
          const retry = await this.supabase.from("followup_tasks").update(updateFields).eq("organization_id", orgId).eq("id", taskId).select("*").maybeSingle();
          data = retry.data;
          error = retry.error;
        } else {
          break;
        }
      }
      if (error) {
        throw new Error(`Failed to update follow-up task in Supabase: ${error.message}`);
      }
      if (!data) {
        const err = new Error("Follow-up task not found.");
        err.status = 404;
        throw err;
      }
      const [orgMembers, churchGroups] = await Promise.all([
        this.getMembers(orgId),
        this.listChurchGroups(orgId).catch(() => [])
      ]);
      return this.enrichFollowupTasksWithMembers(
        [this.mapSupabaseFollowupRow(data)],
        orgMembers,
        churchGroups
      )[0];
    }
    const list = this.followupTasksByOrg.get(orgId) || [];
    const idx = list.findIndex((t) => t.id === taskId);
    if (idx < 0) {
      const err = new Error("Follow-up task not found.");
      err.status = 404;
      throw err;
    }
    const updated = {
      ...list[idx],
      ...patch.status !== void 0 ? { status: patch.status } : {},
      ...patch.outcome !== void 0 ? { outcome: patch.outcome } : {},
      ...patch.assignedToName !== void 0 ? { assignedToName: patch.assignedToName } : {},
      ...patch.notes !== void 0 ? { notes: patch.notes } : {},
      ...patch.lastReminderAt !== void 0 ? { lastReminderAt: patch.lastReminderAt } : {},
      ...patch.reminderCount !== void 0 ? { reminderCount: patch.reminderCount } : {},
      ...patch.acknowledgedAt !== void 0 ? { acknowledgedAt: patch.acknowledgedAt } : {},
      ...patch.status === "resolved" || patch.status === "dismissed" ? { resolvedAt: nowIso } : {}
    };
    list[idx] = updated;
    this.followupTasksByOrg.set(orgId, list);
    return updated;
  }
  async deleteFollowupTask(organizationId, taskId) {
    this.assertDatabaseAvailable();
    const orgId = (organizationId || "").trim().toLowerCase();
    if (this.supabase) {
      if (!UUID_REGEX2.test(taskId)) {
        const err = new Error("Follow-up task not found.");
        err.status = 404;
        throw err;
      }
      const { data, error } = await this.supabase.from("followup_tasks").delete().eq("organization_id", orgId).eq("id", taskId).select("id").maybeSingle();
      if (error) {
        throw new Error(`Failed to delete follow-up task in Supabase: ${error.message}`);
      }
      if (!data) {
        const err = new Error("Follow-up task not found.");
        err.status = 404;
        throw err;
      }
      return;
    }
    const list = this.followupTasksByOrg.get(orgId) || [];
    if (!list.some((t) => t.id === taskId)) {
      const err = new Error("Follow-up task not found.");
      err.status = 404;
      throw err;
    }
    this.followupTasksByOrg.set(
      orgId,
      list.filter((t) => t.id !== taskId)
    );
  }
  // ===========================================================================
  // AUTOMATED ABSENTEE OUTREACH, LEADER CARE REMINDERS & OVERSIGHT MONITOR
  // ===========================================================================
  async resolveUserDesignation(organizationId, userId, email, explicitDesignation) {
    if (explicitDesignation && explicitDesignation.trim()) {
      return explicitDesignation.trim();
    }
    const orgId = (organizationId || "").trim().toLowerCase();
    if (!orgId || !userId) return void 0;
    try {
      const profile = await this.getMemberProfileForSession(orgId, userId, email);
      const raw = profile?.designation || profile?.officerName;
      return raw ? String(raw).trim() || void 0 : void 0;
    } catch {
      return void 0;
    }
  }
  async resetMemberAbsenceStreakOnCheckin(organizationId, personId) {
    const orgId = (organizationId || "").trim().toLowerCase();
    if (!orgId || !personId) return;
    const members = await this.getMembers(orgId);
    const member = members.find((m) => String(m.id) === String(personId));
    if (member && Number(member.consecutiveAbsences || 0) > 0) {
      await this.updateMember(orgId, String(member.id), {
        consecutiveAbsences: 0
      }).catch(() => {
      });
    }
    const tasks = await this.listFollowupTasks(orgId);
    const activeAbsentTasks = tasks.filter(
      (t) => String(t.personId) === String(personId) && (t.status === "open" || t.status === "contacted") && (t.reason === "absent_2" || t.reason === "absent_3")
    );
    for (const task of activeAbsentTasks) {
      await this.updateFollowupTask(orgId, task.id, {
        status: "resolved",
        outcome: "Returned and checked in for service"
      }).catch(() => {
      });
    }
  }
  async getExplicitMemberConsentRecord(organizationId, memberId, email) {
    const orgId = (organizationId || "").trim().toLowerCase();
    if (!orgId || !memberId) return null;
    if (this.supabase) {
      if (!UUID_REGEX2.test(orgId)) return null;
      const orClauses = [`user_id.eq.${memberId}`];
      if (UUID_REGEX2.test(memberId)) {
        orClauses.push(`member_id.eq.${memberId}`);
      }
      const { data, error } = await this.supabase.from("member_consents").select("*").eq("organization_id", orgId).or(orClauses.join(",")).order("updated_at", { ascending: false }).limit(1).maybeSingle();
      if (error || !data) return null;
      return {
        autoCheckin: Boolean(data.auto_checkin),
        push: Boolean(data.push),
        sms: Boolean(data.sms),
        email: Boolean(data.email)
      };
    }
    const byOrg = this.memberConsentsByOrg.get(orgId) || {};
    if (byOrg[memberId]) {
      const c = byOrg[memberId];
      return { autoCheckin: c.autoCheckin, push: c.push, sms: c.sms, email: c.email };
    }
    const matched = Object.values(byOrg).find(
      (c) => c.memberId === memberId || email && c.email === email
    );
    if (matched) {
      return {
        autoCheckin: matched.autoCheckin,
        push: matched.push,
        sms: matched.sms,
        email: matched.email
      };
    }
    return null;
  }
  renderAbsentMemberMessage(template, vars) {
    const base = (template || DEFAULT_ABSENT_MEMBER_MESSAGE_TEMPLATE).trim();
    return base.replace(/\{\{\s*firstName\s*\}\}/gi, vars.firstName || "Friend").replace(/\{\{\s*fullName\s*\}\}/gi, vars.fullName || "Beloved Member").replace(/\{\{\s*serviceName\s*\}\}/gi, vars.serviceName || "today\u2019s service").replace(/\{\{\s*churchName\s*\}\}/gi, vars.churchName || "your church family").replace(/\{\{\s*missedCount\s*\}\}/gi, String(vars.missedCount || 1)).replace(/\{\{\s*contactPhone\s*\}\}/gi, vars.contactPhone || "our church office");
  }
  isMissingPastoralAutomationTableError(error) {
    if (!error) return false;
    const code = String(error.code || "").toUpperCase();
    const msg = String(error.message || "");
    return code === "PGRST205" || code === "42P01" || /pastoral_care_dispatches|service_absence_runs|schema cache|does not exist|could not find the table/i.test(
      msg
    );
  }
  mapSupabaseDispatchRow(row) {
    return {
      id: String(row.id),
      organizationId: String(row.organization_id || "").toLowerCase(),
      dispatchType: row.dispatch_type === "leader_reminder" ? "leader_reminder" : "absent_member_alert",
      serviceEventId: row.service_event_id ? String(row.service_event_id) : void 0,
      serviceName: row.service_name ? String(row.service_name) : void 0,
      followupTaskId: row.followup_task_id ? String(row.followup_task_id) : void 0,
      memberId: row.member_id ? String(row.member_id) : void 0,
      memberName: String(row.member_name || "Member"),
      recipientName: String(row.recipient_name || "Recipient"),
      recipientRole: row.recipient_role ? String(row.recipient_role) : void 0,
      recipientPhone: row.recipient_phone ? String(row.recipient_phone) : void 0,
      recipientEmail: row.recipient_email ? String(row.recipient_email) : void 0,
      channel: row.channel === "email" || row.channel === "push" || row.channel === "in_app" ? row.channel : "sms",
      status: row.status === "sent" || row.status === "queued" || row.status === "skipped_unconfigured" || row.status === "skipped_opt_out" || row.status === "skipped_no_contact" || row.status === "failed" ? row.status : "queued",
      messageBody: String(row.message_body || ""),
      provider: row.provider ? String(row.provider) : void 0,
      errorMessage: row.error_message ? String(row.error_message) : void 0,
      acknowledgedAt: row.acknowledged_at ? String(row.acknowledged_at) : void 0,
      createdAt: String(row.created_at || (/* @__PURE__ */ new Date()).toISOString())
    };
  }
  async recordPastoralCareDispatch(organizationId, input) {
    const orgId = (organizationId || "").trim().toLowerCase();
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    const record = {
      id: (0, import_crypto4.randomUUID)(),
      organizationId: orgId,
      dispatchType: input.dispatchType,
      serviceEventId: input.serviceEventId,
      serviceName: input.serviceName,
      followupTaskId: input.followupTaskId,
      memberId: input.memberId,
      memberName: input.memberName,
      recipientName: input.recipientName,
      recipientRole: input.recipientRole,
      recipientPhone: input.recipientPhone,
      recipientEmail: input.recipientEmail,
      channel: input.channel,
      status: input.status,
      messageBody: input.messageBody,
      provider: input.provider,
      errorMessage: input.errorMessage,
      createdAt: nowIso
    };
    const sb = this.activeSupabase;
    if (sb && UUID_REGEX2.test(orgId)) {
      const insertRow = {
        id: record.id,
        organization_id: orgId,
        dispatch_type: record.dispatchType,
        service_event_id: record.serviceEventId && UUID_REGEX2.test(record.serviceEventId) ? record.serviceEventId : null,
        service_name: record.serviceName || null,
        followup_task_id: record.followupTaskId && UUID_REGEX2.test(record.followupTaskId) ? record.followupTaskId : null,
        member_id: record.memberId && UUID_REGEX2.test(record.memberId) ? record.memberId : null,
        member_name: record.memberName,
        recipient_name: record.recipientName,
        recipient_role: record.recipientRole || null,
        recipient_phone: record.recipientPhone || null,
        recipient_email: record.recipientEmail || null,
        channel: record.channel,
        status: record.status,
        message_body: record.messageBody,
        provider: record.provider || null,
        error_message: record.errorMessage || null,
        created_at: nowIso
      };
      const { data, error } = await sb.from("pastoral_care_dispatches").insert(insertRow).select("*").single();
      if (!error && data) {
        return this.mapSupabaseDispatchRow(data);
      }
      if (error && this.isMissingPastoralAutomationTableError(error)) {
        const { data: orgRow } = await sb.from("organizations").select("settings").eq("id", orgId).maybeSingle();
        const existingSettings = orgRow?.settings && typeof orgRow.settings === "object" ? orgRow.settings : {};
        const prevList = Array.isArray(existingSettings._pastoral_dispatches) ? existingSettings._pastoral_dispatches : [];
        const nextList = [record, ...prevList].slice(0, 250);
        await sb.from("organizations").update({
          settings: { ...existingSettings, _pastoral_dispatches: nextList },
          updated_at: nowIso
        }).eq("id", orgId);
        return record;
      }
    }
    const memList = this.dispatchesByOrg.get(orgId) || [];
    this.dispatchesByOrg.set(orgId, [record, ...memList].slice(0, 250));
    return record;
  }
  async listPastoralCareDispatches(organizationId, limit = 150) {
    this.assertDatabaseAvailable();
    const orgId = (organizationId || "").trim().toLowerCase();
    if (!orgId) return [];
    const sb = this.activeSupabase;
    if (sb && UUID_REGEX2.test(orgId)) {
      const { data, error } = await sb.from("pastoral_care_dispatches").select("*").eq("organization_id", orgId).order("created_at", { ascending: false }).limit(limit);
      if (!error && Array.isArray(data)) {
        return data.map((r) => this.mapSupabaseDispatchRow(r));
      }
      if (error && this.isMissingPastoralAutomationTableError(error)) {
        const { data: orgRow } = await sb.from("organizations").select("settings").eq("id", orgId).maybeSingle();
        const raw = orgRow?.settings && typeof orgRow.settings === "object" ? orgRow.settings : {};
        const list = Array.isArray(raw._pastoral_dispatches) ? raw._pastoral_dispatches : [];
        return list.slice(0, limit);
      }
    }
    return (this.dispatchesByOrg.get(orgId) || []).slice(0, limit);
  }
  async getProcessedAbsenceEventIds(orgId) {
    const sb = this.activeSupabase;
    if (sb && UUID_REGEX2.test(orgId)) {
      const { data, error } = await sb.from("service_absence_runs").select("event_id").eq("organization_id", orgId).order("created_at", { ascending: false }).limit(200);
      if (!error && Array.isArray(data)) {
        return data.map((r) => String(r.event_id));
      }
      if (error && this.isMissingPastoralAutomationTableError(error)) {
        const { data: orgRow } = await sb.from("organizations").select("settings").eq("id", orgId).maybeSingle();
        const raw = orgRow?.settings && typeof orgRow.settings === "object" ? orgRow.settings : {};
        return Array.isArray(raw._processed_absence_events) ? raw._processed_absence_events.map(String) : [];
      }
    }
    const memMap = this.absenceRunsByOrg.get(orgId);
    return memMap ? Array.from(memMap.keys()) : [];
  }
  async markAbsenceEventProcessed(orgId, summary) {
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    const sb = this.activeSupabase;
    if (sb && UUID_REGEX2.test(orgId) && UUID_REGEX2.test(summary.eventId)) {
      const { error } = await sb.from("service_absence_runs").upsert(
        {
          organization_id: orgId,
          event_id: summary.eventId,
          event_name: summary.eventName,
          trigger_source: summary.triggerSource,
          absent_members_count: summary.absentMembersCount,
          member_messages_sent: summary.memberMessagesSent,
          tasks_created_count: summary.tasksCreatedCount,
          leader_reminders_sent: summary.leaderRemindersSent,
          triggered_by: summary.triggeredBy || null,
          created_at: nowIso
        },
        { onConflict: "organization_id,event_id" }
      );
      if (!error) return;
      if (this.isMissingPastoralAutomationTableError(error)) {
        const { data: orgRow } = await sb.from("organizations").select("settings").eq("id", orgId).maybeSingle();
        const existingSettings = orgRow?.settings && typeof orgRow.settings === "object" ? orgRow.settings : {};
        const prev = Array.isArray(existingSettings._processed_absence_events) ? existingSettings._processed_absence_events.map(String) : [];
        const next = Array.from(/* @__PURE__ */ new Set([summary.eventId, ...prev])).slice(0, 200);
        await sb.from("organizations").update({
          settings: { ...existingSettings, _processed_absence_events: next },
          updated_at: nowIso
        }).eq("id", orgId);
        return;
      }
    }
    const memMap = this.absenceRunsByOrg.get(orgId) || /* @__PURE__ */ new Map();
    memMap.set(summary.eventId, {
      eventId: summary.eventId,
      eventName: summary.eventName,
      processedAt: nowIso
    });
    this.absenceRunsByOrg.set(orgId, memMap);
  }
  async processServiceAbsenceSweep(organizationId, opts) {
    this.assertDatabaseAvailable();
    const orgId = (organizationId || "").trim().toLowerCase();
    const events = await this.getEvents(orgId);
    const targetEvent = opts?.eventId ? events.find((e) => String(e.id) === String(opts.eventId)) : events.find((e) => {
      const st = String(e.status || "").toLowerCase();
      return st === "closed" || st === "completed";
    }) || events[0];
    if (!targetEvent) {
      const allTasks2 = await this.listFollowupTasks(orgId);
      return {
        success: true,
        eventId: "",
        eventName: "No service scheduled",
        absentMembersCount: 0,
        memberMessagesSent: 0,
        memberMessagesAttempted: 0,
        tasksCreatedCount: 0,
        leaderRemindersSent: 0,
        leaderRemindersAttempted: 0,
        dispatches: [],
        allTasks: allTasks2,
        message: "No worship service found to evaluate absences."
      };
    }
    const eventId = String(targetEvent.id);
    const eventName = String(targetEvent.name || "Worship Service");
    const processedIds = await this.getProcessedAbsenceEventIds(orgId);
    if (!opts?.force && processedIds.includes(eventId)) {
      const [allTasks2, existingDispatches] = await Promise.all([
        this.listFollowupTasks(orgId),
        this.listPastoralCareDispatches(orgId, 60)
      ]);
      return {
        success: true,
        alreadyProcessed: true,
        eventId,
        eventName,
        absentMembersCount: 0,
        memberMessagesSent: 0,
        memberMessagesAttempted: 0,
        tasksCreatedCount: 0,
        leaderRemindersSent: 0,
        leaderRemindersAttempted: 0,
        dispatches: existingDispatches.filter((d) => d.serviceEventId === eventId),
        allTasks: allTasks2,
        message: `Absence sweep already completed for "${eventName}".`
      };
    }
    const [membersRaw, checkins, settingsRes, churchGroups, existingTasks, arkeselResolved] = await Promise.all([
      this.getMembers(orgId),
      this.getLiveCheckins(orgId, eventId),
      this.getSystemSettings(orgId),
      this.listChurchGroups(orgId),
      this.listFollowupTasks(orgId),
      this.getResolvedArkeselApiKey(orgId)
    ]);
    const settings = settingsRes.settings;
    const presentIds = new Set(checkins.map((c) => String(c.personId)));
    const updatedMembers = [];
    const absentMembers = [];
    for (const raw of membersRaw) {
      const m = raw;
      const status = String(m.status || "member").toLowerCase();
      if (status === "inactive" || status === "transferred" || status === "deceased" || status === "visitor") {
        updatedMembers.push(m);
        continue;
      }
      if (presentIds.has(String(m.id))) {
        if (Number(m.consecutiveAbsences || 0) > 0) {
          await this.updateMember(orgId, String(m.id), { consecutiveAbsences: 0 }).catch(() => {
          });
        }
        updatedMembers.push({ ...m, consecutiveAbsences: 0 });
      } else {
        const nextStreak = (Number(m.consecutiveAbsences || 0) || 0) + 1;
        await this.updateMember(orgId, String(m.id), { consecutiveAbsences: nextStreak }).catch(() => {
        });
        const updated = { ...m, consecutiveAbsences: nextStreak };
        updatedMembers.push(updated);
        absentMembers.push({ member: updated, newStreak: nextStreak });
      }
    }
    const dispatches = [];
    let memberMessagesSent = 0;
    let memberMessagesAttempted = 0;
    if (settings.autoMessageAbsentMembers !== false && absentMembers.length > 0) {
      const channelPref = settings.absentMemberMessageChannel || "sms_and_email";
      const resendConfigured = Boolean((process.env.RESEND_API_KEY || "").trim());
      const arkeselConfigured = Boolean(arkeselResolved.apiKey);
      const churchDisplay = settings.churchName || "Your Church Family";
      const churchContactPhone = settings.contactPhone || "our pastoral desk";
      for (const { member, newStreak } of absentMembers) {
        const fullName = getMemberFullName(member) || "Beloved Member";
        const messageBody = this.renderAbsentMemberMessage(
          settings.absentMemberMessageTemplate || DEFAULT_ABSENT_MEMBER_MESSAGE_TEMPLATE,
          {
            firstName: member.firstName || fullName.split(" ")[0] || "Friend",
            fullName,
            serviceName: eventName,
            churchName: churchDisplay,
            missedCount: newStreak,
            contactPhone: churchContactPhone
          }
        );
        const explicitConsent = await this.getExplicitMemberConsentRecord(
          orgId,
          String(member.id),
          member.email
        );
        const wantsSms = channelPref === "sms" || channelPref === "sms_and_email";
        const wantsEmail = channelPref === "email" || channelPref === "sms_and_email";
        const phone = member.phoneE164 || member.phoneNumber || "";
        const normalizedMsisdn = normalizeArkeselPhone(phone);
        const email = (member.email || "").trim().toLowerCase();
        let deliveredToThisMember = false;
        if (wantsSms) {
          memberMessagesAttempted++;
          if (explicitConsent && explicitConsent.sms === false) {
            dispatches.push(
              await this.recordPastoralCareDispatch(orgId, {
                dispatchType: "absent_member_alert",
                serviceEventId: eventId,
                serviceName: eventName,
                memberId: String(member.id),
                memberName: fullName,
                recipientName: fullName,
                recipientRole: "Member",
                recipientPhone: phone || void 0,
                channel: "sms",
                status: "skipped_opt_out",
                messageBody,
                provider: "Arkesel SMS",
                errorMessage: "Member opted out of SMS notifications."
              })
            );
          } else if (!normalizedMsisdn) {
            dispatches.push(
              await this.recordPastoralCareDispatch(orgId, {
                dispatchType: "absent_member_alert",
                serviceEventId: eventId,
                serviceName: eventName,
                memberId: String(member.id),
                memberName: fullName,
                recipientName: fullName,
                recipientRole: "Member",
                channel: "sms",
                status: "skipped_no_contact",
                messageBody,
                provider: "Arkesel SMS",
                errorMessage: "No valid mobile phone number on member profile."
              })
            );
          } else if (!arkeselConfigured) {
            dispatches.push(
              await this.recordPastoralCareDispatch(orgId, {
                dispatchType: "absent_member_alert",
                serviceEventId: eventId,
                serviceName: eventName,
                memberId: String(member.id),
                memberName: fullName,
                recipientName: fullName,
                recipientRole: "Member",
                recipientPhone: phone,
                channel: "sms",
                status: "skipped_unconfigured",
                messageBody,
                provider: "Arkesel SMS",
                errorMessage: "Tenant Arkesel API key not configured yet."
              })
            );
          } else {
            const smsRes = await sendArkeselSms({
              apiKey: arkeselResolved.apiKey,
              senderId: settings.smsSenderId,
              recipients: [normalizedMsisdn],
              message: messageBody
            });
            if (smsRes.ok) {
              deliveredToThisMember = true;
            }
            dispatches.push(
              await this.recordPastoralCareDispatch(orgId, {
                dispatchType: "absent_member_alert",
                serviceEventId: eventId,
                serviceName: eventName,
                memberId: String(member.id),
                memberName: fullName,
                recipientName: fullName,
                recipientRole: "Member",
                recipientPhone: phone,
                channel: "sms",
                status: smsRes.ok ? "sent" : "failed",
                messageBody,
                provider: "Arkesel SMS",
                errorMessage: smsRes.ok ? void 0 : smsRes.message
              })
            );
          }
        }
        if (wantsEmail && email) {
          memberMessagesAttempted++;
          if (explicitConsent && explicitConsent.email === false) {
            dispatches.push(
              await this.recordPastoralCareDispatch(orgId, {
                dispatchType: "absent_member_alert",
                serviceEventId: eventId,
                serviceName: eventName,
                memberId: String(member.id),
                memberName: fullName,
                recipientName: fullName,
                recipientRole: "Member",
                recipientEmail: email,
                channel: "email",
                status: "skipped_opt_out",
                messageBody,
                provider: "Resend Email",
                errorMessage: "Member opted out of Email notifications."
              })
            );
          } else if (!resendConfigured) {
            if (!wantsSms) {
              dispatches.push(
                await this.recordPastoralCareDispatch(orgId, {
                  dispatchType: "absent_member_alert",
                  serviceEventId: eventId,
                  serviceName: eventName,
                  memberId: String(member.id),
                  memberName: fullName,
                  recipientName: fullName,
                  recipientRole: "Member",
                  recipientEmail: email,
                  channel: "email",
                  status: "skipped_unconfigured",
                  messageBody,
                  provider: "Resend Email",
                  errorMessage: "Email gateway API key not configured."
                })
              );
            }
          } else {
            const emailRes = await sendResendEmail({
              fromEmail: settings.emailFromAddress || void 0,
              fromName: settings.emailSenderName || settings.churchName || void 0,
              organizationName: settings.churchName || void 0,
              to: [email],
              subject: `We missed you at ${eventName} \xB7 ${churchDisplay}`,
              text: messageBody,
              replyTo: settings.contactEmail || void 0
            });
            if (emailRes.ok) {
              deliveredToThisMember = true;
            }
            dispatches.push(
              await this.recordPastoralCareDispatch(orgId, {
                dispatchType: "absent_member_alert",
                serviceEventId: eventId,
                serviceName: eventName,
                memberId: String(member.id),
                memberName: fullName,
                recipientName: fullName,
                recipientRole: "Member",
                recipientEmail: email,
                channel: "email",
                status: emailRes.ok ? "sent" : "failed",
                messageBody,
                provider: "Resend Email",
                errorMessage: emailRes.ok ? void 0 : emailRes.message
              })
            );
          }
        }
        if (deliveredToThisMember) {
          memberMessagesSent++;
        }
      }
    }
    const plan = buildAutoAssignAbsenteesPlan({
      members: updatedMembers,
      churchGroups,
      existingTasks,
      systemSettings: settings,
      fallbackActorName: opts?.actorName || settings.seniorPastor || "Pastoral Care Team"
    });
    const createdTasks = [];
    for (const item of plan) {
      const leaderMember = updatedMembers.find(
        (m) => item.assignedToMemberId && String(m.id) === String(item.assignedToMemberId) || getMemberFullName(m).toLowerCase() === normalizeSettingLabel(item.assignedToName).toLowerCase()
      );
      const leaderEmail = leaderMember?.email || void 0;
      const created = await this.createFollowupTask(orgId, {
        personId: item.personId,
        personName: item.personName,
        personPhone: item.personPhone,
        personEmail: item.personEmail,
        groupName: item.groupName,
        reason: item.reason,
        assignedToName: item.assignedToName,
        assignedToMemberId: item.assignedToMemberId,
        assignedToRole: item.assignedToRole,
        assignedToPhone: item.assignedToPhone,
        assignedToEmail: leaderEmail,
        autoAssigned: true,
        serviceEventId: eventId,
        serviceName: eventName,
        dueOn: item.dueOn,
        notes: `${item.notes} Service: ${eventName}.`
      });
      createdTasks.push(created);
    }
    let leaderRemindersSent = 0;
    let leaderRemindersAttempted = 0;
    if (settings.autoSendLeaderCareReminders !== false) {
      const targetTaskIds = createdTasks.map((t) => t.id);
      if (targetTaskIds.length > 0) {
        const remRes = await this.sendPendingLeaderCareReminders(orgId, {
          taskIds: targetTaskIds,
          serviceEventId: eventId,
          serviceName: eventName,
          actorName: opts?.actorName || "Pastoral Care Automation"
        });
        leaderRemindersSent = remRes.sentCount;
        leaderRemindersAttempted = remRes.attemptedCount;
        dispatches.push(...remRes.dispatches);
      }
    }
    await this.markAbsenceEventProcessed(orgId, {
      eventId,
      eventName,
      triggerSource: opts?.triggerSource || "service_closed",
      absentMembersCount: absentMembers.length,
      memberMessagesSent,
      tasksCreatedCount: createdTasks.length,
      leaderRemindersSent,
      triggeredBy: opts?.actorName
    });
    const allTasks = await this.listFollowupTasks(orgId);
    const summaryMsg = absentMembers.length === 0 ? `Service "${eventName}" closed: all active members checked in.` : `Service "${eventName}" absence care completed: ${absentMembers.length} absent member(s), ${memberMessagesSent} member alert(s) sent, ${createdTasks.length} care task(s) created, ${leaderRemindersSent} leader reminder(s) delivered.`;
    return {
      success: true,
      eventId,
      eventName,
      absentMembersCount: absentMembers.length,
      memberMessagesSent,
      memberMessagesAttempted,
      tasksCreatedCount: createdTasks.length,
      leaderRemindersSent,
      leaderRemindersAttempted,
      dispatches,
      allTasks,
      message: summaryMsg
    };
  }
  async sendPendingLeaderCareReminders(organizationId, opts) {
    this.assertDatabaseAvailable();
    const orgId = (organizationId || "").trim().toLowerCase();
    const [allTasks, orgMembers, churchGroups, settingsRes, arkeselResolved] = await Promise.all([
      this.listFollowupTasks(orgId),
      this.getMembers(orgId),
      this.listChurchGroups(orgId).catch(() => []),
      this.getSystemSettings(orgId),
      this.getResolvedArkeselApiKey(orgId)
    ]);
    const settings = settingsRes.settings;
    const resendConfigured = Boolean((process.env.RESEND_API_KEY || "").trim());
    const arkeselConfigured = Boolean(arkeselResolved.apiKey);
    let targetTasks = allTasks.filter((t) => t.status === "open" || t.status === "contacted");
    if (opts?.taskId) {
      targetTasks = targetTasks.filter((t) => t.id === opts.taskId);
    } else if (Array.isArray(opts?.taskIds) && opts.taskIds.length > 0) {
      const idSet = new Set(opts.taskIds);
      targetTasks = targetTasks.filter((t) => idSet.has(t.id));
    } else if (opts?.leaderName) {
      const targetLeader = normalizeSettingLabel(opts.leaderName).toLowerCase();
      targetTasks = targetTasks.filter(
        (t) => normalizeSettingLabel(t.assignedToName).toLowerCase() === targetLeader
      );
    }
    if (targetTasks.length === 0) {
      return { sentCount: 0, attemptedCount: 0, dispatches: [], allTasks };
    }
    const byLeader = /* @__PURE__ */ new Map();
    for (const t of targetTasks) {
      const key = normalizeSettingLabel(t.assignedToName).toLowerCase() || "pastoral_care_team";
      const arr = byLeader.get(key) || [];
      arr.push(t);
      byLeader.set(key, arr);
    }
    const dispatches = [];
    let sentCount = 0;
    let attemptedCount = 0;
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    for (const groupTasks of byLeader.values()) {
      const primaryTask = groupTasks[0];
      const leaderName = primaryTask.assignedToName || "Pastoral Care Leader";
      const leaderRole = primaryTask.assignedToRole || "Leader in Charge";
      const leaderMember = orgMembers.find(
        (m) => primaryTask.assignedToMemberId && String(m.id) === String(primaryTask.assignedToMemberId) || `${String(m.firstName || "")} ${String(m.lastName || "")}`.trim().toLowerCase() === normalizeSettingLabel(leaderName).toLowerCase()
      );
      const leaderGroup = churchGroups.find(
        (g) => normalizeSettingLabel(g.leaderName).toLowerCase() === normalizeSettingLabel(leaderName).toLowerCase()
      );
      const leaderPhone = primaryTask.assignedToPhone || (leaderMember?.phoneE164 ? String(leaderMember.phoneE164) : void 0) || leaderGroup?.leaderPhone || void 0;
      const leaderEmail = primaryTask.assignedToEmail || (leaderMember?.email ? String(leaderMember.email) : void 0) || leaderGroup?.leaderEmail || void 0;
      const memberSummaries = groupTasks.slice(0, 5).map((t) => `${t.personName}${t.personPhone ? ` (${t.personPhone})` : ""}`).join(", ");
      const extraCount = groupTasks.length > 5 ? ` +${groupTasks.length - 5} more` : "";
      const churchLabel = settings.churchName || "Ekklesphere Church";
      const serviceCtx = opts?.serviceName || primaryTask.serviceName ? ` after ${opts?.serviceName || primaryTask.serviceName}` : "";
      const reminderMessage = `Pastoral Care Reminder (${churchLabel}): Dear ${leaderName}, please follow up with ${groupTasks.length} member${groupTasks.length === 1 ? "" : "s"} needing care${serviceCtx}: ${memberSummaries}${extraCount}. Due: ${primaryTask.dueOn}.`;
      attemptedCount++;
      let deliveredExternally = false;
      const normalizedPhone = normalizeArkeselPhone(leaderPhone);
      if (normalizedPhone) {
        if (arkeselConfigured) {
          const smsRes = await sendArkeselSms({
            apiKey: arkeselResolved.apiKey,
            senderId: settings.smsSenderId,
            recipients: [normalizedPhone],
            message: reminderMessage
          });
          if (smsRes.ok) deliveredExternally = true;
          dispatches.push(
            await this.recordPastoralCareDispatch(orgId, {
              dispatchType: "leader_reminder",
              serviceEventId: opts?.serviceEventId || primaryTask.serviceEventId,
              serviceName: opts?.serviceName || primaryTask.serviceName,
              followupTaskId: primaryTask.id,
              memberId: primaryTask.personId,
              memberName: groupTasks.length === 1 ? primaryTask.personName : `${groupTasks.length} Members`,
              recipientName: leaderName,
              recipientRole: leaderRole,
              recipientPhone: leaderPhone,
              recipientEmail: leaderEmail,
              channel: "sms",
              status: smsRes.ok ? "sent" : "failed",
              messageBody: reminderMessage,
              provider: "Arkesel SMS",
              errorMessage: smsRes.ok ? void 0 : smsRes.message
            })
          );
        } else {
          dispatches.push(
            await this.recordPastoralCareDispatch(orgId, {
              dispatchType: "leader_reminder",
              serviceEventId: opts?.serviceEventId || primaryTask.serviceEventId,
              serviceName: opts?.serviceName || primaryTask.serviceName,
              followupTaskId: primaryTask.id,
              memberId: primaryTask.personId,
              memberName: groupTasks.length === 1 ? primaryTask.personName : `${groupTasks.length} Members`,
              recipientName: leaderName,
              recipientRole: leaderRole,
              recipientPhone: leaderPhone,
              channel: "sms",
              status: "skipped_unconfigured",
              messageBody: reminderMessage,
              provider: "Arkesel SMS",
              errorMessage: "Tenant Arkesel API key not configured; delivered in-app reminder."
            })
          );
        }
      }
      if (leaderEmail && resendConfigured) {
        const emailRes = await sendResendEmail({
          fromEmail: settings.emailFromAddress || void 0,
          fromName: settings.emailSenderName || settings.churchName || void 0,
          organizationName: settings.churchName || void 0,
          to: [leaderEmail],
          subject: `Pastoral Care Reminder: ${groupTasks.length} Member${groupTasks.length === 1 ? "" : "s"} Assigned (${churchLabel})`,
          text: reminderMessage,
          replyTo: settings.contactEmail || void 0
        });
        if (emailRes.ok) deliveredExternally = true;
        dispatches.push(
          await this.recordPastoralCareDispatch(orgId, {
            dispatchType: "leader_reminder",
            serviceEventId: opts?.serviceEventId || primaryTask.serviceEventId,
            serviceName: opts?.serviceName || primaryTask.serviceName,
            followupTaskId: primaryTask.id,
            memberId: primaryTask.personId,
            memberName: groupTasks.length === 1 ? primaryTask.personName : `${groupTasks.length} Members`,
            recipientName: leaderName,
            recipientRole: leaderRole,
            recipientPhone: leaderPhone,
            recipientEmail: leaderEmail,
            channel: "email",
            status: emailRes.ok ? "sent" : "failed",
            messageBody: reminderMessage,
            provider: "Resend Email",
            errorMessage: emailRes.ok ? void 0 : emailRes.message
          })
        );
      }
      dispatches.push(
        await this.recordPastoralCareDispatch(orgId, {
          dispatchType: "leader_reminder",
          serviceEventId: opts?.serviceEventId || primaryTask.serviceEventId,
          serviceName: opts?.serviceName || primaryTask.serviceName,
          followupTaskId: primaryTask.id,
          memberId: primaryTask.personId,
          memberName: groupTasks.length === 1 ? primaryTask.personName : `${groupTasks.length} Members`,
          recipientName: leaderName,
          recipientRole: leaderRole,
          recipientPhone: leaderPhone,
          recipientEmail: leaderEmail,
          channel: "in_app",
          status: "sent",
          messageBody: reminderMessage,
          provider: deliveredExternally ? "In-App + Gateway" : "Ekklesphere Portal Alert"
        })
      );
      sentCount++;
      for (const task of groupTasks) {
        await this.updateFollowupTask(orgId, task.id, {
          lastReminderAt: nowIso,
          reminderCount: (task.reminderCount || 0) + 1
        }).catch(() => {
        });
      }
    }
    const refreshedTasks = await this.listFollowupTasks(orgId);
    return {
      sentCount,
      attemptedCount,
      dispatches,
      allTasks: refreshedTasks
    };
  }
  async acknowledgeLeaderCareTask(organizationId, taskId, actor) {
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    const tasks = await this.listFollowupTasks(organizationId);
    const current = tasks.find((t) => t.id === taskId);
    if (!current) {
      const err = new Error("Follow-up task not found.");
      err.status = 404;
      throw err;
    }
    const nextStatus = current.status === "open" ? "contacted" : current.status;
    return this.updateFollowupTask(organizationId, taskId, {
      status: nextStatus,
      acknowledgedAt: nowIso,
      outcome: current.outcome || `Reminder acknowledged by ${actor?.name || current.assignedToName} (${(/* @__PURE__ */ new Date()).toLocaleDateString()})`
    });
  }
  async getPastoralCareMonitorSummary(organizationId) {
    this.assertDatabaseAvailable();
    const orgId = (organizationId || "").trim().toLowerCase();
    const [tasks, dispatches, processedEventIds, orgMembers, churchGroups] = await Promise.all([
      this.listFollowupTasks(orgId),
      this.listPastoralCareDispatches(orgId, 200),
      this.getProcessedAbsenceEventIds(orgId),
      this.getMembers(orgId),
      this.listChurchGroups(orgId).catch(() => [])
    ]);
    const openTasksCount = tasks.filter((t) => t.status === "open").length;
    const contactedTasksCount = tasks.filter((t) => t.status === "contacted").length;
    const resolvedTasksCount = tasks.filter((t) => t.status === "resolved").length;
    const totalTrackable = openTasksCount + contactedTasksCount + resolvedTasksCount;
    const resolutionRatePct = totalTrackable > 0 ? Math.round(resolvedTasksCount / totalTrackable * 100) : 100;
    const absentMemberMessagesSent = dispatches.filter(
      (d) => d.dispatchType === "absent_member_alert" && d.status === "sent"
    ).length;
    const leaderRemindersSent = dispatches.filter(
      (d) => d.dispatchType === "leader_reminder" && d.status === "sent"
    ).length;
    const scorecardMap = /* @__PURE__ */ new Map();
    for (const task of tasks) {
      const leaderName = (task.assignedToName || "Pastoral Care Team").trim();
      const key = leaderName.toLowerCase();
      const leaderMember = orgMembers.find(
        (m) => task.assignedToMemberId && String(m.id) === String(task.assignedToMemberId) || `${String(m.firstName || "")} ${String(m.lastName || "")}`.trim().toLowerCase() === key
      );
      const leaderGroup = churchGroups.find(
        (g) => normalizeSettingLabel(g.leaderName).toLowerCase() === key
      );
      const existing = scorecardMap.get(key) || {
        leaderName,
        leaderMemberId: task.assignedToMemberId || (leaderMember ? String(leaderMember.id) : void 0),
        leaderRole: task.assignedToRole || (leaderMember ? getMemberPortfolio(leaderMember) : void 0) || (leaderGroup ? "Group Leader" : "Pastoral Care"),
        leaderPhone: task.assignedToPhone || (leaderMember?.phoneE164 ? String(leaderMember.phoneE164) : void 0) || leaderGroup?.leaderPhone || void 0,
        leaderEmail: task.assignedToEmail || (leaderMember?.email ? String(leaderMember.email) : void 0) || leaderGroup?.leaderEmail || void 0,
        openCount: 0,
        contactedCount: 0,
        resolvedCount: 0,
        totalAssigned: 0,
        remindersSent: 0,
        lastReminderAt: null
      };
      if (task.status === "open") existing.openCount += 1;
      else if (task.status === "contacted") existing.contactedCount += 1;
      else if (task.status === "resolved") existing.resolvedCount += 1;
      existing.totalAssigned += 1;
      existing.remindersSent += Number(task.reminderCount || 0);
      if (task.lastReminderAt && (!existing.lastReminderAt || task.lastReminderAt > existing.lastReminderAt)) {
        existing.lastReminderAt = task.lastReminderAt;
      }
      scorecardMap.set(key, existing);
    }
    const leaderScorecard = Array.from(scorecardMap.values()).sort(
      (a, b) => b.openCount + b.contactedCount - (a.openCount + a.contactedCount) || b.totalAssigned - a.totalAssigned
    );
    return {
      tasks,
      dispatches,
      processedEventIds,
      leaderScorecard,
      stats: {
        openTasksCount,
        contactedTasksCount,
        resolvedTasksCount,
        resolutionRatePct,
        absentMemberMessagesSent,
        leaderRemindersSent,
        totalDispatches: dispatches.length
      },
      generatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  async listLeaderAssignedReminders(organizationId, actor) {
    this.assertDatabaseAvailable();
    const orgId = (organizationId || "").trim().toLowerCase();
    const [tasks, dispatches, profile] = await Promise.all([
      this.listFollowupTasks(orgId),
      this.listPastoralCareDispatches(orgId, 100),
      actor.userId ? this.getMemberProfileForSession(orgId, actor.userId, actor.email).catch(() => null) : Promise.resolve(null)
    ]);
    const targetIds = new Set(
      [actor.userId, profile?.id ? String(profile.id) : void 0].filter(Boolean)
    );
    const targetNames = new Set(
      [
        actor.name,
        profile ? `${String(profile.firstName || "")} ${String(profile.lastName || "")}`.trim() : void 0
      ].map((n) => normalizeSettingLabel(n).toLowerCase()).filter(Boolean)
    );
    const cleanEmail = (actor.email || "").trim().toLowerCase();
    const myTasks = tasks.filter((t) => {
      if (t.assignedToMemberId && targetIds.has(String(t.assignedToMemberId))) return true;
      if (cleanEmail && t.assignedToEmail?.toLowerCase() === cleanEmail) return true;
      const assignedLower = normalizeSettingLabel(t.assignedToName).toLowerCase();
      return Boolean(assignedLower && targetNames.has(assignedLower));
    });
    const myTaskIds = new Set(myTasks.map((t) => t.id));
    const myDispatches = dispatches.filter(
      (d) => d.dispatchType === "leader_reminder" && (d.followupTaskId && myTaskIds.has(d.followupTaskId) || targetNames.has(normalizeSettingLabel(d.recipientName).toLowerCase()) || cleanEmail && d.recipientEmail?.toLowerCase() === cleanEmail)
    );
    return { tasks: myTasks, dispatches: myDispatches };
  }
  // ===========================================================================
  // MEMBER CONSENTS & EVENT RSVPS (ORG + USER SCOPED)
  // ===========================================================================
  async getMemberConsents(organizationId, userId, email) {
    this.assertDatabaseAvailable();
    const orgId = (organizationId || "").trim().toLowerCase();
    const defaultConsents = { autoCheckin: true, push: true, sms: false, email: true };
    if (!orgId || !userId) return defaultConsents;
    if (this.supabase) {
      if (!UUID_REGEX2.test(orgId)) return defaultConsents;
      const { data, error } = await this.supabase.from("member_consents").select("*").eq("organization_id", orgId).eq("user_id", userId).maybeSingle();
      if (error) {
        if (/does not exist|schema cache|42P01|PGRST205/i.test(error.message || "")) {
          return defaultConsents;
        }
        throw new Error(`Failed to fetch member consents from Supabase: ${error.message}`);
      }
      if (data) {
        return {
          autoCheckin: Boolean(data.auto_checkin),
          push: Boolean(data.push),
          sms: Boolean(data.sms),
          email: Boolean(data.email)
        };
      }
      const profile2 = await this.getMemberProfileForSession(orgId, userId, email);
      return {
        ...defaultConsents,
        autoCheckin: profile2?.autoCheckinOptedIn !== void 0 ? Boolean(profile2.autoCheckinOptedIn) : true
      };
    }
    const byOrg = this.memberConsentsByOrg.get(orgId) || {};
    if (byOrg[userId]) {
      const { autoCheckin, push, sms, email: emailConsent } = byOrg[userId];
      return { autoCheckin, push, sms, email: emailConsent };
    }
    const profile = await this.getMemberProfileForSession(orgId, userId, email);
    return {
      ...defaultConsents,
      autoCheckin: profile?.autoCheckinOptedIn !== void 0 ? Boolean(profile.autoCheckinOptedIn) : true
    };
  }
  async upsertMemberConsents(organizationId, userId, email, consents, fallbackName) {
    this.assertDatabaseAvailable();
    const orgId = (organizationId || "").trim().toLowerCase();
    const profile = await this.getMemberProfileForSession(orgId, userId, email);
    const memberId = profile?.id ? String(profile.id) : void 0;
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    if (this.supabase) {
      if (!UUID_REGEX2.test(orgId)) {
        throw new Error("Valid organisation ID is required to save consents.");
      }
      const memberUuid = memberId && UUID_REGEX2.test(memberId) ? memberId : null;
      const { data, error } = await this.supabase.from("member_consents").upsert(
        {
          organization_id: orgId,
          user_id: userId,
          member_id: memberUuid,
          auto_checkin: Boolean(consents.autoCheckin),
          push: Boolean(consents.push),
          sms: Boolean(consents.sms),
          email: Boolean(consents.email),
          updated_at: nowIso
        },
        { onConflict: "organization_id,user_id" }
      ).select("*").single();
      if (error) {
        throw new Error(`Failed to persist member consents in Supabase: ${error.message}`);
      }
      if (memberUuid || email || fallbackName) {
        await this.updateOwnMemberProfile(
          orgId,
          userId,
          email,
          { autoCheckinOptedIn: Boolean(consents.autoCheckin) },
          fallbackName
        ).catch(() => {
        });
      }
      return {
        autoCheckin: Boolean(data.auto_checkin),
        push: Boolean(data.push),
        sms: Boolean(data.sms),
        email: Boolean(data.email)
      };
    }
    const byOrg = this.memberConsentsByOrg.get(orgId) || {};
    byOrg[userId] = {
      autoCheckin: Boolean(consents.autoCheckin),
      push: Boolean(consents.push),
      sms: Boolean(consents.sms),
      email: Boolean(consents.email),
      memberId,
      updatedAt: nowIso
    };
    this.memberConsentsByOrg.set(orgId, byOrg);
    if (memberId) {
      await this.updateMember(orgId, memberId, {
        autoCheckinOptedIn: Boolean(consents.autoCheckin)
      }).catch(() => {
      });
    }
    return {
      autoCheckin: Boolean(consents.autoCheckin),
      push: Boolean(consents.push),
      sms: Boolean(consents.sms),
      email: Boolean(consents.email)
    };
  }
  async listEventRsvps(organizationId, userId) {
    this.assertDatabaseAvailable();
    const orgId = (organizationId || "").trim().toLowerCase();
    if (!orgId || !userId) return {};
    if (this.supabase) {
      if (!UUID_REGEX2.test(orgId)) return {};
      const { data, error } = await this.supabase.from("event_rsvps").select("event_title, attending").eq("organization_id", orgId).eq("user_id", userId);
      if (error) {
        if (/does not exist|schema cache|42P01|PGRST205/i.test(error.message || "")) {
          return {};
        }
        throw new Error(`Failed to fetch event RSVPs from Supabase: ${error.message}`);
      }
      const map = {};
      for (const row of data || []) {
        if (row.event_title) {
          map[String(row.event_title)] = Boolean(row.attending);
        }
      }
      return map;
    }
    const byOrg = this.eventRsvpsByOrg.get(orgId) || {};
    const prefix = `${userId}::`;
    const result = {};
    for (const [k, val] of Object.entries(byOrg)) {
      if (k.startsWith(prefix)) {
        result[k.slice(prefix.length)] = val;
      }
    }
    return result;
  }
  async upsertEventRsvp(organizationId, userId, email, input) {
    this.assertDatabaseAvailable();
    const orgId = (organizationId || "").trim().toLowerCase();
    const eventTitle = (input.eventTitle || "").trim();
    const profile = await this.getMemberProfileForSession(orgId, userId, email);
    const memberUuid = profile?.id && UUID_REGEX2.test(String(profile.id)) ? String(profile.id) : null;
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    if (this.supabase) {
      if (!UUID_REGEX2.test(orgId)) {
        throw new Error("Valid organisation ID is required to save event RSVPs.");
      }
      const { error } = await this.supabase.from("event_rsvps").upsert(
        {
          organization_id: orgId,
          event_id: input.eventId || null,
          event_title: eventTitle,
          user_id: userId,
          member_id: memberUuid,
          attending: Boolean(input.attending),
          updated_at: nowIso
        },
        { onConflict: "organization_id,user_id,event_title" }
      );
      if (error) {
        throw new Error(`Failed to save event RSVP in Supabase: ${error.message}`);
      }
      const rsvps2 = await this.listEventRsvps(orgId, userId);
      return { eventTitle, attending: Boolean(input.attending), rsvps: rsvps2 };
    }
    const byOrg = this.eventRsvpsByOrg.get(orgId) || {};
    byOrg[`${userId}::${eventTitle}`] = Boolean(input.attending);
    this.eventRsvpsByOrg.set(orgId, byOrg);
    const rsvps = await this.listEventRsvps(orgId, userId);
    return { eventTitle, attending: Boolean(input.attending), rsvps };
  }
  // ===========================================================================
  // ORGANISATION STAFF DIRECTORY & RBAC PROVISIONING (SUPABASE + AUTH)
  // ===========================================================================
  async listOrganizationStaff(organizationId) {
    this.assertDatabaseAvailable();
    const cleanOrgId = (organizationId || "").trim().toLowerCase();
    if (!cleanOrgId) return [];
    const staffRoles = ["owner", "admin", "pastor", "usher", "group_leader", "leader", "finance", "super_admin"];
    if (this.supabase) {
      if (!UUID_REGEX2.test(cleanOrgId)) return [];
      const { data, error } = await this.supabase.from("account_credentials").select(
        "id, member_id, organization_id, email, username, phone_e164, full_name, role, is_creator, status, last_login_at, created_at, must_change_password"
      ).eq("organization_id", cleanOrgId).eq("is_creator", false).in("role", staffRoles).order("created_at", { ascending: false });
      if (error) {
        throw new Error(`Failed to load organisation staff accounts: ${error.message}`);
      }
      return (data || []).map((row) => ({
        id: String(row.id),
        memberId: row.member_id ? String(row.member_id) : void 0,
        organizationId: cleanOrgId,
        email: row.email ? String(row.email).toLowerCase() : void 0,
        username: row.username ? String(row.username).toLowerCase() : void 0,
        phoneE164: row.phone_e164 ? String(row.phone_e164) : void 0,
        fullName: String(row.full_name || "Church Staff"),
        role: String(row.role || "").toLowerCase() === "super_admin" ? "super_admin" : mapSupabaseRoleToChurchRole(row.role),
        status: row.status === "suspended" || row.status === "locked" ? "suspended" : "active",
        mustChangePassword: Boolean(row.must_change_password),
        lastLoginAt: row.last_login_at ? String(row.last_login_at) : null,
        createdAt: row.created_at ? String(row.created_at) : void 0
      }));
    }
    const result = [];
    for (const c of this.userCredentials.values()) {
      if (c.organizationId.toLowerCase() === cleanOrgId && !c.isCreator && ["admin", "pastor", "usher", "group_leader", "finance", "super_admin"].includes(c.role)) {
        result.push({
          id: c.id,
          memberId: c.memberId,
          organizationId: c.organizationId,
          email: c.email,
          username: c.username,
          phoneE164: c.phoneE164,
          fullName: c.name,
          role: c.role,
          status: c.status === "suspended" || c.status === "locked" ? "suspended" : "active",
          mustChangePassword: Boolean(c.mustChangePassword),
          lastLoginAt: null,
          createdAt: c.createdAt
        });
      }
    }
    return result;
  }
  async provisionOrganizationStaff(params) {
    this.assertDatabaseAvailable();
    const cleanOrgId = (params.organizationId || "").trim().toLowerCase();
    const org = await this.getOrganisationById(cleanOrgId);
    if (!org) {
      const err = new Error("Target organisation not found.");
      err.code = "NOT_FOUND";
      err.status = 404;
      throw err;
    }
    const email = (params.email || "").trim().toLowerCase();
    const phoneE164 = params.phone ? normalizePhone(params.phone) : "";
    const fullName = (params.fullName || "").trim();
    if (!fullName || !email) {
      const err = new Error("Full name and official email are required.");
      err.code = "INVALID_INPUT";
      err.status = 400;
      throw err;
    }
    const suppliedPassword = (params.password || "").trim();
    if (suppliedPassword && suppliedPassword.length < 8) {
      const err = new Error("Password must be at least 8 characters long.");
      err.code = "WEAK_PASSWORD";
      err.status = 400;
      throw err;
    }
    const generatedTempPassword = suppliedPassword ? void 0 : `Ek!${(0, import_crypto4.randomBytes)(6).toString("base64url")}9`;
    const effectivePassword = suppliedPassword || generatedTempPassword;
    let existingSameOrg;
    if (this.supabase) {
      const orFilters = [`email.ilike.${email}`];
      if (phoneE164) orFilters.push(`phone_e164.eq.${phoneE164}`);
      const { data: rows, error } = await this.supabase.from("account_credentials").select("*").or(orFilters.join(",")).limit(5);
      if (error) {
        throw new Error(`Failed querying staff credentials in Supabase: ${error.message}`);
      }
      if (Array.isArray(rows) && rows.length > 0) {
        for (const row of rows) {
          const rowOrgId = String(row.organization_id || "").toLowerCase();
          if (row.is_creator || rowOrgId && rowOrgId !== cleanOrgId) {
            const err = new Error(
              "This email or phone already belongs to another organisation or platform creator."
            );
            err.code = "DUPLICATE_CREDENTIAL";
            err.status = 409;
            throw err;
          }
        }
        const sameRow = rows[0];
        existingSameOrg = {
          id: String(sameRow.id),
          memberId: sameRow.member_id ? String(sameRow.member_id) : void 0,
          organizationId: cleanOrgId,
          email: sameRow.email ? String(sameRow.email).toLowerCase() : void 0,
          username: sameRow.username ? String(sameRow.username).toLowerCase() : void 0,
          phoneE164: sameRow.phone_e164 ? String(sameRow.phone_e164) : void 0,
          name: String(sameRow.full_name || fullName),
          role: mapSupabaseRoleToChurchRole(sameRow.role),
          isCreator: false,
          passwordHash: "",
          passwordSalt: "",
          status: "active"
        };
      }
    } else {
      for (const c of this.userCredentials.values()) {
        const matches = c.email && c.email.toLowerCase() === email || phoneE164 && c.phoneE164 && c.phoneE164 === phoneE164;
        if (matches) {
          if (c.isCreator || c.organizationId && c.organizationId.toLowerCase() !== cleanOrgId) {
            const err = new Error(
              "This email or phone is already assigned to another account or platform creator."
            );
            err.code = "DUPLICATE_CREDENTIAL";
            err.status = 409;
            throw err;
          }
          existingSameOrg = c;
          break;
        }
      }
    }
    let targetMemberId = existingSameOrg?.memberId;
    if (!targetMemberId) {
      const orgMembers = await this.getMembers(cleanOrgId);
      const matchedMember = orgMembers.find(
        (m) => String(m.email || "").toLowerCase() === email || phoneE164 && normalizePhone(m.phoneE164 || m.phone) === phoneE164
      );
      if (matchedMember) {
        targetMemberId = String(matchedMember.id);
        await this.updateMember(cleanOrgId, targetMemberId, {
          role: params.role === "super_admin" ? "admin" : params.role,
          status: "active",
          email,
          ...phoneE164 ? { phoneE164 } : {},
          ...params.designation ? { officerName: params.designation, designation: params.designation } : {}
        });
      } else {
        const nameParts = fullName.split(/\s+/).filter(Boolean);
        const firstName = nameParts[0] || "Staff";
        const lastName = nameParts.slice(1).join(" ") || "Member";
        const createdMember = await this.createMember(
          cleanOrgId,
          {
            firstName,
            lastName,
            email,
            phoneE164: phoneE164 || void 0,
            groupName: "Church Leadership",
            autoCheckinOptedIn: false,
            role: params.role === "super_admin" ? "admin" : params.role,
            status: "active",
            ...params.designation ? { officerName: params.designation, designation: params.designation } : {}
          },
          { skipAutoCredentials: true }
        );
        targetMemberId = String(createdMember.id);
      }
    } else if (params.designation) {
      await this.updateMember(cleanOrgId, targetMemberId, {
        officerName: params.designation,
        designation: params.designation
      }).catch(() => {
      });
    }
    const credId = existingSameOrg?.id || (UUID_REGEX2.test(targetMemberId) ? targetMemberId : (0, import_crypto4.randomUUID)());
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    const record = await this.provisionCredentialRecord({
      id: credId,
      memberId: targetMemberId,
      organizationId: cleanOrgId,
      email,
      phoneE164: phoneE164 || void 0,
      name: fullName,
      role: params.role,
      isCreator: params.role === "super_admin",
      password: effectivePassword,
      mustChangePassword: !suppliedPassword,
      passwordUpdatedAt: nowIso
    });
    if (params.designation && !this.supabase) {
      const memCred = this.userCredentials.get(record.id);
      if (memCred) {
        this.userCredentials.set(record.id, { ...memCred, designation: params.designation });
      }
    }
    await this.recordAuthAuditEvent({
      organizationId: cleanOrgId,
      accountId: record.id,
      identifier: email,
      eventType: existingSameOrg ? "password_changed" : "account_auto_provisioned",
      ipAddress: params.ipAddress,
      success: true,
      reason: `staff_provisioned:${params.role}`
    });
    return {
      staff: {
        id: record.id,
        memberId: record.memberId,
        organizationId: cleanOrgId,
        email: record.email,
        phoneE164: record.phoneE164,
        fullName: record.name,
        role: record.role,
        status: "active",
        mustChangePassword: Boolean(record.mustChangePassword)
      },
      ...generatedTempPassword ? { temporaryPassword: generatedTempPassword } : {},
      resetExisting: Boolean(existingSameOrg)
    };
  }
  async listOrganizationUsers(organizationId, options) {
    this.assertDatabaseAvailable();
    const cleanOrgId = (organizationId || "").trim().toLowerCase();
    if (!cleanOrgId) return [];
    const sb = this.activeSupabase;
    const orgMembers = await this.getMembers(cleanOrgId);
    const includeTemporaryPasswords = Boolean(options?.includeTemporaryPasswords);
    const resolveCredentialStatus = (status, mustChangePassword, lockedUntil) => {
      if (status === "suspended") return "suspended";
      if (status === "locked" || lockedUntil && !Number.isNaN(Date.parse(lockedUntil)) && Date.parse(lockedUntil) > Date.now()) {
        return "locked";
      }
      return mustChangePassword ? "temp_password" : "active";
    };
    const credRows = [];
    if (sb) {
      if (UUID_REGEX2.test(cleanOrgId)) {
        let queryRes = await sb.from("account_credentials").select(
          "id, member_id, organization_id, email, username, phone_e164, full_name, role, is_creator, status, locked_until, last_login_at, created_at, must_change_password, password_updated_at, temp_password_encrypted"
        ).eq("organization_id", cleanOrgId).eq("is_creator", false).order("created_at", { ascending: false });
        if (queryRes.error && /column .* does not exist|Could not find the '[^']+' column|schema cache/i.test(
          queryRes.error.message || ""
        )) {
          queryRes = await sb.from("account_credentials").select(
            "id, member_id, organization_id, email, username, phone_e164, full_name, role, is_creator, status, locked_until, last_login_at, created_at, must_change_password"
          ).eq("organization_id", cleanOrgId).eq("is_creator", false).order("created_at", { ascending: false });
        }
        if (queryRes.error) {
          throw new Error(`Failed to load organisation user accounts: ${queryRes.error.message}`);
        }
        for (const row of queryRes.data || []) {
          credRows.push({
            id: String(row.id),
            memberId: row.member_id ? String(row.member_id) : void 0,
            email: row.email ? String(row.email).toLowerCase() : void 0,
            username: row.username ? String(row.username).toLowerCase() : void 0,
            phoneE164: row.phone_e164 ? String(row.phone_e164) : void 0,
            fullName: String(row.full_name || "Church User"),
            role: String(row.role || "").toLowerCase() === "super_admin" ? "super_admin" : mapSupabaseRoleToChurchRole(row.role),
            status: String(row.status || "active"),
            mustChangePassword: Boolean(row.must_change_password),
            tempPasswordEncrypted: row.temp_password_encrypted ? String(row.temp_password_encrypted) : null,
            passwordUpdatedAt: row.password_updated_at ? String(row.password_updated_at) : null,
            lockedUntil: row.locked_until ? String(row.locked_until) : null,
            lastLoginAt: row.last_login_at ? String(row.last_login_at) : null,
            createdAt: row.created_at ? String(row.created_at) : void 0
          });
        }
      }
    } else {
      for (const c of this.userCredentials.values()) {
        if (c.organizationId.toLowerCase() === cleanOrgId && !c.isCreator) {
          credRows.push({
            id: c.id,
            memberId: c.memberId,
            email: c.email,
            username: c.username,
            phoneE164: c.phoneE164,
            fullName: c.name,
            role: c.role,
            status: c.status,
            mustChangePassword: Boolean(c.mustChangePassword),
            temporaryPassword: c.temporaryPassword,
            passwordUpdatedAt: c.passwordUpdatedAt ?? null,
            lockedUntil: c.lockedUntil || null,
            lastLoginAt: null,
            createdAt: c.createdAt
          });
        }
      }
    }
    const matchedMemberIds = /* @__PURE__ */ new Set();
    const results = [];
    const matchMemberForCred = (c) => {
      if (c.memberId) {
        const byId = orgMembers.find(
          (m) => String(m.id) === c.memberId || String(m.id) === c.id
        );
        if (byId) return byId;
      }
      const cleanEmail = (c.email || "").trim().toLowerCase();
      const cleanPhone = c.phoneE164 ? normalizePhone(c.phoneE164) : "";
      return orgMembers.find((m) => {
        const mEmail = String(m.email || "").trim().toLowerCase();
        const mPhone = m.phoneE164 || m.phone ? normalizePhone(m.phoneE164 || m.phone) : "";
        return cleanEmail && mEmail === cleanEmail || cleanPhone && mPhone === cleanPhone;
      });
    };
    for (const c of credRows) {
      const linkedMember = matchMemberForCred(c);
      if (linkedMember) {
        matchedMemberIds.add(String(linkedMember.id));
      }
      const memberDisplayName = linkedMember ? `${String(linkedMember.firstName || "").trim()} ${String(linkedMember.lastName || "").trim()}`.trim() : "";
      const role = c.role;
      const resolvedTemporaryPassword = includeTemporaryPasswords && c.mustChangePassword && role !== "super_admin" && role !== "creator" ? unsealTemporaryPassword(c.tempPasswordEncrypted) || this.tempPasswordByCredId.get(c.id) || c.temporaryPassword || (role === "member" && !c.passwordUpdatedAt ? this.getGenericOnboardingPassword() : void 0) : void 0;
      results.push({
        id: c.id,
        memberId: linkedMember ? String(linkedMember.id) : c.memberId,
        memberCode: linkedMember?.memberId ? String(linkedMember.memberId) : void 0,
        organizationId: cleanOrgId,
        fullName: c.fullName || memberDisplayName || "Church User",
        email: c.email || (linkedMember?.email ? String(linkedMember.email).toLowerCase() : void 0),
        username: c.username,
        phoneE164: c.phoneE164 || (linkedMember?.phoneE164 ? normalizePhone(String(linkedMember.phoneE164)) : void 0),
        role,
        accountCategory: role === "member" ? "member" : "staff",
        hasCredentials: true,
        credentialStatus: resolveCredentialStatus(c.status, c.mustChangePassword, c.lockedUntil),
        status: c.status === "suspended" ? "suspended" : "active",
        mustChangePassword: Boolean(c.mustChangePassword),
        ...resolvedTemporaryPassword ? { temporaryPassword: resolvedTemporaryPassword } : {},
        lastLoginAt: c.lastLoginAt,
        createdAt: c.createdAt,
        homeCellGroup: linkedMember?.homeCellGroup || linkedMember?.groupName || void 0,
        department: linkedMember?.department || void 0,
        designation: linkedMember?.designation || linkedMember?.officerName || void 0
      });
    }
    for (const m of orgMembers) {
      const mId = String(m.id);
      if (matchedMemberIds.has(mId)) continue;
      const memberDisplayName = `${String(m.firstName || "").trim()} ${String(m.lastName || "").trim()}`.trim() || "Congregation Member";
      const role = mapSupabaseRoleToChurchRole(m.role || "member");
      results.push({
        id: mId,
        memberId: mId,
        memberCode: m.memberId ? String(m.memberId) : void 0,
        organizationId: cleanOrgId,
        fullName: memberDisplayName,
        email: m.email ? String(m.email).trim().toLowerCase() : void 0,
        phoneE164: m.phoneE164 ? normalizePhone(String(m.phoneE164)) : void 0,
        role,
        accountCategory: role === "member" ? "member" : "staff",
        hasCredentials: false,
        credentialStatus: "unprovisioned",
        status: "active",
        mustChangePassword: false,
        lastLoginAt: null,
        createdAt: m.joinedOn ? String(m.joinedOn) : void 0,
        homeCellGroup: m.homeCellGroup || m.groupName || void 0,
        department: m.department || void 0,
        designation: m.designation || m.officerName || void 0
      });
    }
    return results;
  }
  async provisionOrganizationMemberCredentials(params) {
    this.assertDatabaseAvailable();
    const cleanOrgId = (params.organizationId || "").trim().toLowerCase();
    const org = await this.getOrganisationById(cleanOrgId);
    if (!org) {
      const err = new Error("Target organisation not found.");
      err.code = "NOT_FOUND";
      err.status = 404;
      throw err;
    }
    const orgMembers = await this.getMembers(cleanOrgId);
    let targetMember;
    let resolvedCredFromLookup = null;
    const requestedMemberId = params.memberId?.trim() || "";
    const requestedCredId = params.credentialId?.trim() || "";
    if (requestedMemberId) {
      targetMember = orgMembers.find(
        (m) => String(m.id) === requestedMemberId || String(m.memberId || "") === requestedMemberId
      );
    }
    const sbLookup = this.activeSupabase;
    const candidateCredId = requestedCredId || (!targetMember ? requestedMemberId : "");
    if (candidateCredId && sbLookup && UUID_REGEX2.test(candidateCredId) && UUID_REGEX2.test(cleanOrgId)) {
      const { data: credRow } = await sbLookup.from("account_credentials").select("*").eq("organization_id", cleanOrgId).or(`id.eq.${candidateCredId},member_id.eq.${candidateCredId}`).limit(1).maybeSingle();
      if (credRow) {
        resolvedCredFromLookup = credRow;
        if (!targetMember && credRow.member_id) {
          targetMember = orgMembers.find((m) => String(m.id) === String(credRow.member_id));
        }
      }
    }
    if (requestedMemberId && !targetMember && !resolvedCredFromLookup) {
      const err = new Error("Selected member was not found in this organisation.");
      err.code = "MEMBER_NOT_FOUND";
      err.status = 404;
      throw err;
    }
    const email = (params.email ?? targetMember?.email ?? resolvedCredFromLookup?.email ?? "").trim().toLowerCase();
    const rawPhone = (params.phone ?? targetMember?.phoneE164 ?? resolvedCredFromLookup?.phone_e164 ?? "").trim();
    const phoneE164 = rawPhone ? normalizePhone(rawPhone) : "";
    const memberFullName = targetMember ? `${String(targetMember.firstName || "").trim()} ${String(targetMember.lastName || "").trim()}`.trim() : resolvedCredFromLookup?.full_name ? String(resolvedCredFromLookup.full_name).trim() : "";
    const fullName = (params.fullName || memberFullName || "").trim();
    if (!fullName) {
      const err = new Error("Full name is required to provision user credentials.");
      err.code = "INVALID_INPUT";
      err.status = 400;
      throw err;
    }
    if (!email && !phoneE164) {
      const err = new Error(
        "An email address or phone number is required to create or reset login credentials."
      );
      err.code = "INVALID_INPUT";
      err.status = 400;
      throw err;
    }
    const suppliedPassword = (params.password || "").trim();
    if (suppliedPassword && suppliedPassword.length < 8) {
      const err = new Error("Password must be at least 8 characters long.");
      err.code = "WEAK_PASSWORD";
      err.status = 400;
      throw err;
    }
    const generatedTempPassword = suppliedPassword ? void 0 : `Ek!${(0, import_crypto4.randomBytes)(6).toString("base64url")}9`;
    const effectivePassword = suppliedPassword || generatedTempPassword;
    const mustChangePassword = suppliedPassword ? Boolean(params.requirePasswordChange) : params.requirePasswordChange !== false;
    const sb = this.activeSupabase;
    let existingSameOrg;
    if (sb) {
      const orFilters = [];
      if (targetMember?.id && UUID_REGEX2.test(String(targetMember.id))) {
        orFilters.push(`member_id.eq.${targetMember.id}`, `id.eq.${targetMember.id}`);
      }
      if (email) orFilters.push(`email.ilike.${email}`);
      if (phoneE164) orFilters.push(`phone_e164.eq.${phoneE164}`);
      if (orFilters.length > 0) {
        const { data: rows, error } = await sb.from("account_credentials").select("*").or(orFilters.join(",")).limit(10);
        if (error) {
          throw new Error(`Failed querying user credentials in Supabase: ${error.message}`);
        }
        if (Array.isArray(rows) && rows.length > 0) {
          for (const row of rows) {
            const rowOrgId = String(row.organization_id || "").toLowerCase();
            if (row.is_creator || rowOrgId && rowOrgId !== cleanOrgId) {
              const err = new Error(
                "This email or phone already belongs to another organisation or platform creator."
              );
              err.code = "DUPLICATE_CREDENTIAL";
              err.status = 409;
              throw err;
            }
          }
          const sameRow = rows.find((r) => targetMember && String(r.member_id || "") === String(targetMember.id)) || rows[0];
          existingSameOrg = {
            id: String(sameRow.id),
            memberId: sameRow.member_id ? String(sameRow.member_id) : void 0,
            organizationId: cleanOrgId,
            email: sameRow.email ? String(sameRow.email).toLowerCase() : void 0,
            username: sameRow.username ? String(sameRow.username).toLowerCase() : void 0,
            phoneE164: sameRow.phone_e164 ? String(sameRow.phone_e164) : void 0,
            name: String(sameRow.full_name || fullName),
            role: mapSupabaseRoleToChurchRole(sameRow.role),
            isCreator: false,
            passwordHash: "",
            passwordSalt: "",
            status: "active"
          };
        }
      }
    } else {
      for (const c of this.userCredentials.values()) {
        const sameTargetMember = targetMember && (c.memberId === String(targetMember.id) || c.id === String(targetMember.id));
        const sameContact = email && c.email && c.email.toLowerCase() === email || phoneE164 && c.phoneE164 && c.phoneE164 === phoneE164;
        if (sameTargetMember || sameContact) {
          if (c.isCreator || c.organizationId && c.organizationId.toLowerCase() !== cleanOrgId) {
            const err = new Error(
              "This email or phone is already assigned to another organisation or platform creator."
            );
            err.code = "DUPLICATE_CREDENTIAL";
            err.status = 409;
            throw err;
          }
          existingSameOrg = c;
          break;
        }
      }
    }
    let targetMemberId = targetMember ? String(targetMember.id) : existingSameOrg?.memberId;
    if (!targetMemberId) {
      const matched = orgMembers.find(
        (m) => email && String(m.email || "").toLowerCase() === email || phoneE164 && m.phoneE164 && normalizePhone(String(m.phoneE164)) === phoneE164
      );
      if (matched) {
        targetMember = matched;
        targetMemberId = String(matched.id);
      }
    }
    const mappedMemberRole = params.role === "super_admin" ? "admin" : params.role;
    const cleanDesignation = params.designation?.trim();
    const nameParts = fullName.split(/\s+/).filter(Boolean);
    const parsedFirstName = nameParts[0] || "Church";
    const parsedLastName = nameParts.slice(1).join(" ") || parsedFirstName;
    if (targetMemberId) {
      await this.updateMember(cleanOrgId, targetMemberId, {
        ...params.fullName?.trim() ? { firstName: parsedFirstName, lastName: parsedLastName } : {},
        role: mappedMemberRole,
        ...email ? { email } : {},
        ...phoneE164 ? { phoneE164, phoneNumber: phoneE164 } : {},
        ...cleanDesignation ? { officerName: cleanDesignation, designation: cleanDesignation } : {}
      });
    } else {
      const createdMember = await this.createMember(
        cleanOrgId,
        {
          firstName: parsedFirstName,
          lastName: parsedLastName,
          email: email || void 0,
          phoneE164: phoneE164 || void 0,
          groupName: params.role === "member" ? "General Congregation" : "Church Leadership",
          autoCheckinOptedIn: params.role === "member",
          role: mappedMemberRole,
          status: params.role === "member" ? "member" : "active",
          ...cleanDesignation ? { officerName: cleanDesignation, designation: cleanDesignation } : {}
        },
        { skipAutoCredentials: true }
      );
      targetMember = createdMember;
      targetMemberId = String(createdMember.id);
    }
    const credId = existingSameOrg?.id || (resolvedCredFromLookup?.id ? String(resolvedCredFromLookup.id) : void 0) || (targetMemberId && UUID_REGEX2.test(targetMemberId) ? targetMemberId : (0, import_crypto4.randomUUID)());
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    const record = await this.provisionCredentialRecord({
      id: credId,
      memberId: targetMemberId,
      organizationId: cleanOrgId,
      email: email || void 0,
      phoneE164: phoneE164 || void 0,
      name: fullName,
      role: params.role,
      isCreator: params.role === "super_admin",
      password: effectivePassword,
      mustChangePassword,
      passwordUpdatedAt: nowIso
    });
    await this.resetDistributedAuthRateLimit(`login:${record.id}`);
    await this.recordAuthAuditEvent({
      organizationId: cleanOrgId,
      accountId: record.id,
      identifier: email || phoneE164 || fullName,
      eventType: existingSameOrg ? "password_changed" : "account_auto_provisioned",
      ipAddress: params.ipAddress,
      success: true,
      reason: `user_credentials_managed:${params.role}`
    });
    await this.appendAuditLog({
      organizationId: cleanOrgId,
      actorId: params.actorId ?? null,
      actorEmail: params.actorEmail || "admin@ekklesphere.local",
      actorRole: "admin",
      action: existingSameOrg ? "user_credentials.reset" : "user_credentials.provisioned",
      targetType: "account_credentials",
      targetId: record.id,
      metadata: {
        memberId: targetMemberId,
        fullName,
        email: email || null,
        phoneE164: phoneE164 || null,
        role: params.role,
        mustChangePassword
      },
      ipAddress: params.ipAddress || null
    });
    return {
      user: {
        id: record.id,
        memberId: record.memberId,
        memberCode: targetMember?.memberId ? String(targetMember.memberId) : void 0,
        organizationId: cleanOrgId,
        fullName: record.name,
        email: record.email,
        phoneE164: record.phoneE164,
        role: record.role,
        accountCategory: record.role === "member" ? "member" : "staff",
        hasCredentials: true,
        credentialStatus: record.mustChangePassword ? "temp_password" : "active",
        status: "active",
        mustChangePassword: Boolean(record.mustChangePassword),
        ...record.mustChangePassword ? { temporaryPassword: effectivePassword } : {},
        lastLoginAt: null,
        createdAt: record.createdAt || nowIso,
        homeCellGroup: targetMember?.homeCellGroup || targetMember?.groupName || void 0,
        department: targetMember?.department || void 0,
        designation: cleanDesignation || targetMember?.designation || targetMember?.officerName || void 0
      },
      ...generatedTempPassword ? { temporaryPassword: generatedTempPassword } : {},
      resetExisting: Boolean(existingSameOrg)
    };
  }
  async updateOrganizationUserAccount(params) {
    this.assertDatabaseAvailable();
    const cleanOrgId = (params.organizationId || "").trim().toLowerCase();
    const targetId = (params.targetId || "").trim();
    if (!cleanOrgId || !targetId) {
      const err = new Error("Target user account ID is required.");
      err.code = "INVALID_INPUT";
      err.status = 400;
      throw err;
    }
    if (params.role === "super_admin" && !params.callerIsCreator) {
      const err = new Error("Only platform creators may assign super admin privileges.");
      err.code = "FORBIDDEN";
      err.status = 403;
      throw err;
    }
    if (params.status === "suspended" && params.actorUserId && params.actorUserId === targetId) {
      const err = new Error("You cannot suspend your own active signed-in account.");
      err.code = "SELF_SUSPEND_BLOCKED";
      err.status = 400;
      throw err;
    }
    const cleanName = params.fullName !== void 0 ? params.fullName.trim() : void 0;
    const cleanEmail = params.email !== void 0 ? params.email.trim().toLowerCase() : void 0;
    const cleanPhoneE164 = params.phone !== void 0 ? params.phone.trim() ? normalizePhone(params.phone.trim()) : "" : void 0;
    const splitName = cleanName ? (() => {
      const parts = cleanName.split(/\s+/).filter(Boolean);
      return {
        firstName: parts[0] || cleanName,
        lastName: parts.slice(1).join(" ") || parts[0] || cleanName
      };
    })() : null;
    const sb = this.activeSupabase;
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    if (sb) {
      let credRow = null;
      if (UUID_REGEX2.test(targetId) && UUID_REGEX2.test(cleanOrgId)) {
        const { data, error } = await sb.from("account_credentials").select("*").eq("organization_id", cleanOrgId).or(`id.eq.${targetId},member_id.eq.${targetId}`).limit(1).maybeSingle();
        if (error) {
          throw new Error(`Failed querying user account in Supabase: ${error.message}`);
        }
        credRow = data || null;
      }
      if (credRow) {
        if (credRow.is_creator && !params.callerIsCreator) {
          const err = new Error("Platform creator accounts cannot be modified here.");
          err.code = "FORBIDDEN";
          err.status = 403;
          throw err;
        }
        if (params.status === "suspended" && params.actorUserId && (credRow.id === params.actorUserId || credRow.member_id === params.actorUserId)) {
          const err = new Error("You cannot suspend your own active signed-in account.");
          err.code = "SELF_SUSPEND_BLOCKED";
          err.status = 400;
          throw err;
        }
        const orgMembers = await this.getMembers(cleanOrgId);
        let linkedMemberId = credRow.member_id ? String(credRow.member_id) : void 0;
        if (!linkedMemberId) {
          const prevEmail = credRow.email ? String(credRow.email).trim().toLowerCase() : "";
          const prevPhone = credRow.phone_e164 ? normalizePhone(String(credRow.phone_e164)) : "";
          const matchedMember = orgMembers.find((m) => {
            const mEmail = String(m.email || "").trim().toLowerCase();
            const mPhone = m.phoneE164 || m.phone ? normalizePhone(String(m.phoneE164 || m.phone)) : "";
            return String(m.id) === String(credRow.id) || prevEmail && mEmail === prevEmail || prevPhone && mPhone === prevPhone || cleanEmail && mEmail === cleanEmail || cleanPhoneE164 && mPhone === cleanPhoneE164;
          });
          if (matchedMember?.id) {
            linkedMemberId = String(matchedMember.id);
          }
        }
        const patch = { updated_at: nowIso };
        if (cleanName) patch.full_name = cleanName;
        if (cleanEmail !== void 0) patch.email = cleanEmail || null;
        if (cleanPhoneE164 !== void 0) patch.phone_e164 = cleanPhoneE164 || null;
        if (params.role) patch.role = params.role;
        if (linkedMemberId && !credRow.member_id && UUID_REGEX2.test(linkedMemberId)) {
          patch.member_id = linkedMemberId;
        }
        if (params.status) {
          patch.status = params.status;
          if (params.status === "active") {
            patch.locked_until = null;
            patch.failed_attempts = 0;
          }
        }
        const { error: updErr } = await sb.from("account_credentials").update(patch).eq("organization_id", cleanOrgId).eq("id", credRow.id);
        if (updErr) {
          throw new Error(`Failed updating user account in Supabase: ${updErr.message}`);
        }
        if (credRow.auth_user_id && sb.auth?.admin?.updateUserById) {
          const authEmail = cleanEmail || (credRow.email ? String(credRow.email).trim().toLowerCase() : "") || (cleanPhoneE164 ? `phone-${cleanPhoneE164.replace(/\D/g, "")}@members.ekklesphere.local` : "");
          await sb.auth.admin.updateUserById(String(credRow.auth_user_id), {
            ...authEmail ? { email: authEmail, email_confirm: true } : {},
            user_metadata: {
              full_name: cleanName || credRow.full_name || "Ekklesphere User",
              role: params.role || credRow.role,
              organization_id: cleanOrgId,
              ...linkedMemberId ? { member_id: linkedMemberId } : {}
            },
            app_metadata: {
              role: params.role || credRow.role,
              organization_id: cleanOrgId,
              is_creator: Boolean(credRow.is_creator)
            }
          }).catch((authSyncErr) => {
            console.warn("[Ekklesphere Auth Sync] updateOrganizationUserAccount warning:", authSyncErr?.message || authSyncErr);
          });
        }
        if (linkedMemberId && (params.role || params.designation !== void 0 || cleanName || cleanEmail !== void 0 || cleanPhoneE164 !== void 0)) {
          await this.updateMember(cleanOrgId, linkedMemberId, {
            ...splitName ? { firstName: splitName.firstName, lastName: splitName.lastName } : {},
            ...cleanEmail !== void 0 ? { email: cleanEmail } : {},
            ...cleanPhoneE164 !== void 0 ? { phoneE164: cleanPhoneE164, phoneNumber: cleanPhoneE164 } : {},
            ...params.role ? { role: params.role === "super_admin" ? "admin" : params.role } : {},
            ...params.designation !== void 0 ? { officerName: params.designation, designation: params.designation } : {}
          });
        }
        if (params.status === "active") {
          await this.resetDistributedAuthRateLimit(`login:${credRow.id}`);
        }
      } else {
        if (params.status === "suspended") {
          const err = new Error(
            "This member does not have login credentials yet. Issue credentials before suspending login."
          );
          err.code = "NO_CREDENTIALS";
          err.status = 400;
          throw err;
        }
        const orgMembers = await this.getMembers(cleanOrgId);
        const foundMember = orgMembers.find((m) => String(m.id) === targetId);
        if (!foundMember) {
          const err = new Error("User or member account not found in this organisation.");
          err.code = "NOT_FOUND";
          err.status = 404;
          throw err;
        }
        if (params.role || params.designation !== void 0 || cleanName || cleanEmail !== void 0 || cleanPhoneE164 !== void 0) {
          await this.updateMember(cleanOrgId, targetId, {
            ...splitName ? { firstName: splitName.firstName, lastName: splitName.lastName } : {},
            ...cleanEmail !== void 0 ? { email: cleanEmail } : {},
            ...cleanPhoneE164 !== void 0 ? { phoneE164: cleanPhoneE164, phoneNumber: cleanPhoneE164 } : {},
            ...params.role ? { role: params.role === "super_admin" ? "admin" : params.role } : {},
            ...params.designation !== void 0 ? { officerName: params.designation, designation: params.designation } : {}
          });
        }
      }
    } else {
      let cred;
      for (const c of this.userCredentials.values()) {
        if (c.organizationId.toLowerCase() === cleanOrgId && (c.id === targetId || c.memberId === targetId)) {
          cred = c;
          break;
        }
      }
      if (cred) {
        if (cred.isCreator && !params.callerIsCreator) {
          const err = new Error("Platform creator accounts cannot be modified here.");
          err.code = "FORBIDDEN";
          err.status = 403;
          throw err;
        }
        if (params.status === "suspended" && params.actorUserId && (cred.id === params.actorUserId || cred.memberId === params.actorUserId)) {
          const err = new Error("You cannot suspend your own active signed-in account.");
          err.code = "SELF_SUSPEND_BLOCKED";
          err.status = 400;
          throw err;
        }
        if (cleanName) cred.name = cleanName;
        if (cleanEmail !== void 0) cred.email = cleanEmail || void 0;
        if (cleanPhoneE164 !== void 0) cred.phoneE164 = cleanPhoneE164 || void 0;
        if (params.role) cred.role = params.role;
        if (params.status) {
          cred.status = params.status;
          if (params.status === "active") {
            cred.lockedUntil = null;
            cred.failedAttempts = 0;
          }
        }
        if (cred.memberId && (params.role || params.designation !== void 0 || cleanName || cleanEmail !== void 0 || cleanPhoneE164 !== void 0)) {
          await this.updateMember(cleanOrgId, cred.memberId, {
            ...splitName ? { firstName: splitName.firstName, lastName: splitName.lastName } : {},
            ...cleanEmail !== void 0 ? { email: cleanEmail } : {},
            ...cleanPhoneE164 !== void 0 ? { phoneE164: cleanPhoneE164, phoneNumber: cleanPhoneE164 } : {},
            ...params.role ? { role: params.role === "super_admin" ? "admin" : params.role } : {},
            ...params.designation !== void 0 ? { officerName: params.designation, designation: params.designation } : {}
          }).catch(() => {
          });
        }
      } else {
        if (params.status === "suspended") {
          const err = new Error(
            "This member does not have login credentials yet. Issue credentials before suspending login."
          );
          err.code = "NO_CREDENTIALS";
          err.status = 400;
          throw err;
        }
        const orgMembers = await this.getMembers(cleanOrgId);
        const foundMember = orgMembers.find((m) => String(m.id) === targetId);
        if (!foundMember) {
          const err = new Error("User or member account not found in this organisation.");
          err.code = "NOT_FOUND";
          err.status = 404;
          throw err;
        }
        if (params.role || params.designation !== void 0 || cleanName || cleanEmail !== void 0 || cleanPhoneE164 !== void 0) {
          await this.updateMember(cleanOrgId, targetId, {
            ...splitName ? { firstName: splitName.firstName, lastName: splitName.lastName } : {},
            ...cleanEmail !== void 0 ? { email: cleanEmail } : {},
            ...cleanPhoneE164 !== void 0 ? { phoneE164: cleanPhoneE164, phoneNumber: cleanPhoneE164 } : {},
            ...params.role ? { role: params.role === "super_admin" ? "admin" : params.role } : {},
            ...params.designation !== void 0 ? { officerName: params.designation, designation: params.designation } : {}
          });
        }
      }
    }
    await this.appendAuditLog({
      organizationId: cleanOrgId,
      actorId: params.actorUserId ?? null,
      actorEmail: params.actorEmail || "admin@ekklesphere.local",
      actorRole: "admin",
      action: "user_account.updated",
      targetType: "account_credentials",
      targetId,
      metadata: {
        ...cleanName ? { fullName: cleanName } : {},
        ...cleanEmail !== void 0 ? { email: cleanEmail || null } : {},
        ...params.role ? { role: params.role } : {},
        ...params.status ? { status: params.status } : {}
      },
      ipAddress: params.ipAddress || null
    });
    const refreshed = await this.listOrganizationUsers(cleanOrgId, {
      includeTemporaryPasswords: true
    });
    const updatedUser = refreshed.find((u) => u.id === targetId || u.memberId === targetId);
    if (!updatedUser) {
      const err = new Error("Updated user account could not be loaded.");
      err.code = "NOT_FOUND";
      err.status = 404;
      throw err;
    }
    return updatedUser;
  }
  async deleteOrganizationUserAccount(params) {
    this.assertDatabaseAvailable();
    const cleanOrgId = (params.organizationId || "").trim().toLowerCase();
    const targetId = (params.targetId || "").trim();
    if (!cleanOrgId || !targetId) {
      const err = new Error("Target user account ID is required.");
      err.code = "INVALID_INPUT";
      err.status = 400;
      throw err;
    }
    if (params.actorUserId && params.actorUserId === targetId) {
      const err = new Error("You cannot delete your own active signed-in account.");
      err.code = "SELF_DELETE_BLOCKED";
      err.status = 400;
      throw err;
    }
    let deletedCredentialId;
    let deletedMemberId;
    const sb = this.activeSupabase;
    if (sb) {
      let credRow = null;
      if (UUID_REGEX2.test(targetId) && UUID_REGEX2.test(cleanOrgId)) {
        const { data, error } = await sb.from("account_credentials").select("*").eq("organization_id", cleanOrgId).or(`id.eq.${targetId},member_id.eq.${targetId}`).limit(1).maybeSingle();
        if (error) {
          throw new Error(`Failed querying user account in Supabase: ${error.message}`);
        }
        credRow = data || null;
      }
      if (credRow) {
        if (credRow.is_creator && !params.callerIsCreator) {
          const err = new Error("Platform creator accounts cannot be deleted here.");
          err.code = "FORBIDDEN";
          err.status = 403;
          throw err;
        }
        if (params.actorUserId && (credRow.id === params.actorUserId || credRow.member_id === params.actorUserId)) {
          const err = new Error("You cannot delete your own active signed-in account.");
          err.code = "SELF_DELETE_BLOCKED";
          err.status = 400;
          throw err;
        }
        const { error: delErr } = await sb.from("account_credentials").delete().eq("organization_id", cleanOrgId).eq("id", credRow.id);
        if (delErr) {
          throw new Error(`Failed deleting user credentials in Supabase: ${delErr.message}`);
        }
        deletedCredentialId = String(credRow.id);
        this.tempPasswordByCredId.delete(deletedCredentialId);
        const linkedMemberId = credRow.member_id ? String(credRow.member_id) : void 0;
        if (linkedMemberId) {
          await this.deleteMember(cleanOrgId, linkedMemberId).catch(() => {
          });
          deletedMemberId = linkedMemberId;
        }
      } else {
        const orgMembers = await this.getMembers(cleanOrgId);
        const foundMember = orgMembers.find((m) => String(m.id) === targetId);
        if (!foundMember) {
          const err = new Error("User or member account not found in this organisation.");
          err.code = "NOT_FOUND";
          err.status = 404;
          throw err;
        }
        await this.deleteMember(cleanOrgId, targetId);
        deletedMemberId = targetId;
      }
    } else {
      let credKey;
      let cred;
      for (const [key, c] of this.userCredentials.entries()) {
        if (c.organizationId.toLowerCase() === cleanOrgId && (c.id === targetId || c.memberId === targetId)) {
          credKey = key;
          cred = c;
          break;
        }
      }
      if (cred && credKey) {
        if (cred.isCreator && !params.callerIsCreator) {
          const err = new Error("Platform creator accounts cannot be deleted here.");
          err.code = "FORBIDDEN";
          err.status = 403;
          throw err;
        }
        if (params.actorUserId && (cred.id === params.actorUserId || cred.memberId === params.actorUserId)) {
          const err = new Error("You cannot delete your own active signed-in account.");
          err.code = "SELF_DELETE_BLOCKED";
          err.status = 400;
          throw err;
        }
        this.userCredentials.delete(credKey);
        this.tempPasswordByCredId.delete(cred.id);
        deletedCredentialId = cred.id;
        if (cred.memberId) {
          await this.deleteMember(cleanOrgId, cred.memberId).catch(() => {
          });
          deletedMemberId = cred.memberId;
        }
      } else {
        const orgMembers = await this.getMembers(cleanOrgId);
        const foundMember = orgMembers.find((m) => String(m.id) === targetId);
        if (!foundMember) {
          const err = new Error("User or member account not found in this organisation.");
          err.code = "NOT_FOUND";
          err.status = 404;
          throw err;
        }
        await this.deleteMember(cleanOrgId, targetId);
        deletedMemberId = targetId;
      }
    }
    await this.appendAuditLog({
      organizationId: cleanOrgId,
      actorId: params.actorUserId ?? null,
      actorEmail: params.actorEmail || "admin@ekklesphere.local",
      actorRole: "admin",
      action: "user_account.deleted",
      targetType: "account_credentials",
      targetId,
      metadata: {
        ...deletedCredentialId ? { deletedCredentialId } : {},
        ...deletedMemberId ? { deletedMemberId } : {}
      },
      ipAddress: params.ipAddress || null
    });
    return { deletedCredentialId, deletedMemberId };
  }
};
var platformStore = new PlatformStore();

// src/server/licenseMiddleware.ts
async function requireActiveLicense(req, res, next) {
  if (!req.user) {
    res.status(401).json({
      error: "unauthorized",
      message: "Authentication required before evaluating organisation license."
    });
    return;
  }
  const orgId = (req.organizationId || req.tenant_id || "").toLowerCase();
  if (isCreatorClaim(req.user)) {
    if (orgId) {
      const evalForCreator = await platformStore.evaluateOrganizationLicense(orgId);
      res.setHeader("x-license-status", evalForCreator.status);
      if (evalForCreator.tier) {
        res.setHeader("x-license-tier", evalForCreator.tier);
      }
    }
    next();
    return;
  }
  if (!orgId) {
    res.status(403).json({
      error: "unassigned_organization",
      code: "NO_ORGANIZATION_FOUND",
      message: "No active church organization associated with this session."
    });
    return;
  }
  const evaluation = await platformStore.evaluateOrganizationLicense(orgId);
  res.setHeader("x-license-status", evaluation.status);
  if (evaluation.tier) {
    res.setHeader("x-license-tier", evaluation.tier);
  }
  if (evaluation.inGracePeriod && evaluation.graceDaysRemaining !== null) {
    res.setHeader("x-license-grace-days", String(evaluation.graceDaysRemaining));
  }
  if (!evaluation.allowed) {
    res.status(evaluation.httpStatus).json({
      error: "license_enforcement_blocked",
      code: evaluation.code,
      status: evaluation.status,
      message: evaluation.message,
      evaluation
    });
    return;
  }
  next();
}

// src/server/consoleRouter.ts
var import_express = __toESM(require("express"), 1);
var import_express_rate_limit = __toESM(require("express-rate-limit"), 1);
var import_papaparse = __toESM(require("papaparse"), 1);
var import_zod = require("zod");
var consoleRouter = import_express.default.Router();
function clientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.trim()) {
    return xff.split(",")[0].trim();
  }
  const fwd = req.headers.forwarded;
  if (typeof fwd === "string" && fwd.trim()) {
    const match = fwd.match(/for="?([^;,"]+)/i);
    if (match?.[1]) return match[1].trim();
  }
  return req.ip || req.socket?.remoteAddress || "unknown";
}
var consoleRateLimiter = (0, import_express_rate_limit.default)({
  windowMs: 60 * 1e3,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  passOnStoreError: true,
  keyGenerator: (req) => clientIp(req),
  validate: false,
  message: {
    error: "rate_limit_exceeded",
    message: "Too many Creator Console requests. Please wait a moment and retry."
  }
});
consoleRouter.use(consoleRateLimiter);
var LicenseTierEnum = import_zod.z.enum(["grace_starter", "ministry_pro", "cathedral_enterprise"]);
var BillingCycleEnum = import_zod.z.enum(["monthly", "annual", "lifetime"]);
var OrgStatusEnum = import_zod.z.enum(["active", "trial", "suspended", "maintenance", "archived"]);
var OrgTypeEnum = import_zod.z.enum(["church", "organisation"]);
var CreateOrgSchema = import_zod.z.object({
  name: import_zod.z.string().trim().min(2, "Organisation name is required").max(200),
  slug: import_zod.z.string().trim().max(120).optional(),
  orgType: OrgTypeEnum.default("church"),
  country: import_zod.z.string().trim().min(2).max(100).default("Ghana"),
  city: import_zod.z.string().trim().min(1).max(100).default("Accra"),
  campusCode: import_zod.z.string().trim().max(32).optional(),
  seniorPastor: import_zod.z.string().trim().max(160).optional(),
  contactName: import_zod.z.string().trim().max(160).optional(),
  contactEmail: import_zod.z.string().trim().email("Valid contact email required").or(import_zod.z.literal("")).optional(),
  contactPhone: import_zod.z.string().trim().max(40).optional(),
  customDomain: import_zod.z.string().trim().max(180).optional(),
  initialPlan: LicenseTierEnum.default("grace_starter"),
  autoIssueTrial: import_zod.z.boolean().default(true)
});
var UpdateOrgSchema = import_zod.z.object({
  name: import_zod.z.string().trim().min(2).max(200).optional(),
  orgType: OrgTypeEnum.optional(),
  country: import_zod.z.string().trim().min(2).max(100).optional(),
  city: import_zod.z.string().trim().min(1).max(100).optional(),
  campusCode: import_zod.z.string().trim().max(32).optional(),
  seniorPastor: import_zod.z.string().trim().max(160).optional(),
  contactName: import_zod.z.string().trim().max(160).optional(),
  contactEmail: import_zod.z.string().trim().email().or(import_zod.z.literal("")).optional(),
  contactPhone: import_zod.z.string().trim().max(40).optional(),
  status: OrgStatusEnum.optional(),
  customDomain: import_zod.z.string().trim().max(180).nullable().optional(),
  geofenceRadiusMeters: import_zod.z.number().int().min(10).max(5e3).optional(),
  smsConfigured: import_zod.z.boolean().optional(),
  pushConfigured: import_zod.z.boolean().optional(),
  reason: import_zod.z.string().trim().max(400).optional()
});
var RevokeOrgSchema = import_zod.z.object({
  reason: import_zod.z.string().trim().min(3, "A clear audit reason (min 3 characters) is required to revoke an organisation.").max(500)
});
var ProvisionOrgAdminSchema = import_zod.z.object({
  fullName: import_zod.z.string().trim().min(2, "Administrator full name is required").max(160),
  email: import_zod.z.string().trim().email("Valid email address required").max(160).optional().or(import_zod.z.literal("")),
  username: import_zod.z.string().trim().max(80).optional().or(import_zod.z.literal("")),
  phone: import_zod.z.string().trim().max(32).optional().or(import_zod.z.literal("")),
  password: import_zod.z.string().min(8, "Password must be at least 8 characters").max(256),
  role: import_zod.z.enum(["admin", "pastor"]).default("admin"),
  requirePasswordChange: import_zod.z.boolean().default(false)
}).refine(
  (data) => Boolean(data.email && data.email.trim() || data.phone && data.phone.trim()),
  { message: "Either an administrator email address or phone number is required.", path: ["email"] }
);
var LicenseOverridesSchema = import_zod.z.object({
  seatsLimit: import_zod.z.number().int().positive().max(25e4).optional(),
  sitesLimit: import_zod.z.number().int().positive().max(1e3).optional(),
  monthlyCheckinsLimit: import_zod.z.number().int().positive().max(5e6).optional(),
  features: import_zod.z.object({
    bleRadar: import_zod.z.boolean().optional(),
    smsGateway: import_zod.z.boolean().optional(),
    biometrics: import_zod.z.boolean().optional(),
    gdprPrivacyVault: import_zod.z.boolean().optional(),
    multiCampus: import_zod.z.boolean().optional(),
    mobileGivingMoMo: import_zod.z.boolean().optional(),
    customDomain: import_zod.z.boolean().optional(),
    exportAuditLogs: import_zod.z.boolean().optional()
  }).optional()
}).optional();
var IssueLicenseSchema = import_zod.z.object({
  organizationId: import_zod.z.string().min(1, "Valid organization ID required"),
  tier: LicenseTierEnum,
  billingCycle: BillingCycleEnum.default("annual"),
  status: import_zod.z.enum(["active", "trial", "grace_period"]).default("active"),
  durationDays: import_zod.z.number().int().min(1).max(36500).optional(),
  overrides: LicenseOverridesSchema,
  notes: import_zod.z.string().trim().max(500).optional()
});
var LicenseActionSchema = import_zod.z.object({
  action: import_zod.z.enum([
    "renew",
    "upgrade",
    "downgrade",
    "start_trial",
    "suspend",
    "reactivate",
    "revoke",
    "set_overrides"
  ]),
  durationMonths: import_zod.z.number().int().min(1).max(120).optional(),
  targetTier: LicenseTierEnum.optional(),
  expiresDate: import_zod.z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expiresDate must be YYYY-MM-DD").optional(),
  overrides: LicenseOverridesSchema,
  reason: import_zod.z.string().trim().max(500).optional(),
  notes: import_zod.z.string().trim().max(500).optional()
}).superRefine((val, ctx) => {
  if ((val.action === "suspend" || val.action === "revoke") && (!val.reason || val.reason.length < 3)) {
    ctx.addIssue({
      code: import_zod.z.ZodIssueCode.custom,
      path: ["reason"],
      message: "A clear audit reason (min 3 chars) is required when suspending or revoking a license."
    });
  }
  if ((val.action === "upgrade" || val.action === "downgrade") && !val.targetTier) {
    ctx.addIssue({
      code: import_zod.z.ZodIssueCode.custom,
      path: ["targetTier"],
      message: "targetTier is required when upgrading or downgrading a license."
    });
  }
});
var RecordPaymentSchema = import_zod.z.object({
  amount: import_zod.z.number().positive("Payment amount must be positive"),
  currency: import_zod.z.enum(["GHS", "USD"]),
  method: import_zod.z.enum(["momo", "bank", "cash"]),
  reference: import_zod.z.string().trim().min(2, "Payment reference is required").max(160),
  paidAt: import_zod.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: import_zod.z.string().trim().max(500).optional()
});
var UpdatePlanSchema = import_zod.z.object({
  name: import_zod.z.string().trim().min(2).max(100).optional(),
  description: import_zod.z.string().trim().max(400).optional(),
  monthlyCostUSD: import_zod.z.number().nonnegative().max(1e5).optional(),
  annualCostUSD: import_zod.z.number().nonnegative().max(1e6).optional(),
  seatsLimit: import_zod.z.number().int().positive().max(25e4).optional(),
  sitesLimit: import_zod.z.number().int().positive().max(1e3).optional(),
  monthlyCheckinsLimit: import_zod.z.number().int().positive().max(5e6).optional(),
  isActive: import_zod.z.boolean().optional(),
  featureFlags: import_zod.z.object({
    bleRadar: import_zod.z.boolean(),
    smsGateway: import_zod.z.boolean(),
    biometrics: import_zod.z.boolean(),
    gdprPrivacyVault: import_zod.z.boolean(),
    multiCampus: import_zod.z.boolean(),
    mobileGivingMoMo: import_zod.z.boolean(),
    customDomain: import_zod.z.boolean(),
    exportAuditLogs: import_zod.z.boolean()
  }).optional()
});
var UpdateAlertSchema = import_zod.z.object({
  status: import_zod.z.enum(["acknowledged", "resolved"])
});
var CreateAnnouncementSchema = import_zod.z.object({
  title: import_zod.z.string().trim().min(3).max(180),
  body: import_zod.z.string().trim().min(5).max(2e3),
  severity: import_zod.z.enum(["info", "warning", "critical"]).default("info"),
  targetTiers: import_zod.z.array(LicenseTierEnum).default([]),
  targetOrganizationIds: import_zod.z.array(import_zod.z.string().uuid()).default([]),
  expiresAt: import_zod.z.string().nullable().optional()
});
var ToggleAnnouncementSchema = import_zod.z.object({
  active: import_zod.z.boolean()
});
var UpsertFeatureFlagSchema = import_zod.z.object({
  name: import_zod.z.string().trim().min(2).max(140).optional(),
  description: import_zod.z.string().trim().max(500).optional(),
  enabledGlobally: import_zod.z.boolean().optional(),
  enabledTiers: import_zod.z.array(LicenseTierEnum).optional(),
  organizationOverrides: import_zod.z.record(import_zod.z.string(), import_zod.z.boolean()).optional()
});
var CreateDataRequestSchema = import_zod.z.object({
  organizationId: import_zod.z.string().min(1, "Valid organization ID required"),
  requestType: import_zod.z.enum(["export", "deletion"]),
  requestedByEmail: import_zod.z.string().trim().email(),
  reason: import_zod.z.string().trim().max(500).optional(),
  notes: import_zod.z.string().trim().max(500).optional()
});
var UpdateDataRequestSchema = import_zod.z.object({
  status: import_zod.z.enum(["pending", "in_progress", "completed", "rejected"]),
  notes: import_zod.z.string().trim().max(500).optional()
});
var CreateSupportGrantSchema = import_zod.z.object({
  organizationId: import_zod.z.string().min(1, "Valid organization ID required"),
  reason: import_zod.z.string().trim().min(6, "Explicit audit reason (min 6 characters) is required").max(500),
  durationMinutes: import_zod.z.number().int().min(5).max(120).default(30)
});
var LandingConfigUpdateSchema = import_zod.z.object({
  heroTitle: import_zod.z.string().trim().min(3).max(240).optional(),
  heroSubtitle: import_zod.z.string().trim().min(3).max(600).optional(),
  announcementBadge: import_zod.z.string().trim().max(240).optional(),
  isAnnouncementActive: import_zod.z.boolean().optional(),
  contactSalesEmail: import_zod.z.string().trim().email().optional(),
  demoEnabled: import_zod.z.boolean().optional(),
  showcaseHeadline: import_zod.z.string().trim().max(240).optional(),
  featuredStats: import_zod.z.object({
    congregationsServed: import_zod.z.string().trim().max(60).optional(),
    checkinsRecorded: import_zod.z.string().trim().max(60).optional(),
    proximityAccuracy: import_zod.z.string().trim().max(60).optional(),
    networkUptime: import_zod.z.string().trim().max(60).optional()
  }).optional()
});
async function handleCronRollup(req, res) {
  const token = extractBearerToken(req);
  const configuredCronSecret = process.env.CRON_SECRET?.trim();
  let actorEmail = "vercel-cron@system.ekklesphere";
  let actorId = null;
  let actorRole = "cron";
  let authorized = false;
  if (configuredCronSecret && configuredCronSecret.length >= 8 && token === configuredCronSecret) {
    authorized = true;
  } else if (token) {
    try {
      const verified = await resolveVerifiedUserFromToken(token);
      if (isCreatorClaim(verified)) {
        authorized = true;
        actorEmail = verified.email;
        actorId = verified.id;
        actorRole = verified.role;
      }
    } catch {
      authorized = false;
    }
  }
  if (!authorized) {
    return res.status(401).json({
      error: "unauthorized_cron",
      message: "Valid CRON_SECRET or verified Platform Creator Bearer token is required."
    });
  }
  const requestedDate = typeof req.body?.date === "string" && req.body.date || typeof req.query?.date === "string" && req.query.date || void 0;
  const result = await platformStore.runNightlyUsageRollup(requestedDate);
  await platformStore.appendAuditLog({
    actorId,
    actorEmail,
    actorRole,
    action: "usage.rollup_executed",
    targetType: "usage_daily",
    targetId: result.targetDate,
    metadata: result,
    ipAddress: clientIp(req)
  });
  return res.status(200).json({
    success: true,
    ...result
  });
}
consoleRouter.post("/cron/rollup", handleCronRollup);
consoleRouter.get("/cron/rollup", handleCronRollup);
consoleRouter.use(requireUser, requireCreator);
consoleRouter.get(["/dashboard", "/overview"], async (_req, res) => {
  const summary = await platformStore.getDashboardSummary();
  const organisations = await platformStore.listOrganisations();
  return res.status(200).json({
    ...summary,
    kpis: summary,
    organisations,
    organizations: organisations
  });
});
consoleRouter.get("/organisations", async (req, res) => {
  const list = await platformStore.listOrganisations({
    search: typeof req.query.search === "string" ? req.query.search : void 0,
    status: typeof req.query.status === "string" ? req.query.status : void 0,
    orgType: typeof req.query.orgType === "string" ? req.query.orgType : void 0,
    tier: typeof req.query.tier === "string" ? req.query.tier : void 0,
    country: typeof req.query.country === "string" ? req.query.country : void 0
  });
  return res.status(200).json({ organisations: list });
});
consoleRouter.post("/organisations", async (req, res) => {
  try {
    const parsed = CreateOrgSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "validation_error",
        details: parsed.error.flatten()
      });
    }
    const created = await platformStore.createOrganisation(parsed.data);
    await platformStore.appendAuditLog({
      actorId: req.user.id,
      actorEmail: req.user.email,
      actorRole: req.user.role,
      action: "organisation.provisioned",
      targetType: "organization",
      targetId: created.organisation.id,
      organizationId: created.organisation.id,
      metadata: {
        name: created.organisation.name,
        orgType: created.organisation.orgType,
        initialPlan: parsed.data.initialPlan,
        autoIssuedTrialKey: created.license?.key || null
      },
      ipAddress: clientIp(req)
    });
    return res.status(201).json(created);
  } catch (err) {
    console.error("[Console] Failed to create organisation:", err);
    return res.status(500).json({
      error: "create_organisation_failed",
      message: err?.message || "Could not provision new organisation"
    });
  }
});
consoleRouter.get("/organisations/:orgId", async (req, res) => {
  const detail = await platformStore.getOrganisationDetail(req.params.orgId);
  if (!detail) {
    return res.status(404).json({ error: "not_found", message: "Organisation not found." });
  }
  return res.status(200).json(detail);
});
consoleRouter.patch("/organisations/:orgId", async (req, res) => {
  const parsed = UpdateOrgSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "validation_error",
      details: parsed.error.flatten()
    });
  }
  try {
    const { reason, ...patch } = parsed.data;
    const updated = await platformStore.updateOrganisation(req.params.orgId, patch);
    await platformStore.appendAuditLog({
      actorId: req.user.id,
      actorEmail: req.user.email,
      actorRole: req.user.role,
      action: "organisation.updated",
      targetType: "organization",
      targetId: updated.id,
      organizationId: updated.id,
      reason: reason || null,
      metadata: patch,
      ipAddress: clientIp(req)
    });
    return res.status(200).json({ organisation: updated });
  } catch (err) {
    return res.status(404).json({ error: "not_found", message: err?.message || "Organisation not found" });
  }
});
consoleRouter.post("/organisations/:orgId/revoke", async (req, res) => {
  const parsed = RevokeOrgSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({
      error: "validation_error",
      message: parsed.error.issues[0]?.message || "A valid audit reason is required to revoke an organisation.",
      details: parsed.error.flatten()
    });
  }
  try {
    const result = await platformStore.revokeOrganisation(req.params.orgId, parsed.data.reason);
    await platformStore.appendAuditLog({
      actorId: req.user.id,
      actorEmail: req.user.email,
      actorRole: req.user.role,
      action: "organisation.revoked",
      targetType: "organization",
      targetId: result.organisation.id,
      organizationId: result.organisation.id,
      reason: parsed.data.reason,
      metadata: {
        name: result.organisation.name,
        revokedGrantsCount: result.revokedGrantsCount,
        suspendedCredentialsCount: result.suspendedCredentialsCount,
        licenseStatus: result.license?.status || null
      },
      ipAddress: clientIp(req)
    });
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    const status = typeof err?.status === "number" ? err.status : 400;
    return res.status(status).json({
      error: status === 404 ? "not_found" : "revoke_organisation_failed",
      message: err?.message || "Could not revoke organisation."
    });
  }
});
consoleRouter.delete("/organisations/:orgId", async (req, res) => {
  try {
    const rawReason = typeof req.body?.reason === "string" ? req.body.reason.trim() : typeof req.query?.reason === "string" ? req.query.reason.trim() : "";
    const result = await platformStore.deleteOrganisation(req.params.orgId);
    await platformStore.appendAuditLog({
      actorId: req.user.id,
      actorEmail: req.user.email,
      actorRole: req.user.role,
      action: "organisation.deleted",
      targetType: "organization",
      targetId: result.organizationId,
      organizationId: null,
      reason: rawReason || "Permanent deletion requested via Creator Console",
      metadata: {
        deletedAuthUsersCount: result.deletedAuthUsersCount,
        purgedFromServer: true
      },
      ipAddress: clientIp(req)
    });
    return res.status(200).json({
      success: true,
      ...result
    });
  } catch (err) {
    const status = typeof err?.status === "number" ? err.status : 400;
    return res.status(status).json({
      error: status === 404 ? "not_found" : "delete_organisation_failed",
      message: err?.message || "Could not delete organisation."
    });
  }
});
consoleRouter.get("/organisations/:orgId/admin-credentials", async (req, res) => {
  const org = await platformStore.getOrganisationById(req.params.orgId);
  if (!org) {
    return res.status(404).json({ error: "not_found", message: "Organisation not found." });
  }
  const credentials = await platformStore.listOrganisationAdminCredentials(org.id);
  return res.status(200).json({
    organizationId: org.id,
    credentials
  });
});
consoleRouter.post("/organisations/:orgId/admin-credentials", async (req, res) => {
  const parsed = ProvisionOrgAdminSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({
      error: "validation_error",
      message: parsed.error.issues[0]?.message || "Invalid administrator credential fields.",
      details: parsed.error.flatten()
    });
  }
  try {
    const result = await platformStore.provisionOrganisationAdminCredentials({
      organizationId: req.params.orgId,
      fullName: parsed.data.fullName,
      email: parsed.data.email || void 0,
      username: parsed.data.username || void 0,
      phone: parsed.data.phone || void 0,
      password: parsed.data.password,
      role: parsed.data.role,
      requirePasswordChange: parsed.data.requirePasswordChange,
      ipAddress: clientIp(req)
    });
    await platformStore.appendAuditLog({
      actorId: req.user.id,
      actorEmail: req.user.email,
      actorRole: req.user.role,
      action: result.resetExisting ? "organisation.admin_credentials_reset" : "organisation.admin_credentials_provisioned",
      targetType: "account_credentials",
      targetId: result.credential.id,
      organizationId: result.credential.organizationId,
      metadata: {
        email: result.credential.email || null,
        username: result.credential.username || null,
        hasPhone: Boolean(result.credential.phoneE164),
        role: result.credential.role,
        requirePasswordChange: result.credential.mustChangePassword,
        persistedInSupabase: result.persistedInSupabase
      },
      ipAddress: clientIp(req)
    });
    return res.status(200).json({
      success: true,
      ...result
    });
  } catch (err) {
    const status = typeof err?.status === "number" ? err.status : 400;
    return res.status(status).json({
      error: "org_admin_provision_failed",
      code: err?.code || "PROVISION_FAILED",
      message: err?.message || "Could not provision organisation administrator credentials."
    });
  }
});
consoleRouter.get("/licenses", async (_req, res) => {
  const licenses = await platformStore.listLicenses();
  return res.status(200).json({ licenses });
});
consoleRouter.post("/licenses/issue", async (req, res) => {
  const parsed = IssueLicenseSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "validation_error",
      details: parsed.error.flatten()
    });
  }
  try {
    const license = await platformStore.issueLicense(parsed.data);
    await platformStore.appendAuditLog({
      actorId: req.user.id,
      actorEmail: req.user.email,
      actorRole: req.user.role,
      action: "license.issued",
      targetType: "license",
      targetId: license.id,
      organizationId: license.organizationId || license.tenantId,
      reason: parsed.data.notes || null,
      metadata: {
        key: license.key,
        tier: license.tier,
        status: license.status,
        billingCycle: license.billingCycle,
        expiresDate: license.expiresDate
      },
      ipAddress: clientIp(req)
    });
    return res.status(201).json({ license });
  } catch (err) {
    return res.status(400).json({ error: "issue_failed", message: err?.message || "Could not issue license" });
  }
});
consoleRouter.post("/licenses/:licenseId/action", async (req, res) => {
  const parsed = LicenseActionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "validation_error",
      details: parsed.error.flatten()
    });
  }
  try {
    const updated = await platformStore.performLicenseAction(req.params.licenseId, parsed.data);
    await platformStore.appendAuditLog({
      actorId: req.user.id,
      actorEmail: req.user.email,
      actorRole: req.user.role,
      action: `license.${parsed.data.action}`,
      targetType: "license",
      targetId: updated.id,
      organizationId: updated.organizationId || updated.tenantId,
      reason: parsed.data.reason || null,
      metadata: {
        action: parsed.data.action,
        tier: updated.tier,
        status: updated.status,
        expiresDate: updated.expiresDate,
        overrides: updated.overrides
      },
      ipAddress: clientIp(req)
    });
    return res.status(200).json({ license: updated });
  } catch (err) {
    return res.status(404).json({ error: "license_action_failed", message: err?.message || "License not found" });
  }
});
consoleRouter.get("/payments", async (req, res) => {
  const organizationId = typeof req.query.organizationId === "string" ? req.query.organizationId : void 0;
  const payments = await platformStore.listPayments(organizationId);
  return res.status(200).json({ payments });
});
consoleRouter.post("/licenses/:licenseId/payments", async (req, res) => {
  const parsed = RecordPaymentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "validation_error",
      details: parsed.error.flatten()
    });
  }
  try {
    const payment = await platformStore.recordLicensePayment({
      licenseId: req.params.licenseId,
      ...parsed.data,
      recordedById: req.user.id,
      recordedByEmail: req.user.email
    });
    await platformStore.appendAuditLog({
      actorId: req.user.id,
      actorEmail: req.user.email,
      actorRole: req.user.role,
      action: "license.payment_recorded",
      targetType: "license_payment",
      targetId: payment.id,
      organizationId: payment.organizationId,
      metadata: {
        licenseId: payment.licenseId,
        amount: payment.amount,
        currency: payment.currency,
        method: payment.method,
        reference: payment.reference,
        paidAt: payment.paidAt
      },
      ipAddress: clientIp(req)
    });
    return res.status(201).json({ payment });
  } catch (err) {
    return res.status(400).json({ error: "payment_failed", message: err?.message || "Could not record payment" });
  }
});
consoleRouter.get("/plans", async (_req, res) => {
  const plans = await platformStore.listPlans();
  return res.status(200).json({ plans });
});
consoleRouter.patch("/plans/:planId", async (req, res) => {
  const tierParse = LicenseTierEnum.safeParse(req.params.planId);
  if (!tierParse.success) {
    return res.status(400).json({ error: "invalid_plan_id", message: "Unknown license tier ID" });
  }
  const parsed = UpdatePlanSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "validation_error", details: parsed.error.flatten() });
  }
  const updated = await platformStore.updatePlan(tierParse.data, parsed.data);
  await platformStore.appendAuditLog({
    actorId: req.user.id,
    actorEmail: req.user.email,
    actorRole: req.user.role,
    action: "plan.updated",
    targetType: "plan",
    targetId: updated.id,
    metadata: parsed.data,
    ipAddress: clientIp(req)
  });
  return res.status(200).json({ plan: updated });
});
consoleRouter.get("/usage", async (req, res) => {
  const organizationId = typeof req.query.organizationId === "string" ? req.query.organizationId : void 0;
  const days = Math.min(90, Math.max(1, Number(req.query.days) || 30));
  const usage = await platformStore.listUsageDaily(organizationId, days);
  return res.status(200).json({ usage });
});
consoleRouter.get("/alerts", async (req, res) => {
  const alerts = await platformStore.listAlerts({
    status: typeof req.query.status === "string" ? req.query.status : void 0,
    severity: typeof req.query.severity === "string" ? req.query.severity : void 0
  });
  return res.status(200).json({ alerts });
});
consoleRouter.patch("/alerts/:alertId", async (req, res) => {
  const parsed = UpdateAlertSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "validation_error", details: parsed.error.flatten() });
  }
  try {
    const alert = await platformStore.updateAlertStatus(req.params.alertId, parsed.data.status);
    await platformStore.appendAuditLog({
      actorId: req.user.id,
      actorEmail: req.user.email,
      actorRole: req.user.role,
      action: `alert.${parsed.data.status}`,
      targetType: "alert",
      targetId: alert.id,
      organizationId: alert.organizationId,
      metadata: { alertType: alert.alertType, status: alert.status },
      ipAddress: clientIp(req)
    });
    return res.status(200).json({ alert });
  } catch (err) {
    return res.status(404).json({ error: "not_found", message: err?.message || "Alert not found" });
  }
});
consoleRouter.get("/announcements", async (_req, res) => {
  const announcements = await platformStore.listAnnouncements();
  return res.status(200).json({ announcements });
});
consoleRouter.post("/announcements", async (req, res) => {
  const parsed = CreateAnnouncementSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "validation_error", details: parsed.error.flatten() });
  }
  const announcement = await platformStore.createAnnouncement({
    ...parsed.data,
    createdByEmail: req.user.email
  });
  await platformStore.appendAuditLog({
    actorId: req.user.id,
    actorEmail: req.user.email,
    actorRole: req.user.role,
    action: "announcement.created",
    targetType: "announcement",
    targetId: announcement.id,
    metadata: { title: announcement.title, severity: announcement.severity },
    ipAddress: clientIp(req)
  });
  return res.status(201).json({ announcement });
});
consoleRouter.patch("/announcements/:id", async (req, res) => {
  const parsed = ToggleAnnouncementSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "validation_error", details: parsed.error.flatten() });
  }
  try {
    const announcement = await platformStore.toggleAnnouncement(req.params.id, parsed.data.active);
    await platformStore.appendAuditLog({
      actorId: req.user.id,
      actorEmail: req.user.email,
      actorRole: req.user.role,
      action: "announcement.toggled",
      targetType: "announcement",
      targetId: announcement.id,
      metadata: { active: announcement.active },
      ipAddress: clientIp(req)
    });
    return res.status(200).json({ announcement });
  } catch (err) {
    return res.status(404).json({ error: "not_found", message: err?.message || "Announcement not found" });
  }
});
consoleRouter.get("/feature-flags", async (_req, res) => {
  const featureFlags = await platformStore.listFeatureFlags();
  return res.status(200).json({ featureFlags });
});
var handleUpsertFeatureFlag = async (req, res) => {
  const key = req.params.key.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_");
  const parsed = UpsertFeatureFlagSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "validation_error", details: parsed.error.flatten() });
  }
  const existingFlags = await platformStore.listFeatureFlags();
  const existing = existingFlags.find((f) => f.key === key);
  const mergedData = {
    name: parsed.data.name ?? existing?.name ?? key,
    description: parsed.data.description ?? existing?.description ?? "",
    enabledGlobally: parsed.data.enabledGlobally ?? existing?.enabledGlobally ?? false,
    enabledTiers: parsed.data.enabledTiers ?? existing?.enabledTiers ?? [],
    organizationOverrides: parsed.data.organizationOverrides ?? existing?.organizationOverrides
  };
  const flag = await platformStore.upsertFeatureFlag(key, mergedData);
  await platformStore.appendAuditLog({
    actorId: req.user.id,
    actorEmail: req.user.email,
    actorRole: req.user.role,
    action: "feature_flag.updated",
    targetType: "feature_flag",
    targetId: flag.key,
    metadata: mergedData,
    ipAddress: clientIp(req)
  });
  return res.status(200).json({ featureFlag: flag });
};
consoleRouter.put("/feature-flags/:key", handleUpsertFeatureFlag);
consoleRouter.patch("/feature-flags/:key", handleUpsertFeatureFlag);
consoleRouter.get("/data-requests", async (_req, res) => {
  const dataRequests = await platformStore.listDataRequests();
  return res.status(200).json({ dataRequests });
});
consoleRouter.post("/data-requests", async (req, res) => {
  const parsed = CreateDataRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "validation_error", details: parsed.error.flatten() });
  }
  try {
    const dataRequest = await platformStore.createDataRequest(parsed.data);
    await platformStore.appendAuditLog({
      actorId: req.user.id,
      actorEmail: req.user.email,
      actorRole: req.user.role,
      action: "data_request.created",
      targetType: "data_request",
      targetId: dataRequest.id,
      organizationId: dataRequest.organizationId,
      reason: parsed.data.reason || null,
      metadata: {
        requestType: dataRequest.requestType,
        requestedByEmail: dataRequest.requestedByEmail
      },
      ipAddress: clientIp(req)
    });
    return res.status(201).json({ dataRequest });
  } catch (err) {
    return res.status(400).json({ error: "request_failed", message: err?.message || "Failed to log data request" });
  }
});
consoleRouter.patch("/data-requests/:id", async (req, res) => {
  const parsed = UpdateDataRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "validation_error", details: parsed.error.flatten() });
  }
  try {
    const dataRequest = await platformStore.updateDataRequestStatus(
      req.params.id,
      parsed.data.status,
      parsed.data.notes
    );
    await platformStore.appendAuditLog({
      actorId: req.user.id,
      actorEmail: req.user.email,
      actorRole: req.user.role,
      action: "data_request.updated",
      targetType: "data_request",
      targetId: dataRequest.id,
      organizationId: dataRequest.organizationId,
      metadata: parsed.data,
      ipAddress: clientIp(req)
    });
    return res.status(200).json({ dataRequest });
  } catch (err) {
    return res.status(404).json({ error: "not_found", message: err?.message || "Data request not found" });
  }
});
consoleRouter.get("/support-grants", async (_req, res) => {
  const supportGrants = await platformStore.listSupportGrants();
  return res.status(200).json({ supportGrants });
});
consoleRouter.post("/support-grants", async (req, res) => {
  const parsed = CreateSupportGrantSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "validation_error", details: parsed.error.flatten() });
  }
  try {
    const grant = await platformStore.createSupportGrant({
      organizationId: parsed.data.organizationId,
      creatorUserId: req.user.id,
      creatorEmail: req.user.email,
      reason: parsed.data.reason,
      durationMinutes: parsed.data.durationMinutes
    });
    await platformStore.appendAuditLog({
      actorId: req.user.id,
      actorEmail: req.user.email,
      actorRole: req.user.role,
      action: "support_grant.issued",
      targetType: "support_grant",
      targetId: grant.id,
      organizationId: grant.organizationId,
      reason: grant.reason,
      metadata: {
        accessLevel: grant.accessLevel,
        expiresAt: grant.expiresAt,
        durationMinutes: parsed.data.durationMinutes
      },
      ipAddress: clientIp(req)
    });
    return res.status(201).json({ supportGrant: grant });
  } catch (err) {
    return res.status(400).json({ error: "grant_failed", message: err?.message || "Could not issue support grant" });
  }
});
consoleRouter.post("/support-grants/:grantId/revoke", async (req, res) => {
  try {
    const grant = await platformStore.revokeSupportGrant(req.params.grantId);
    await platformStore.appendAuditLog({
      actorId: req.user.id,
      actorEmail: req.user.email,
      actorRole: req.user.role,
      action: "support_grant.revoked",
      targetType: "support_grant",
      targetId: grant.id,
      organizationId: grant.organizationId,
      reason: grant.reason,
      ipAddress: clientIp(req)
    });
    return res.status(200).json({ supportGrant: grant });
  } catch (err) {
    return res.status(404).json({ error: "not_found", message: err?.message || "Support grant not found" });
  }
});
consoleRouter.get("/audit-log", async (req, res) => {
  const logs = await platformStore.listAuditLogs({
    organizationId: typeof req.query.organizationId === "string" ? req.query.organizationId : void 0,
    action: typeof req.query.action === "string" ? req.query.action : void 0,
    actorEmail: typeof req.query.actorEmail === "string" ? req.query.actorEmail : void 0,
    limit: req.query.limit ? Number(req.query.limit) : 150
  });
  return res.status(200).json({ auditLogs: logs });
});
consoleRouter.all("/audit-log/:id", (_req, res) => {
  return res.status(405).json({
    error: "audit_log_immutable",
    message: "audit_log is strictly append-only; UPDATE and DELETE operations are prohibited."
  });
});
consoleRouter.get("/export/:dataset", async (req, res) => {
  const dataset = req.params.dataset.replace(/\.csv$/i, "").toLowerCase();
  let rows = [];
  switch (dataset) {
    case "organisations":
    case "organizations": {
      const orgs = await platformStore.listOrganisations();
      rows = orgs.map((o) => ({
        id: o.id,
        name: o.name,
        slug: o.slug,
        type: o.orgType || "church",
        status: o.status,
        city: o.city,
        country: o.country,
        contact_email: o.contactEmail,
        license_tier: o.licenseTier,
        license_status: o.licenseStatus || "active",
        seats_used: o.memberCount,
        seats_limit: o.maxCapacity,
        sites_used: o.sitesCount ?? 0,
        sites_limit: o.sitesLimit ?? 1,
        renewal_date: o.renewalDate,
        created_at: o.createdAt
      }));
      break;
    }
    case "licenses": {
      const licenses = await platformStore.listLicenses();
      rows = licenses.map((l) => ({
        id: l.id,
        organization_id: l.organizationId || l.tenantId,
        organization_name: l.tenantName,
        license_key: l.key,
        tier: l.tier,
        status: l.status,
        billing_cycle: l.billingCycle,
        annual_cost_usd: l.annualCostUSD,
        seats_limit: l.seatsLimit,
        sites_limit: l.sitesLimit ?? 1,
        issued_date: l.issuedDate,
        expires_date: l.expiresDate,
        grace_ends_date: l.graceEndsDate || ""
      }));
      break;
    }
    case "payments": {
      const payments = await platformStore.listPayments();
      rows = payments.map((p) => ({
        id: p.id,
        organization_id: p.organizationId,
        organization_name: p.organizationName || "",
        license_id: p.licenseId,
        amount: p.amount,
        currency: p.currency,
        method: p.method,
        reference: p.reference,
        paid_at: p.paidAt,
        recorded_by: p.recordedByEmail
      }));
      break;
    }
    case "usage": {
      const usage = await platformStore.listUsageDaily(void 0, 30);
      rows = usage.map((u) => ({
        usage_date: u.usageDate,
        organization_id: u.organizationId,
        organization_name: u.organizationName || "",
        active_users: u.activeUsers,
        checkins_count: u.checkinsCount,
        flagged_count: u.flaggedCount,
        rejected_count: u.rejectedCount,
        mock_location_attempts: u.mockLocationAttempts,
        sites_count: u.sitesCount,
        push_subscribers: u.pushSubscribers
      }));
      break;
    }
    case "audit-log":
    case "audit": {
      const logs = await platformStore.listAuditLogs({ limit: 500 });
      rows = logs.map((a) => ({
        created_at: a.createdAt,
        actor_email: a.actorEmail,
        actor_role: a.actorRole,
        action: a.action,
        target_type: a.targetType,
        target_id: a.targetId || "",
        organization_id: a.organizationId || "",
        reason: a.reason || ""
      }));
      break;
    }
    case "data-requests": {
      const reqs = await platformStore.listDataRequests();
      rows = reqs.map((r) => ({
        id: r.id,
        organization_id: r.organizationId,
        organization_name: r.organizationName || "",
        request_type: r.requestType,
        status: r.status,
        requested_by_email: r.requestedByEmail,
        due_at: r.dueAt,
        completed_at: r.completedAt || ""
      }));
      break;
    }
    default:
      return res.status(400).json({
        error: "invalid_dataset",
        message: "Supported datasets: organisations, licenses, payments, usage, audit-log, data-requests"
      });
  }
  const csv = import_papaparse.default.unparse(rows);
  await platformStore.appendAuditLog({
    actorId: req.user.id,
    actorEmail: req.user.email,
    actorRole: req.user.role,
    action: "console.csv_exported",
    targetType: dataset,
    metadata: { rowCount: rows.length },
    ipAddress: clientIp(req)
  });
  const stamp = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="ekklesphere-${dataset}-${stamp}.csv"`);
  return res.status(200).send(csv);
});
consoleRouter.get(["/landing-config", "/landing-cms"], async (_req, res) => {
  const config = await platformStore.getLandingConfig();
  return res.status(200).json({ landingConfig: config });
});
consoleRouter.put(["/landing-config", "/landing-cms"], async (req, res) => {
  const parsed = LandingConfigUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "validation_error", details: parsed.error.flatten() });
  }
  const updated = await platformStore.updateLandingConfig(parsed.data, req.user.email);
  await platformStore.appendAuditLog({
    actorId: req.user.id,
    actorEmail: req.user.email,
    actorRole: req.user.role,
    action: "landing_cms.updated",
    targetType: "landing_cms_config",
    targetId: "default",
    metadata: { updatedKeys: Object.keys(parsed.data) },
    ipAddress: clientIp(req)
  });
  return res.status(200).json({ landingConfig: updated });
});
var UpdateLandingLeadSchema = import_zod.z.object({
  status: import_zod.z.enum(["new", "contacted", "qualified", "converted", "archived"]).optional(),
  creatorNotes: import_zod.z.string().trim().max(2e3).nullable().optional()
});
var ReplyLandingLeadSchema = import_zod.z.object({
  subject: import_zod.z.string().trim().min(2).max(160),
  message: import_zod.z.string().trim().min(2).max(4e3)
});
consoleRouter.get("/landing-leads", async (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : void 0;
  const leadType = typeof req.query.leadType === "string" ? req.query.leadType : void 0;
  const leads = await platformStore.listLandingLeads({ status, leadType });
  return res.status(200).json({ leads });
});
consoleRouter.patch("/landing-leads/:id", async (req, res) => {
  const parsed = UpdateLandingLeadSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ error: "validation_error", details: parsed.error.flatten() });
  }
  try {
    const lead = await platformStore.updateLandingLead(req.params.id, {
      status: parsed.data.status,
      creatorNotes: parsed.data.creatorNotes
    });
    await platformStore.appendAuditLog({
      actorId: req.user.id,
      actorEmail: req.user.email,
      actorRole: req.user.role,
      action: "landing_lead.updated",
      targetType: "landing_lead",
      targetId: lead.id,
      metadata: parsed.data,
      ipAddress: clientIp(req)
    });
    return res.status(200).json({ lead });
  } catch (err) {
    return res.status(err?.status || 404).json({
      error: err?.code || "not_found",
      message: err?.message || "Landing lead not found."
    });
  }
});
consoleRouter.post("/landing-leads/:id/convert", async (req, res) => {
  try {
    const result = await platformStore.convertLandingLeadToOrganization(
      req.params.id,
      req.user.email
    );
    await platformStore.appendAuditLog({
      actorId: req.user.id,
      actorEmail: req.user.email,
      actorRole: req.user.role,
      action: "landing_lead.converted_to_trial",
      targetType: "organization",
      targetId: result.organisation.id,
      organizationId: result.organisation.id,
      metadata: {
        leadId: result.lead.id,
        churchName: result.organisation.name,
        licenseKey: result.license.key
      },
      ipAddress: clientIp(req)
    });
    return res.status(201).json(result);
  } catch (err) {
    return res.status(err?.status || 400).json({
      error: err?.code || "convert_failed",
      message: err?.message || "Unable to convert lead to organisation trial."
    });
  }
});
consoleRouter.post("/landing-leads/:id/reply", async (req, res) => {
  const parsed = ReplyLandingLeadSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ error: "validation_error", details: parsed.error.flatten() });
  }
  try {
    const leads = await platformStore.listLandingLeads();
    const lead = leads.find((l) => l.id === req.params.id);
    if (!lead) {
      return res.status(404).json({ error: "not_found", message: "Landing lead not found." });
    }
    const emailResult = await sendResendEmail({
      to: [lead.email],
      subject: parsed.data.subject,
      text: parsed.data.message,
      html: buildHtmlFromPlainText(parsed.data.subject, parsed.data.message, "Ekklesphere Platform"),
      replyTo: req.user.email
    });
    const updated = await platformStore.updateLandingLead(lead.id, {
      status: lead.status === "converted" ? "converted" : "contacted",
      creatorNotes: lead.creatorNotes || `Replied by ${req.user.email}: "${parsed.data.subject}"`
    });
    await platformStore.appendAuditLog({
      actorId: req.user.id,
      actorEmail: req.user.email,
      actorRole: req.user.role,
      action: "landing_lead.replied",
      targetType: "landing_lead",
      targetId: lead.id,
      metadata: {
        subject: parsed.data.subject,
        emailSent: emailResult.ok
      },
      ipAddress: clientIp(req)
    });
    return res.status(200).json({ lead: updated, emailResult });
  } catch (err) {
    return res.status(err?.status || 500).json({
      error: err?.code || "reply_failed",
      message: err?.message || "Failed to reply to landing lead."
    });
  }
});
consoleRouter.post("/migrations/tenants", async (req, res) => {
  const dryRun = req.body?.dryRun !== false;
  const report = await platformStore.migrateTenantsToOrganizations(dryRun);
  if (!dryRun) {
    await platformStore.appendAuditLog({
      actorId: req.user.id,
      actorEmail: req.user.email,
      actorRole: req.user.role,
      action: "migration.tenants_applied",
      targetType: "migration",
      targetId: "migrate_tenants_to_organizations",
      metadata: report,
      ipAddress: clientIp(req)
    });
  }
  return res.status(200).json({ success: true, report });
});
var CreatorCredentialsUpdateSchema = import_zod.z.object({
  email: import_zod.z.string().trim().email("Valid email address is required.").max(160),
  username: import_zod.z.string().trim().max(80).optional().or(import_zod.z.literal("")),
  phone: import_zod.z.string().trim().max(32).optional().or(import_zod.z.literal("")),
  name: import_zod.z.string().trim().min(2, "Full name is required.").max(160),
  password: import_zod.z.string().min(8, "New password must be at least 8 characters.").max(256).optional().or(import_zod.z.literal("")),
  organizationId: import_zod.z.string().trim().uuid().optional().or(import_zod.z.literal(""))
});
consoleRouter.get("/profile/credentials", async (req, res) => {
  const summary = await platformStore.getCreatorProfileSummary(req.user.id, req.user.email);
  return res.status(200).json({
    credentials: summary
  });
});
consoleRouter.patch("/profile/credentials", async (req, res) => {
  const parsed = CreatorCredentialsUpdateSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({
      error: "validation_error",
      message: parsed.error.issues[0]?.message || "Invalid creator credential fields.",
      details: parsed.error.flatten()
    });
  }
  try {
    const result = await platformStore.upsertCreatorCredentials({
      id: req.user.id,
      email: parsed.data.email,
      username: parsed.data.username ?? void 0,
      phone: parsed.data.phone ?? void 0,
      name: parsed.data.name,
      password: parsed.data.password || void 0,
      organizationId: parsed.data.organizationId || void 0
    });
    await platformStore.appendAuditLog({
      actorId: req.user.id,
      actorEmail: result.user.email,
      actorRole: req.user.role,
      action: "creator.credentials_updated",
      targetType: "account_credentials",
      targetId: result.user.id,
      metadata: {
        email: result.user.email,
        username: result.user.username || null,
        hasPhone: Boolean(result.user.phoneE164),
        passwordRotated: Boolean(parsed.data.password && parsed.data.password.trim().length > 0),
        persistedInSupabase: result.persistedInSupabase
      },
      ipAddress: clientIp(req)
    });
    return res.status(200).json({
      success: true,
      token: result.token,
      persistedInSupabase: result.persistedInSupabase,
      user: {
        ...result.user,
        organization_id: result.user.organizationId,
        tenant_id: result.user.organizationId,
        is_creator: true
      }
    });
  } catch (err) {
    const status = typeof err?.status === "number" ? err.status : 400;
    return res.status(status).json({
      error: "credentials_update_failed",
      code: err?.code || "CREDENTIALS_UPDATE_FAILED",
      message: err?.message || "Could not update Creator credentials."
    });
  }
});

// src/server/mediaProxy.ts
var import_crypto5 = require("crypto");
var import_promises = __toESM(require("dns/promises"), 1);
var import_net = __toESM(require("net"), 1);

// src/utils/imageUrl.ts
function extractGoogleDriveFileId(urlStr) {
  try {
    const parsed = new URL(urlStr);
    const host = parsed.hostname.toLowerCase();
    if (!host.includes("drive.google.com") && !host.includes("docs.google.com") && !host.includes("lh3.googleusercontent.com")) {
      return null;
    }
    const filePathMatch = parsed.pathname.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (filePathMatch?.[1]) return filePathMatch[1];
    const ucPathMatch = parsed.pathname.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (ucPathMatch?.[1]) return ucPathMatch[1];
    const idParam = parsed.searchParams.get("id");
    if (idParam && /^[a-zA-Z0-9_-]+$/.test(idParam)) {
      return idParam;
    }
    return null;
  } catch {
    return null;
  }
}

// src/server/mediaProxy.ts
var MAX_IMAGE_BYTES = 5 * 1024 * 1024;
var FETCH_TIMEOUT_MS = 8e3;
var MAX_REDIRECTS = 4;
var CACHE_TTL_MS = 60 * 60 * 1e3;
var MAX_CACHE_ENTRIES = 160;
var MAX_CACHE_TOTAL_BYTES = 32 * 1024 * 1024;
var imageCache = /* @__PURE__ */ new Map();
var imageCacheBytes = 0;
var inFlightRequests = /* @__PURE__ */ new Map();
var sharpLoaderPromise = null;
async function getSharp() {
  if (!sharpLoaderPromise) {
    sharpLoaderPromise = import("sharp").then((mod) => mod.default || mod).catch(() => null);
  }
  return sharpLoaderPromise;
}
function getCachedEntry(key) {
  const existing = imageCache.get(key);
  if (!existing) return null;
  if (Date.now() - existing.cachedAt > CACHE_TTL_MS) {
    imageCache.delete(key);
    imageCacheBytes = Math.max(0, imageCacheBytes - existing.buffer.byteLength);
    return null;
  }
  imageCache.delete(key);
  imageCache.set(key, existing);
  return existing;
}
function setCachedEntry(key, entry) {
  if (entry.buffer.byteLength > MAX_CACHE_TOTAL_BYTES / 2) {
    return;
  }
  const existing = imageCache.get(key);
  if (existing) {
    imageCache.delete(key);
    imageCacheBytes = Math.max(0, imageCacheBytes - existing.buffer.byteLength);
  }
  while (imageCache.size >= MAX_CACHE_ENTRIES || imageCacheBytes + entry.buffer.byteLength > MAX_CACHE_TOTAL_BYTES) {
    const oldestKey = imageCache.keys().next().value;
    if (!oldestKey) break;
    const oldest = imageCache.get(oldestKey);
    imageCache.delete(oldestKey);
    if (oldest) {
      imageCacheBytes = Math.max(0, imageCacheBytes - oldest.buffer.byteLength);
    }
  }
  imageCache.set(key, entry);
  imageCacheBytes += entry.buffer.byteLength;
}
var MediaProxyError = class extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
};
function isPrivateOrReservedIpv4(ip) {
  const parts = ip.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b, c] = parts;
  if (a === 0) return true;
  if (a === 10) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 0 && c === 0) return true;
  if (a === 192 && b === 0 && c === 2) return true;
  if (a === 192 && b === 168) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a === 198 && b === 51 && c === 100) return true;
  if (a === 203 && b === 0 && c === 113) return true;
  if (a >= 224) return true;
  return false;
}
function isPrivateOrReservedIp(rawIp) {
  const trimmed = rawIp.trim().replace(/^\[|\]$/g, "").split("%")[0].toLowerCase();
  const ipVersion = import_net.default.isIP(trimmed);
  if (ipVersion === 4) {
    return isPrivateOrReservedIpv4(trimmed);
  }
  if (ipVersion !== 6) {
    return true;
  }
  if (trimmed === "::" || trimmed === "::1") {
    return true;
  }
  if (trimmed.startsWith("::ffff:")) {
    const rest = trimmed.slice("::ffff:".length);
    if (import_net.default.isIPv4(rest)) {
      return isPrivateOrReservedIpv4(rest);
    }
    const hexParts = rest.split(":");
    if (hexParts.length === 2) {
      const hi = parseInt(hexParts[0], 16);
      const lo = parseInt(hexParts[1], 16);
      if (!Number.isNaN(hi) && !Number.isNaN(lo)) {
        const ipv4 = `${hi >> 8 & 255}.${hi & 255}.${lo >> 8 & 255}.${lo & 255}`;
        return isPrivateOrReservedIpv4(ipv4);
      }
    }
    return true;
  }
  const firstHextet = parseInt(trimmed.split(":")[0] || "0", 16);
  if (Number.isNaN(firstHextet)) return true;
  if ((firstHextet & 65024) === 64512) return true;
  if ((firstHextet & 65472) === 65152) return true;
  if ((firstHextet & 65280) === 65280) return true;
  return false;
}
function isBlockedHostname(hostname) {
  const lower = hostname.trim().replace(/\.$/, "").toLowerCase();
  if (!lower) return true;
  if (lower === "localhost" || lower.endsWith(".localhost") || lower.endsWith(".local") || lower.endsWith(".internal") || lower.endsWith(".arpa") || lower === "metadata" || lower === "metadata.google.internal") {
    return true;
  }
  if (!import_net.default.isIP(lower) && !lower.includes(".")) {
    return true;
  }
  return false;
}
async function assertSafeExternalUrl(rawUrl) {
  if (typeof rawUrl !== "string" || !rawUrl.trim()) {
    throw new MediaProxyError(400, "invalid_image_url", "Image url query parameter is required.");
  }
  if (rawUrl.length > 2048) {
    throw new MediaProxyError(400, "invalid_image_url", "Image URL is too long.");
  }
  let parsed;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new MediaProxyError(400, "invalid_image_url", "Provided image URL is malformed.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new MediaProxyError(
      400,
      "invalid_image_protocol",
      "Only http:// and https:// image URLs are supported."
    );
  }
  if (parsed.username || parsed.password) {
    throw new MediaProxyError(403, "ssrf_blocked", "Embedded credentials in URLs are not allowed.");
  }
  const hostWithoutBrackets = parsed.hostname.replace(/^\[|\]$/g, "");
  if (isBlockedHostname(hostWithoutBrackets)) {
    throw new MediaProxyError(403, "ssrf_blocked", "Private or internal hostnames are blocked.");
  }
  if (import_net.default.isIP(hostWithoutBrackets)) {
    if (isPrivateOrReservedIp(hostWithoutBrackets)) {
      throw new MediaProxyError(403, "ssrf_blocked", "Private or loopback IP addresses are blocked.");
    }
    return parsed;
  }
  let resolvedAddresses;
  try {
    resolvedAddresses = await import_promises.default.lookup(hostWithoutBrackets, { all: true });
  } catch {
    throw new MediaProxyError(
      422,
      "image_host_unreachable",
      `Could not resolve image host "${hostWithoutBrackets}". Check that the domain is spelled correctly.`
    );
  }
  if (!resolvedAddresses || resolvedAddresses.length === 0) {
    throw new MediaProxyError(
      422,
      "image_host_unreachable",
      `No DNS records found for image host "${hostWithoutBrackets}".`
    );
  }
  for (const entry of resolvedAddresses) {
    if (isPrivateOrReservedIp(entry.address)) {
      throw new MediaProxyError(
        403,
        "ssrf_blocked",
        "Image URL resolves to a private or reserved network address."
      );
    }
  }
  return parsed;
}
function sniffImageMimeType(bytes) {
  if (bytes.length < 4) return null;
  if (bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71) {
    return "image/png";
  }
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) {
    return "image/jpeg";
  }
  if (bytes[0] === 71 && bytes[1] === 73 && bytes[2] === 70 && bytes[3] === 56) {
    return "image/gif";
  }
  if (bytes.length >= 12 && bytes[0] === 82 && bytes[1] === 73 && bytes[2] === 70 && bytes[3] === 70 && bytes[8] === 87 && bytes[9] === 69 && bytes[10] === 66 && bytes[11] === 80) {
    return "image/webp";
  }
  return null;
}
function buildUpstreamCandidates(initialUrl, width) {
  const driveId = extractGoogleDriveFileId(initialUrl.toString());
  if (driveId) {
    const encoded = encodeURIComponent(driveId);
    const boundedW = Math.max(120, Math.min(1200, width));
    return [
      `https://drive.google.com/thumbnail?id=${encoded}&sz=w${boundedW}`,
      `https://lh3.googleusercontent.com/d/${encoded}=w${boundedW}`,
      `https://drive.google.com/uc?export=download&id=${encoded}`
    ];
  }
  if (initialUrl.hostname.toLowerCase().includes("dropbox.com")) {
    const copy = new URL(initialUrl.toString());
    copy.searchParams.delete("dl");
    copy.searchParams.set("raw", "1");
    return [copy.toString()];
  }
  return [initialUrl.toString()];
}
async function fetchWithSafeRedirects(targetUrl) {
  let currentUrl = targetUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertSafeExternalUrl(currentUrl);
    const response = await fetch(currentUrl, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; EkklesphereMediaProxy/1.0)",
        Accept: "image/avif,image/webp,image/png,image/jpeg,image/*,*/*;q=0.8"
      }
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) {
        throw new MediaProxyError(
          422,
          "image_redirect_error",
          "Remote image host returned an empty redirect."
        );
      }
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }
    return response;
  }
  throw new MediaProxyError(
    422,
    "too_many_redirects",
    "Image URL exceeded the maximum number of redirects."
  );
}
async function readBoundedBuffer(response) {
  const declaredLength = Number(response.headers.get("content-length") || "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_IMAGE_BYTES) {
    throw new MediaProxyError(
      413,
      "image_too_large",
      "Remote image exceeds the 5 MB preview limit."
    );
  }
  if (!response.body) {
    const arrayBuf = await response.arrayBuffer();
    if (arrayBuf.byteLength > MAX_IMAGE_BYTES) {
      throw new MediaProxyError(
        413,
        "image_too_large",
        "Remote image exceeds the 5 MB preview limit."
      );
    }
    return Buffer.from(arrayBuf);
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > MAX_IMAGE_BYTES) {
        await reader.cancel().catch(() => void 0);
        throw new MediaProxyError(
          413,
          "image_too_large",
          "Remote image exceeds the 5 MB preview limit."
        );
      }
      chunks.push(value);
    }
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c)), total);
}
function formatDiagnosticError(isGoogleDrive, status, rawContentType) {
  const ctLower = rawContentType.toLowerCase();
  if (status === 401 || status === 403) {
    if (isGoogleDrive) {
      return new MediaProxyError(
        422,
        "google_drive_private",
        "Google Drive denied public access to this image. Open the file in Google Drive -> Share -> change General access to 'Anyone with the link'."
      );
    }
    return new MediaProxyError(
      422,
      "remote_access_denied",
      `Remote host denied access (HTTP ${status}). Verify that the image URL is publicly accessible without signing in.`
    );
  }
  if (status >= 400) {
    return new MediaProxyError(
      422,
      "remote_http_error",
      `Remote host returned HTTP ${status} for this image URL.`
    );
  }
  if (ctLower.includes("text/html") || ctLower.includes("application/xhtml")) {
    if (isGoogleDrive) {
      return new MediaProxyError(
        422,
        "google_drive_html",
        "Google Drive returned a sign-in or preview page instead of an image. Open the file in Google Drive -> Share -> set General access to 'Anyone with the link'."
      );
    }
    return new MediaProxyError(
      422,
      "non_image_html",
      "The URL returned a webpage (HTML) instead of an image file. Paste a direct image link (JPG, PNG, or WebP)."
    );
  }
  return new MediaProxyError(
    422,
    "non_image_content",
    `Remote URL did not return an image (received ${rawContentType || "unknown content type"}).`
  );
}
async function optimizeProxiedImageBuffer(buffer, contentType, options) {
  const lowerCt = contentType.toLowerCase();
  if (lowerCt.includes("svg") || lowerCt.includes("gif") && buffer.byteLength < 180 * 1024) {
    return { buffer, contentType };
  }
  const sharp = await getSharp();
  if (!sharp) {
    return { buffer, contentType };
  }
  try {
    let pipeline = sharp(buffer, { failOn: "none" }).rotate().resize({
      width: options.width,
      height: options.width,
      fit: "inside",
      withoutEnlargement: true
    });
    let outBuffer;
    let outContentType;
    if (options.preferWebp) {
      outBuffer = await pipeline.webp({ quality: options.quality, effort: 4 }).toBuffer();
      outContentType = "image/webp";
    } else {
      outBuffer = await pipeline.jpeg({ quality: options.quality, mozjpeg: true }).toBuffer();
      outContentType = "image/jpeg";
    }
    if (outBuffer.byteLength > 0 && (outBuffer.byteLength < buffer.byteLength || buffer.byteLength > 32 * 1024)) {
      return { buffer: outBuffer, contentType: outContentType };
    }
    return { buffer, contentType };
  } catch {
    return { buffer, contentType };
  }
}
function computeEtag(buffer) {
  const hash = (0, import_crypto5.createHash)("sha1").update(buffer).digest("hex").slice(0, 20);
  return `"${hash}"`;
}
async function proxyExternalImage(rawUrl, options = {}) {
  const parsed = await assertSafeExternalUrl(rawUrl);
  const width = Math.max(64, Math.min(1600, Math.round(options.width || 1e3)));
  const quality = Math.max(40, Math.min(90, Math.round(options.quality || 78)));
  const preferWebp = typeof options.acceptHeader === "string" ? options.acceptHeader.toLowerCase().includes("image/webp") : true;
  const formatKey = preferWebp ? "webp" : "jpeg";
  const driveId = extractGoogleDriveFileId(parsed.toString());
  const canonicalKey = driveId ? `gdrive:${driveId}` : parsed.toString();
  const cacheKey = `${canonicalKey}::w=${width}::q=${quality}::fmt=${formatKey}`;
  const cached = getCachedEntry(cacheKey);
  if (cached) {
    return {
      buffer: cached.buffer,
      contentType: cached.contentType,
      etag: cached.etag,
      cacheHit: true
    };
  }
  const existingInFlight = inFlightRequests.get(cacheKey);
  if (existingInFlight) {
    const shared = await existingInFlight;
    return { ...shared, cacheHit: true };
  }
  const workPromise = (async () => {
    const isGoogleDrive = Boolean(driveId);
    const candidates = buildUpstreamCandidates(parsed, width);
    let lastError = null;
    for (const candidate of candidates) {
      try {
        const response = await fetchWithSafeRedirects(candidate);
        const rawContentType = (response.headers.get("content-type") || "").split(";")[0].trim();
        if (!response.ok) {
          lastError = formatDiagnosticError(isGoogleDrive, response.status, rawContentType);
          continue;
        }
        const rawBuffer = await readBoundedBuffer(response);
        if (rawBuffer.byteLength === 0) {
          lastError = new MediaProxyError(422, "empty_image", "Remote host returned an empty file.");
          continue;
        }
        let resolvedContentType = rawContentType.toLowerCase();
        if (!resolvedContentType.startsWith("image/")) {
          const sniffed = sniffImageMimeType(rawBuffer);
          if (sniffed && (!resolvedContentType || resolvedContentType === "application/octet-stream")) {
            resolvedContentType = sniffed;
          } else {
            lastError = formatDiagnosticError(isGoogleDrive, response.status, rawContentType);
            continue;
          }
        }
        const optimized = await optimizeProxiedImageBuffer(rawBuffer, resolvedContentType, {
          width,
          quality,
          preferWebp
        });
        const etag = computeEtag(optimized.buffer);
        setCachedEntry(cacheKey, {
          buffer: optimized.buffer,
          contentType: optimized.contentType,
          etag,
          cachedAt: Date.now()
        });
        return {
          buffer: optimized.buffer,
          contentType: optimized.contentType,
          etag
        };
      } catch (err) {
        if (err instanceof MediaProxyError) {
          if (err.code === "ssrf_blocked" || err.code === "invalid_image_url" || err.code === "invalid_image_protocol") {
            throw err;
          }
          lastError = err;
        } else {
          lastError = new MediaProxyError(
            422,
            "upstream_fetch_failed",
            err?.name === "TimeoutError" ? "Timed out waiting for the remote image host to respond." : "Could not download image from the remote host."
          );
        }
      }
    }
    throw lastError || new MediaProxyError(422, "image_proxy_failed", "Unable to load image from the provided URL.");
  })();
  inFlightRequests.set(cacheKey, workPromise);
  try {
    const result = await workPromise;
    return { ...result, cacheHit: false };
  } finally {
    inFlightRequests.delete(cacheKey);
  }
}

// server.ts
assertProductionAuthConfig();
registerExternalIdentityVerifier((token) => platformStore.verifySupabaseAccessToken(token));
registerSupportGrantLookup(
  (grantId, creatorId) => platformStore.verifyActiveSupportGrant(grantId, creatorId)
);
registerUserOrganizationResolver(async (user) => {
  if (user.email) {
    const memberRole = await platformStore.lookupMemberRoleInStore(user.id, user.email);
    if (memberRole?.organizationId) return memberRole.organizationId;
  }
  const orgs = await platformStore.listOrganisations();
  return orgs[0]?.id || null;
});
var __filename = typeof define_import_meta_default !== "undefined" && typeof define_import_meta_default.url === "string" && define_import_meta_default.url ? (0, import_url.fileURLToPath)(define_import_meta_default.url) : import_path.default.resolve(process.cwd(), "server.ts");
var __dirname = import_path.default.dirname(__filename);
var PORT = 3e3;
var app = (0, import_express2.default)();
app.set("trust proxy", 1);
app.use(
  import_express2.default.json({
    limit: "2mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    }
  })
);
app.use(expressOrganizationMiddleware);
app.use("/api/console", consoleRouter);
function getClientIpKey(req) {
  try {
    const xff = req.headers?.["x-forwarded-for"];
    if (typeof xff === "string" && xff.trim()) {
      return xff.split(",")[0].trim();
    }
    if (Array.isArray(xff) && xff.length > 0 && xff[0]) {
      return String(xff[0]).split(",")[0].trim();
    }
    const fwd = req.headers?.forwarded;
    if (typeof fwd === "string" && fwd.trim()) {
      const match = fwd.match(/for="?([^;,"]+)/i);
      if (match?.[1]) return match[1].trim();
    }
    return req.ip || req.socket?.remoteAddress || "127.0.0.1";
  } catch {
    return "127.0.0.1";
  }
}
var attendanceLimiter = (0, import_express_rate_limit2.default)({
  windowMs: 60 * 1e3,
  max: 180,
  standardHeaders: true,
  legacyHeaders: false,
  passOnStoreError: true,
  keyGenerator: (req) => getClientIpKey(req),
  validate: false,
  message: { error: "rate_limit_exceeded", message: "Too many attendance submissions. Please wait." }
});
var authIpBurstLimiter = (0, import_express_rate_limit2.default)({
  windowMs: 15 * 60 * 1e3,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  passOnStoreError: true,
  keyGenerator: (req) => `ip:${getClientIpKey(req)}`,
  validate: false,
  message: {
    error: "rate_limit_exceeded",
    code: "AUTH_IP_RATE_LIMITED",
    message: "Too many authentication attempts from this network. Please wait 15 minutes and try again."
  }
});
var authLoginLimiter = (0, import_express_rate_limit2.default)({
  windowMs: 15 * 60 * 1e3,
  max: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  passOnStoreError: true,
  keyGenerator: (req) => {
    const bodyObj = req.body && typeof req.body === "object" ? req.body : typeof req.body === "string" ? (() => {
      try {
        return JSON.parse(req.body);
      } catch {
        return {};
      }
    })() : {};
    const rawId = typeof bodyObj?.identifier === "string" ? bodyObj.identifier : typeof bodyObj?.email === "string" ? bodyObj.email : "";
    return `${getClientIpKey(req)}:${rawId.trim().toLowerCase().slice(0, 80) || "anon"}`;
  },
  validate: false,
  message: {
    error: "rate_limit_exceeded",
    code: "AUTH_RATE_LIMITED",
    message: "Too many failed sign-in attempts. Please wait 15 minutes before retrying."
  }
});
var authRegisterLimiter = (0, import_express_rate_limit2.default)({
  windowMs: 15 * 60 * 1e3,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  passOnStoreError: true,
  keyGenerator: (req) => `reg:${getClientIpKey(req)}`,
  validate: false,
  message: {
    error: "rate_limit_exceeded",
    code: "REGISTER_RATE_LIMITED",
    message: "Too many registration attempts from this IP. Please wait before trying again."
  }
});
var authSessionLimiter = (0, import_express_rate_limit2.default)({
  windowMs: 60 * 1e3,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  passOnStoreError: true,
  keyGenerator: (req) => `sess:${getClientIpKey(req)}`,
  validate: false,
  message: {
    error: "rate_limit_exceeded",
    code: "SESSION_RATE_LIMITED",
    message: "Too many session exchange requests. Please wait a moment."
  }
});
var loginRequestSchema = import_zod2.z.object({
  identifier: import_zod2.z.string().trim().min(1).max(160).optional(),
  email: import_zod2.z.string().trim().min(1).max(160).optional(),
  password: import_zod2.z.string().min(1, "Password is required.").max(256)
}).refine((data) => Boolean((data.identifier || data.email || "").trim()), {
  message: "Email, phone, or username is required."
});
var changePasswordSchema = import_zod2.z.object({
  currentPassword: import_zod2.z.string().min(1, "Current password is required.").max(256),
  newPassword: import_zod2.z.string().min(8, "New password must be at least 8 characters long.").max(256),
  confirmPassword: import_zod2.z.string().max(256).optional()
});
var registerRequestSchema = import_zod2.z.object({
  firstName: import_zod2.z.string().trim().min(1, "First name is required.").max(80),
  lastName: import_zod2.z.string().trim().min(1, "Last name is required.").max(80),
  email: import_zod2.z.string().trim().email("Invalid email address.").max(160).optional().or(import_zod2.z.literal("")),
  phone: import_zod2.z.string().trim().min(7).max(32).optional().or(import_zod2.z.literal("")),
  password: import_zod2.z.string().min(8, "Password must be at least 8 characters long.").max(256),
  organizationId: import_zod2.z.string().trim().uuid().optional(),
  organizationSlug: import_zod2.z.string().trim().max(80).optional(),
  groupName: import_zod2.z.string().trim().max(120).optional(),
  autoCheckinOptedIn: import_zod2.z.boolean().optional()
}).refine((data) => Boolean((data.email || "").trim() || (data.phone || "").trim()), {
  message: "Either a valid email address or phone number is required."
});
var bootstrapCreatorSchema = import_zod2.z.object({
  email: import_zod2.z.string().trim().email("A valid Creator email address is required.").max(160),
  password: import_zod2.z.string().min(8, "Creator password must be at least 8 characters long.").max(256),
  username: import_zod2.z.string().trim().min(2).max(80).optional().or(import_zod2.z.literal("")),
  phone: import_zod2.z.string().trim().min(7).max(32).optional().or(import_zod2.z.literal("")),
  name: import_zod2.z.string().trim().min(2).max(160).optional().or(import_zod2.z.literal("")),
  organizationId: import_zod2.z.string().trim().uuid().optional().or(import_zod2.z.literal("")),
  bootstrapSecret: import_zod2.z.string().trim().min(1).max(256).optional()
});
var registerOrganisationSchema = import_zod2.z.object({
  organizationName: import_zod2.z.string().trim().min(2, "Organisation / church name is required.").max(160),
  orgType: import_zod2.z.enum(["church", "organisation"]).default("church"),
  city: import_zod2.z.string().trim().max(100).optional(),
  country: import_zod2.z.string().trim().max(100).optional(),
  adminFirstName: import_zod2.z.string().trim().min(1, "Administrator first name is required.").max(80),
  adminLastName: import_zod2.z.string().trim().min(1, "Administrator last name is required.").max(80),
  email: import_zod2.z.string().trim().email("A valid email address is required.").max(160),
  phone: import_zod2.z.string().trim().max(32).optional().or(import_zod2.z.literal("")),
  password: import_zod2.z.string().min(8, "Password must be at least 8 characters long.").max(256),
  trialPlan: import_zod2.z.enum(["grace_starter", "ministry_pro", "cathedral_enterprise"]).default("grace_starter")
});
var upgradeOrganisationSchema = import_zod2.z.object({
  tier: import_zod2.z.enum(["grace_starter", "ministry_pro", "cathedral_enterprise"]),
  billingCycle: import_zod2.z.enum(["monthly", "annual", "lifetime"]).default("annual"),
  paymentMethod: import_zod2.z.enum(["momo", "bank", "cash"]).default("momo"),
  paymentReference: import_zod2.z.string().trim().min(2, "Payment reference is required.").max(160),
  currency: import_zod2.z.enum(["GHS", "USD"]).default("USD"),
  notes: import_zod2.z.string().trim().max(400).optional()
});
function requireAuthRole(...allowedRoles) {
  const roleGuard = requireRoles(...allowedRoles);
  return async (req, res, next) => {
    await requireUser(req, res, async () => {
      roleGuard(req, res, async () => {
        await enforceOrganizationScope(req, res, next);
      });
    });
  };
}
async function resolveRequestOversightAccess(req) {
  if (!req.user) return false;
  if (hasPastoralOversightAccess(req.user)) return true;
  if (!req.user.designation && req.organizationId) {
    const resolved = await platformStore.resolveUserDesignation(
      req.organizationId,
      req.user.id,
      req.user.email
    );
    if (resolved) {
      req.user.designation = resolved;
      return hasPastoralOversightAccess(req.user);
    }
  }
  return false;
}
async function requirePastoralOversight(req, res, next) {
  await requireUser(req, res, async () => {
    await enforceOrganizationScope(req, res, async () => {
      const allowed = await resolveRequestOversightAccess(req);
      if (!allowed) {
        res.status(403).json({
          error: "forbidden",
          message: "Access denied. Pastoral Care Monitor is restricted to Administrator, Pastor, Presiding Elder, and Associate Pastor."
        });
        return;
      }
      next();
    });
  });
}
async function requireFollowupAccess(req, res, next) {
  await requireUser(req, res, async () => {
    await enforceOrganizationScope(req, res, async () => {
      const baseAllowed = [
        "admin",
        "pastor",
        "usher",
        "group_leader",
        "super_admin",
        "creator"
      ];
      if (isCreatorClaim(req.user) || baseAllowed.includes(req.user.role)) {
        next();
        return;
      }
      const oversightAllowed = await resolveRequestOversightAccess(req);
      if (oversightAllowed) {
        next();
        return;
      }
      res.status(403).json({
        error: "forbidden",
        message: `Access denied. Role '${req.user.role}' does not possess pastoral follow-up permissions.`
      });
    });
  });
}
app.all("/api/dev/preview-session", (_req, res) => {
  return res.status(404).json({
    error: "not_found",
    message: "Development preview-session endpoint has been permanently removed."
  });
});
app.post(
  "/api/auth/login",
  authIpBurstLimiter,
  authLoginLimiter,
  async (req, res) => {
    const rawBody = req.body && typeof req.body === "object" ? req.body : typeof req.body === "string" ? (() => {
      try {
        return JSON.parse(req.body);
      } catch {
        return {};
      }
    })() : {};
    const parsed = loginRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return res.status(400).json({
        error: "invalid_input",
        code: "INVALID_CREDENTIALS",
        message: parsed.error.issues[0]?.message || "Identifier and password are required."
      });
    }
    const identifier = (parsed.data.identifier || parsed.data.email || "").trim();
    const ipAddress = getClientIpKey(req);
    try {
      const result = await platformStore.authenticateWithCredentials(
        identifier,
        parsed.data.password,
        ipAddress
      );
      return res.status(200).json({
        token: result.token,
        idleTimeoutMinutes: result.idleTimeoutMinutes,
        sessionExpiresAt: result.sessionExpiresAt,
        role: result.user.role,
        organizationId: result.user.organizationId,
        isCreator: result.user.isCreator,
        mustChangePassword: Boolean(result.user.mustChangePassword),
        user: {
          ...result.user,
          organization_id: result.user.organizationId,
          tenant_id: result.user.organizationId,
          is_creator: result.user.isCreator,
          mustChangePassword: Boolean(result.user.mustChangePassword)
        },
        organization: result.organization
      });
    } catch (err) {
      const status = typeof err?.status === "number" ? err.status : 401;
      if (status >= 500) {
        console.error("[Ekklesphere Auth] Login error:", err?.message || err);
      }
      if (status === 429 && err?.retryAfterSeconds) {
        res.setHeader("Retry-After", String(err.retryAfterSeconds));
      }
      const errorType = status === 429 ? "rate_limit_exceeded" : err?.code === "ACCOUNT_INACTIVE" ? "forbidden" : status >= 500 ? "service_unavailable" : "unauthorized";
      return res.status(status).json({
        error: errorType,
        code: err?.code || (status >= 500 ? "AUTH_SERVICE_UNAVAILABLE" : "INVALID_CREDENTIALS"),
        message: err?.message || "Authentication failed.",
        retryAfterSeconds: err?.retryAfterSeconds
      });
    }
  }
);
app.post("/api/auth/register", authRegisterLimiter, async (req, res) => {
  const parsed = registerRequestSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({
      error: "invalid_input",
      code: "INVALID_INPUT",
      message: parsed.error.issues[0]?.message || "Invalid registration fields provided."
    });
  }
  const ipAddress = getClientIpKey(req);
  try {
    const result = await platformStore.registerMemberWithCredentials({
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      email: parsed.data.email || void 0,
      phone: parsed.data.phone || void 0,
      password: parsed.data.password,
      organizationId: parsed.data.organizationId,
      organizationSlug: parsed.data.organizationSlug,
      groupName: parsed.data.groupName,
      autoCheckinOptedIn: parsed.data.autoCheckinOptedIn,
      ipAddress
    });
    return res.status(201).json({
      token: result.token,
      idleTimeoutMinutes: result.idleTimeoutMinutes,
      sessionExpiresAt: result.sessionExpiresAt,
      role: "member",
      organizationId: result.user.organizationId,
      isCreator: false,
      mustChangePassword: false,
      user: {
        ...result.user,
        organization_id: result.user.organizationId,
        tenant_id: result.user.organizationId,
        is_creator: false,
        mustChangePassword: false
      },
      organization: result.organization
    });
  } catch (err) {
    const status = typeof err?.status === "number" ? err.status : 400;
    return res.status(status).json({
      error: status === 409 ? "conflict" : "registration_failed",
      code: err?.code || "REGISTRATION_FAILED",
      message: err?.message || "Could not complete member registration."
    });
  }
});
app.post(
  "/api/auth/register-organisation",
  authIpBurstLimiter,
  authRegisterLimiter,
  async (req, res) => {
    const parsed = registerOrganisationSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        error: "invalid_input",
        code: "INVALID_INPUT",
        message: parsed.error.issues[0]?.message || "Invalid organisation sign-up fields provided."
      });
    }
    const ipAddress = getClientIpKey(req);
    try {
      const result = await platformStore.registerOrganisationTrial({
        organizationName: parsed.data.organizationName,
        orgType: parsed.data.orgType,
        city: parsed.data.city,
        country: parsed.data.country,
        adminFirstName: parsed.data.adminFirstName,
        adminLastName: parsed.data.adminLastName,
        email: parsed.data.email,
        phone: parsed.data.phone || void 0,
        password: parsed.data.password,
        trialPlan: parsed.data.trialPlan,
        ipAddress
      });
      return res.status(201).json({
        token: result.token,
        idleTimeoutMinutes: result.idleTimeoutMinutes,
        sessionExpiresAt: result.sessionExpiresAt,
        role: result.user.role,
        organizationId: result.organization.id,
        isCreator: false,
        mustChangePassword: false,
        user: {
          ...result.user,
          organization_id: result.organization.id,
          tenant_id: result.organization.id,
          is_creator: false,
          mustChangePassword: false
        },
        organization: result.organization,
        license: result.license,
        evaluation: result.evaluation
      });
    } catch (err) {
      const status = typeof err?.status === "number" ? err.status : 400;
      return res.status(status).json({
        error: status === 409 ? "conflict" : "organisation_registration_failed",
        code: err?.code || "ORGANISATION_REGISTRATION_FAILED",
        message: err?.message || "Could not complete organisation trial sign-up."
      });
    }
  }
);
app.post("/api/auth/logout", authSessionLimiter, async (req, res) => {
  const token = extractBearerToken(req);
  if (token) {
    try {
      const decoded = await resolveVerifiedUserFromToken(token);
      revokeServerSession(decoded.sid);
    } catch {
    }
  }
  return res.status(200).json({
    success: true,
    message: "Session cleared successfully."
  });
});
app.post("/api/auth/change-password", authSessionLimiter, requireUser, async (req, res) => {
  const parsed = changePasswordSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({
      error: "invalid_input",
      code: "INVALID_INPUT",
      message: parsed.error.issues[0]?.message || "Current password and valid new password are required."
    });
  }
  if (parsed.data.confirmPassword !== void 0 && parsed.data.confirmPassword !== parsed.data.newPassword) {
    return res.status(400).json({
      error: "password_mismatch",
      code: "PASSWORD_MISMATCH",
      message: "New password and confirmation do not match."
    });
  }
  try {
    const result = await platformStore.changePasswordForUser({
      userId: req.user.id,
      email: req.user.email,
      currentPassword: parsed.data.currentPassword,
      newPassword: parsed.data.newPassword,
      ipAddress: getClientIpKey(req)
    });
    return res.status(200).json({
      success: true,
      mustChangePassword: result.mustChangePassword,
      passwordUpdatedAt: result.passwordUpdatedAt,
      message: "Password updated successfully."
    });
  } catch (err) {
    const status = typeof err?.status === "number" ? err.status : 400;
    return res.status(status).json({
      error: status === 401 ? "unauthorized" : status === 404 ? "not_found" : "password_change_failed",
      code: err?.code || "PASSWORD_CHANGE_FAILED",
      message: err?.message || "Could not update password."
    });
  }
});
app.get("/api/auth/public-config", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const publicConfig = platformStore.getPublicSupabaseAuthConfig();
  return res.status(200).json({
    supabaseUrl: publicConfig.supabaseUrl,
    supabaseAnonKey: publicConfig.supabaseAnonKey,
    googleOAuthConfigured: publicConfig.googleOAuthConfigured,
    storageBackend: platformStore.storageBackend
  });
});
app.get(["/api/auth/google-callback", "/api/auth/google-callback/"], (_req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Completing Google Sign-In \xB7 Ekklesphere</title>
    <style>
      body { font-family: system-ui, -apple-system, sans-serif; margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #F8F9FD; color: #1D1B3A; padding: 24px; }
      .card { max-width: 380px; width: 100%; background: #ffffff; border: 1px solid #E3E5F2; border-radius: 16px; padding: 24px; text-align: center; box-shadow: 0 10px 30px rgba(29,27,58,0.08); }
      h1 { font-size: 16px; margin: 0 0 8px; font-weight: 700; }
      p { font-size: 13px; margin: 0 0 16px; color: #5B5F7A; line-height: 1.5; }
      button { appearance: none; border: 0; border-radius: 10px; background: #6D5CF2; color: #fff; font-size: 13px; font-weight: 600; padding: 10px 16px; cursor: pointer; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1 id="status-title">Completing Google Sign-In...</h1>
      <p id="status-copy">Returning your verified session to Ekklesphere.</p>
      <button id="close-btn" type="button" onclick="window.close()">Close Window</button>
    </div>
    <script>
      (function () {
        var search = new URLSearchParams(window.location.search || '');
        var hashRaw = (window.location.hash || '').replace(/^#/, '');
        var hash = new URLSearchParams(hashRaw);
        var payload = {
          type: 'EKKLESPHERE_GOOGLE_OAUTH_CALLBACK',
          code: search.get('code') || null,
          accessToken: hash.get('access_token') || null,
          refreshToken: hash.get('refresh_token') || null,
          error: search.get('error') || hash.get('error') || null,
          errorDescription: search.get('error_description') || hash.get('error_description') || null
        };
        var sentToOpener = false;
        try {
          if (window.opener && !window.opener.closed) {
            window.opener.postMessage(payload, window.location.origin);
            sentToOpener = true;
          }
        } catch (e) {}
        try {
          if (typeof BroadcastChannel !== 'undefined') {
            var ch = new BroadcastChannel('ekklesphere_google_oauth');
            ch.postMessage(payload);
            ch.close();
          }
        } catch (e) {}
        if (sentToOpener) {
          document.getElementById('status-title').textContent = payload.error ? 'Google Sign-In Cancelled' : 'Sign-In Verified';
          document.getElementById('status-copy').textContent = payload.error
            ? (payload.errorDescription || payload.error)
            : 'You can return to Ekklesphere now.';
          setTimeout(function () {
            try { window.close(); } catch (e) {}
          }, 150);
        } else {
          var target = '/app' + (window.location.search || '') + (window.location.hash || '');
          window.location.replace(target);
        }
      })();
    </script>
  </body>
</html>`;
  return res.status(200).send(html);
});
app.post("/api/auth/token", authSessionLimiter, requireUser, async (req, res) => {
  try {
    const verifiedUser = req.user;
    const creator = isCreatorClaim(verifiedUser);
    let resolvedRole = verifiedUser.role;
    let resolvedOrgId = verifiedUser.organization_id || verifiedUser.tenant_id || "";
    let resolvedName = verifiedUser.name || verifiedUser.email.split("@")[0] || "Church User";
    if (!resolvedOrgId || verifiedUser.auth_provider === "supabase" && !creator) {
      const dbMembership = await platformStore.lookupMemberRoleInStore(verifiedUser.id, verifiedUser.email);
      resolvedOrgId = dbMembership.organizationId || resolvedOrgId;
      resolvedRole = dbMembership.role || resolvedRole;
      if (dbMembership.name) resolvedName = dbMembership.name;
    }
    if (!resolvedOrgId) {
      const orgs = await platformStore.listOrganisations();
      resolvedOrgId = orgs[0]?.id || "";
    }
    if (!resolvedOrgId && !creator) {
      return res.status(403).json({
        error: "organization_required",
        code: "ORGANIZATION_REQUIRED",
        message: "No active church workspace was found for this Google account. Start a church trial or ask your church administrator to add your email."
      });
    }
    const [sessionTimeoutMinutes, org, memberProfile] = await Promise.all([
      platformStore.getOrganizationSessionTimeoutMinutes(resolvedOrgId),
      resolvedOrgId ? platformStore.getOrganisationById(resolvedOrgId) : Promise.resolve(null),
      resolvedOrgId ? platformStore.getMemberProfileForSession(resolvedOrgId, verifiedUser.id, verifiedUser.email) : Promise.resolve(null)
    ]);
    const resolvedAvatar = memberProfile?.imageUrl && String(memberProfile.imageUrl).trim() || verifiedUser.avatar || void 0;
    const { token, idleTimeoutMinutes, expiresAt } = signSessionToken(
      {
        id: verifiedUser.id,
        email: verifiedUser.email,
        role: creator ? verifiedUser.role === "super_admin" ? "super_admin" : "creator" : resolvedRole,
        name: resolvedName,
        organization_id: resolvedOrgId,
        tenant_id: resolvedOrgId,
        campus_id: verifiedUser.campus_id,
        avatar: resolvedAvatar,
        is_creator: creator,
        auth_provider: "session_jwt"
      },
      sessionTimeoutMinutes
    );
    return res.status(200).json({
      token,
      idleTimeoutMinutes,
      sessionExpiresAt: expiresAt,
      role: creator ? verifiedUser.role === "super_admin" ? "super_admin" : "creator" : resolvedRole,
      organizationId: resolvedOrgId,
      organizationName: org?.name || void 0,
      organization: org ? {
        id: org.id,
        name: org.name,
        slug: org.slug,
        city: org.city
      } : null,
      isCreator: creator,
      user: {
        id: verifiedUser.id,
        email: verifiedUser.email,
        name: resolvedName,
        role: creator ? verifiedUser.role === "super_admin" ? "super_admin" : "creator" : resolvedRole,
        organization_id: resolvedOrgId,
        tenant_id: resolvedOrgId,
        organizationName: org?.name || void 0,
        avatar: resolvedAvatar,
        is_creator: creator
      }
    });
  } catch (err) {
    const status = typeof err?.status === "number" ? err.status : 500;
    return res.status(status).json({
      error: err?.code || "token_exchange_failed",
      message: err?.message || "Unable to exchange authentication token."
    });
  }
});
app.post("/api/auth/session/keepalive", authSessionLimiter, requireUser, async (req, res) => {
  try {
    const verifiedUser = req.user;
    const orgId = verifiedUser.organization_id || verifiedUser.tenant_id || "";
    const orgTimeout = await platformStore.getOrganizationSessionTimeoutMinutes(orgId);
    const effectiveTimeout = normalizeIdleTimeoutMinutes(orgTimeout);
    if (verifiedUser.sid) {
      revokeServerSession(verifiedUser.sid);
    }
    const { token, idleTimeoutMinutes, expiresAt } = signSessionToken(
      {
        id: verifiedUser.id,
        email: verifiedUser.email,
        role: verifiedUser.role,
        name: verifiedUser.name,
        organization_id: orgId,
        tenant_id: orgId,
        campus_id: verifiedUser.campus_id,
        is_creator: isCreatorClaim(verifiedUser),
        auth_provider: "session_jwt"
      },
      effectiveTimeout
    );
    return res.status(200).json({
      ok: true,
      token,
      idleTimeoutMinutes,
      sessionExpiresAt: expiresAt
    });
  } catch (err) {
    const status = typeof err?.status === "number" ? err.status : 500;
    return res.status(status).json({
      error: err?.code || "session_keepalive_failed",
      message: err?.message || "Unable to refresh active session."
    });
  }
});
app.post("/api/auth/creator-session", authSessionLimiter, requireUser, async (req, res) => {
  try {
    const verifiedUser = req.user;
    if (!isCreatorClaim(verifiedUser)) {
      return res.status(403).json({
        error: "creator_required",
        message: "Access denied. Verified platform creator privilege is required."
      });
    }
    const orgs = await platformStore.listOrganisations();
    const activeOrgId = verifiedUser.organization_id || orgs[0]?.id || "";
    const orgTimeout = await platformStore.getOrganizationSessionTimeoutMinutes(activeOrgId);
    const { token, idleTimeoutMinutes, expiresAt } = signSessionToken(
      {
        id: verifiedUser.id,
        email: verifiedUser.email,
        role: verifiedUser.role === "super_admin" ? "super_admin" : "creator",
        name: verifiedUser.name || "Platform Creator",
        organization_id: activeOrgId,
        tenant_id: activeOrgId,
        campus_id: verifiedUser.campus_id,
        is_creator: true,
        auth_provider: "session_jwt"
      },
      orgTimeout
    );
    return res.status(200).json({
      token,
      idleTimeoutMinutes,
      sessionExpiresAt: expiresAt,
      role: verifiedUser.role === "super_admin" ? "super_admin" : "creator",
      organizationId: activeOrgId,
      isCreator: true,
      user: {
        id: verifiedUser.id,
        email: verifiedUser.email,
        name: verifiedUser.name || "Platform Creator",
        role: verifiedUser.role === "super_admin" ? "super_admin" : "creator",
        organization_id: activeOrgId,
        tenant_id: activeOrgId,
        is_creator: true
      }
    });
  } catch (err) {
    const status = typeof err?.status === "number" ? err.status : 500;
    return res.status(status).json({
      error: err?.code || "creator_session_failed",
      message: err?.message || "Unable to refresh creator session."
    });
  }
});
app.post(
  "/api/auth/bootstrap-creator",
  authIpBurstLimiter,
  authRegisterLimiter,
  async (req, res) => {
    const expectedSecret = (process.env.CREATOR_BOOTSTRAP_SECRET || "").trim();
    if (!expectedSecret || expectedSecret.length < 8) {
      return res.status(403).json({
        error: "bootstrap_disabled",
        code: "BOOTSTRAP_SECRET_UNCONFIGURED",
        message: "Creator bootstrap endpoint is disabled until CREATOR_BOOTSTRAP_SECRET (min 8 characters) is set in server secrets."
      });
    }
    const parsed = bootstrapCreatorSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        error: "invalid_input",
        code: "INVALID_INPUT",
        message: parsed.error.issues[0]?.message || "Valid creator bootstrap fields are required."
      });
    }
    const headerSecretRaw = req.headers["x-creator-bootstrap-secret"];
    const providedSecret = ((typeof headerSecretRaw === "string" ? headerSecretRaw : "") || parsed.data.bootstrapSecret || "").trim();
    const expectedBuf = Buffer.from(expectedSecret, "utf8");
    const providedBuf = Buffer.from(providedSecret, "utf8");
    const matches = providedBuf.length === expectedBuf.length && (0, import_crypto6.timingSafeEqual)(providedBuf, expectedBuf);
    if (!matches) {
      return res.status(403).json({
        error: "forbidden",
        code: "INVALID_BOOTSTRAP_SECRET",
        message: "Invalid CREATOR_BOOTSTRAP_SECRET."
      });
    }
    try {
      const result = await platformStore.upsertCreatorCredentials({
        email: parsed.data.email,
        password: parsed.data.password,
        username: parsed.data.username || void 0,
        phone: parsed.data.phone || void 0,
        name: parsed.data.name || void 0,
        organizationId: parsed.data.organizationId || void 0
      });
      await platformStore.appendAuditLog({
        actorId: result.user.id,
        actorEmail: result.user.email,
        actorRole: "creator",
        action: "creator.credentials_bootstrapped",
        targetType: "account_credentials",
        targetId: result.user.id,
        metadata: {
          email: result.user.email,
          username: result.user.username || null,
          hasPhone: Boolean(result.user.phoneE164),
          persistedInSupabase: result.persistedInSupabase
        },
        ipAddress: getClientIpKey(req)
      });
      return res.status(200).json({
        success: true,
        token: result.token,
        role: result.user.role,
        organizationId: result.user.organizationId,
        isCreator: true,
        persistedInSupabase: result.persistedInSupabase,
        user: {
          ...result.user,
          organization_id: result.user.organizationId,
          tenant_id: result.user.organizationId,
          is_creator: true
        }
      });
    } catch (err) {
      const status = typeof err?.status === "number" ? err.status : 400;
      return res.status(status).json({
        error: "bootstrap_failed",
        code: err?.code || "BOOTSTRAP_FAILED",
        message: err?.message || "Failed to bootstrap creator credentials."
      });
    }
  }
);
var landingLeadSubmissionLimiter = (0, import_express_rate_limit2.default)({
  windowMs: 15 * 60 * 1e3,
  max: 25,
  standardHeaders: true,
  legacyHeaders: false,
  passOnStoreError: true,
  keyGenerator: (req) => `landing-lead:${getClientIpKey(req)}`,
  validate: false,
  message: {
    error: "rate_limit_exceeded",
    message: "Too many submissions from this network. Please wait a few minutes and try again."
  }
});
var publicLandingLeadSchema = import_zod2.z.object({
  leadType: import_zod2.z.enum(["demo_request", "contact_inquiry", "quick_interest", "trial_intent"]).optional().default("demo_request"),
  email: import_zod2.z.string().trim().email("Please provide a valid email address.").max(160),
  fullName: import_zod2.z.string().trim().max(140).optional(),
  phone: import_zod2.z.string().trim().max(40).optional(),
  churchName: import_zod2.z.string().trim().max(160).optional().default(""),
  interest: import_zod2.z.string().trim().max(160).optional(),
  message: import_zod2.z.string().trim().max(2e3).optional(),
  sourceSection: import_zod2.z.string().trim().max(100).optional()
});
app.get(["/api/landing-config", "/api/public/landing-overview"], async (_req, res) => {
  try {
    const overview = await platformStore.getPublicLandingOverview();
    return res.status(200).json(overview);
  } catch (err) {
    console.warn("[Ekklesphere] Landing overview fallback triggered:", err?.message || err);
    let landingConfig = { ...DEFAULT_LANDING_CMS };
    try {
      landingConfig = await platformStore.getLandingConfig();
    } catch {
    }
    return res.status(200).json({
      landingConfig,
      plans: [],
      liveStats: { activeChurchesCount: 0, activeSitesCount: 0, totalCheckinsRecorded: 0 }
    });
  }
});
app.post(
  "/api/public/landing-leads",
  landingLeadSubmissionLimiter,
  async (req, res) => {
    const parsed = publicLandingLeadSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        error: "validation_error",
        message: parsed.error.issues[0]?.message || "Please check the required inquiry fields."
      });
    }
    const resolvedChurchName = parsed.data.churchName?.trim() || parsed.data.fullName?.trim() || "Prospective Ministry";
    try {
      const lead = await platformStore.createLandingLead({
        leadType: parsed.data.leadType,
        email: parsed.data.email,
        fullName: parsed.data.fullName,
        phone: parsed.data.phone,
        churchName: resolvedChurchName,
        interest: parsed.data.interest,
        message: parsed.data.message,
        sourceSection: parsed.data.sourceSection || "landing_page",
        metadata: {
          ipAddress: getClientIpKey(req),
          userAgent: String(req.headers["user-agent"] || "").slice(0, 180)
        }
      });
      await platformStore.appendAuditLog({
        actorEmail: lead.email,
        actorRole: "public_visitor",
        action: "landing.lead_submitted",
        targetType: "landing_lead",
        targetId: lead.id,
        metadata: {
          leadType: lead.leadType,
          churchName: lead.churchName,
          interest: lead.interest || null,
          sourceSection: lead.sourceSection || null
        },
        ipAddress: getClientIpKey(req)
      });
      const landingCfg = await platformStore.getLandingConfig().catch(() => null);
      if (landingCfg?.contactSalesEmail && process.env.RESEND_API_KEY) {
        const subject = `[Ekklesphere Lead] ${lead.churchName} \u2014 ${lead.leadType.replace("_", " ")}`;
        const body = [
          `Church / Ministry: ${lead.churchName}`,
          `Contact Email: ${lead.email}`,
          lead.fullName ? `Contact Name: ${lead.fullName}` : null,
          lead.phone ? `Phone: ${lead.phone}` : null,
          lead.interest ? `Interest: ${lead.interest}` : null,
          lead.message ? `Message:
${lead.message}` : null,
          `Source: ${lead.sourceSection || "landing_page"}`
        ].filter(Boolean).join("\n");
        sendResendEmail({
          to: [landingCfg.contactSalesEmail],
          subject,
          text: body,
          html: buildHtmlFromPlainText(subject, body, "Ekklesphere Platform")
        }).catch(() => {
        });
      }
      return res.status(201).json({
        ok: true,
        success: true,
        leadId: lead.id,
        lead: {
          id: lead.id,
          leadType: lead.leadType,
          churchName: lead.churchName,
          status: lead.status,
          createdAt: lead.createdAt
        }
      });
    } catch (err) {
      return res.status(err?.status || 500).json({
        error: err?.code || "landing_lead_failed",
        message: err?.message || "Unable to save your request right now. Please try again."
      });
    }
  }
);
app.get(
  "/api/organisation/my-usage",
  requireAuthRole("admin", "pastor", "finance", "super_admin", "creator"),
  async (req, res) => {
    const orgId = req.organizationId;
    const [evaluation, usageDaily, allAnnouncements] = await Promise.all([
      platformStore.evaluateOrganizationLicense(orgId),
      platformStore.listUsageDaily(orgId, 30),
      platformStore.listAnnouncements()
    ]);
    const nowMs = Date.now();
    const announcements = allAnnouncements.filter((a) => {
      if (!a.active) return false;
      if (a.expiresAt && new Date(a.expiresAt).getTime() <= nowMs) return false;
      const tierMatch = a.targetTiers.length === 0 || evaluation.tier && a.targetTiers.includes(evaluation.tier);
      const orgMatch = a.targetOrganizationIds.length === 0 || a.targetOrganizationIds.includes(orgId);
      return Boolean(tierMatch && orgMatch);
    });
    return res.status(200).json({
      organizationId: orgId,
      evaluation,
      usageDaily,
      announcements
    });
  }
);
app.get(
  "/api/organisation/plans",
  requireAuthRole("admin", "pastor", "finance", "super_admin", "creator"),
  async (req, res) => {
    const orgId = req.organizationId;
    const [plans, evaluation, organization, license] = await Promise.all([
      platformStore.listPlans(),
      platformStore.evaluateOrganizationLicense(orgId),
      platformStore.getOrganisationById(orgId),
      platformStore.getLatestLicenseForOrg(orgId)
    ]);
    return res.status(200).json({
      organizationId: orgId,
      plans: plans.filter((p) => p.isActive),
      evaluation,
      organization,
      license
    });
  }
);
app.post(
  "/api/organisation/upgrade",
  requireAuthRole("admin", "finance", "super_admin", "creator"),
  async (req, res) => {
    const parsed = upgradeOrganisationSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        error: "validation_error",
        code: "INVALID_UPGRADE_INPUT",
        message: parsed.error.issues[0]?.message || "Valid plan tier and payment reference are required."
      });
    }
    const orgId = req.organizationId;
    try {
      const result = await platformStore.upgradeOrganisationSubscription({
        organizationId: orgId,
        tier: parsed.data.tier,
        billingCycle: parsed.data.billingCycle,
        paymentMethod: parsed.data.paymentMethod,
        paymentReference: parsed.data.paymentReference,
        currency: parsed.data.currency,
        notes: parsed.data.notes,
        actorId: req.user?.id,
        actorEmail: req.user?.email || "org-admin@ekklesphere.church"
      });
      await platformStore.appendAuditLog({
        organizationId: orgId,
        actorId: req.user?.id || null,
        actorEmail: req.user?.email || "org-admin@ekklesphere.church",
        actorRole: req.user?.role || "admin",
        action: "license.self_upgraded",
        targetType: "license",
        targetId: result.license.id,
        metadata: {
          tier: parsed.data.tier,
          billingCycle: parsed.data.billingCycle,
          paymentMethod: parsed.data.paymentMethod,
          paymentReference: parsed.data.paymentReference,
          amountUSD: result.payment.amount
        },
        ipAddress: getClientIpKey(req)
      });
      return res.status(200).json({
        success: true,
        ...result
      });
    } catch (err) {
      const status = typeof err?.status === "number" ? err.status : 400;
      return res.status(status).json({
        error: "upgrade_failed",
        code: err?.code || "UPGRADE_FAILED",
        message: err?.message || "Could not complete plan upgrade."
      });
    }
  }
);
function computeDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const toRad = (deg) => deg * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}
var uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
var MAX_ACCURACY_M = 100;
var EventSchema = import_zod2.z.object({
  clientEventId: import_zod2.z.string().regex(uuidRegex, "Invalid UUID"),
  siteId: import_zod2.z.string().regex(uuidRegex, "Invalid UUID").default(PRIMARY_CAMPUS_SITE_ID),
  organizationId: import_zod2.z.string().regex(uuidRegex, "Invalid UUID").optional(),
  personId: import_zod2.z.string().min(1).max(128).optional(),
  personName: import_zod2.z.string().min(1).max(160).optional(),
  serviceInstanceId: import_zod2.z.string().max(128).optional(),
  type: import_zod2.z.enum(["enter", "exit", "manual_in", "manual_out"]),
  source: import_zod2.z.enum(["geofence", "manual", "web"]),
  platform: import_zod2.z.enum(["android", "web", "ios"]).default("web"),
  lat: import_zod2.z.number().min(-90).max(90).nullable(),
  lng: import_zod2.z.number().min(-180).max(180).nullable(),
  accuracyM: import_zod2.z.number().nonnegative().nullable(),
  isMock: import_zod2.z.boolean().default(false),
  deviceTime: import_zod2.z.string().datetime()
});
var PremiseConfigSchema = import_zod2.z.object({
  siteId: import_zod2.z.string().regex(uuidRegex, "Invalid site UUID").optional(),
  churchName: import_zod2.z.preprocess(
    (val) => typeof val === "string" ? val.trim() : "",
    import_zod2.z.string().max(300).default("")
  ),
  campusName: import_zod2.z.preprocess(
    (val) => typeof val === "string" && val.trim().length > 0 ? val.trim() : "Main Campus",
    import_zod2.z.string().max(300).default("Main Campus")
  ),
  campusAddress: import_zod2.z.preprocess(
    (val) => typeof val === "string" ? val.trim() : "",
    import_zod2.z.string().max(500).default("")
  ),
  lat: import_zod2.z.preprocess((val) => {
    const num = typeof val === "number" ? val : parseFloat(String(val));
    return Number.isFinite(num) ? num : NaN;
  }, import_zod2.z.number().min(-90).max(90)),
  lng: import_zod2.z.preprocess((val) => {
    const num = typeof val === "number" ? val : parseFloat(String(val));
    return Number.isFinite(num) ? num : NaN;
  }, import_zod2.z.number().min(-180).max(180)),
  accuracyM: import_zod2.z.preprocess((val) => {
    if (val == null || val === "") return null;
    const num = typeof val === "number" ? val : parseFloat(String(val));
    return Number.isFinite(num) ? Math.max(0, num) : null;
  }, import_zod2.z.number().nullable().default(null)),
  innerGeofenceMeters: import_zod2.z.preprocess((val) => {
    if (val == null || val === "") return 50;
    const num = typeof val === "number" ? val : parseFloat(String(val));
    return Number.isFinite(num) ? Math.max(10, Math.min(5e3, Math.round(num))) : 50;
  }, import_zod2.z.number().default(50)),
  outerGeofenceMeters: import_zod2.z.preprocess((val) => {
    if (val == null || val === "") return 300;
    const num = typeof val === "number" ? val : parseFloat(String(val));
    return Number.isFinite(num) ? Math.max(25, Math.min(1e4, Math.round(num))) : 300;
  }, import_zod2.z.number().default(300)),
  dwellTimeMinutes: import_zod2.z.preprocess((val) => {
    if (val == null || val === "") return 5;
    const num = typeof val === "number" ? val : parseFloat(String(val));
    return Number.isFinite(num) ? Math.max(1, Math.min(120, Math.round(num))) : 5;
  }, import_zod2.z.number().default(5)),
  updatedBy: import_zod2.z.preprocess(
    (val) => typeof val === "string" && val.trim().length > 0 ? val.trim() : "Administrator",
    import_zod2.z.string().max(200).default("Administrator")
  )
});
function computeTelemetrySummaryFromEvents(events, includeNamedSignals = true) {
  let accepted = 0;
  let flagged = 0;
  let rejected = 0;
  let mockAttempts = 0;
  for (const ev of events) {
    if (ev.status === "accepted") accepted++;
    else if (ev.status === "flagged") flagged++;
    else if (ev.status === "rejected") rejected++;
    if (ev.is_mock || ev.flag_reasons?.includes("mock_location")) mockAttempts++;
  }
  const eventsByUser = /* @__PURE__ */ new Map();
  for (const ev of events) {
    const list = eventsByUser.get(ev.user_id) || [];
    list.push(ev);
    eventsByUser.set(ev.user_id, list);
  }
  let openShifts = 0;
  const completedDurations = [];
  for (const userEvents of eventsByUser.values()) {
    const chronological = [...userEvents].sort(
      (a, b) => new Date(a.server_time).getTime() - new Date(b.server_time).getTime()
    );
    let openIn = null;
    for (const ev of chronological) {
      if (ev.type === "enter" || ev.type === "manual_in") {
        openIn = ev;
      } else if ((ev.type === "exit" || ev.type === "manual_out") && openIn) {
        const durMin = Math.max(
          0,
          Math.round((new Date(ev.server_time).getTime() - new Date(openIn.server_time).getTime()) / 6e4)
        );
        completedDurations.push(durMin);
        openIn = null;
      }
    }
    if (openIn) openShifts++;
  }
  const avgDwellMinutes = completedDurations.length > 0 ? Math.round(completedDurations.reduce((a, b) => a + b, 0) / completedDurations.length) : null;
  return {
    totalSignals: events.length,
    accepted,
    flagged,
    rejected,
    mockAttempts,
    openShifts,
    avgDwellMinutes,
    recentSignals: includeNamedSignals ? events.slice(0, 12).map((e) => ({
      id: e.id,
      person_id: e.person_id || e.user_id,
      person_name: e.person_name,
      type: e.type,
      source: e.source,
      distance_m: e.distance_m,
      accuracy_m: e.accuracy_m,
      is_mock: e.is_mock,
      server_time: e.server_time,
      status: e.status,
      flag_reasons: e.flag_reasons
    })) : []
  };
}
app.get(
  ["/campus-premise", "/api/campus-premise"],
  requireAuthRole("admin", "pastor", "usher", "member", "group_leader", "finance", "super_admin", "creator"),
  requireActiveLicense,
  async (req, res) => {
    const orgId = req.organizationId;
    const isStaff = req.user?.role !== "member";
    const [premiseData, allCheckins, rawEvents] = await Promise.all([
      platformStore.getPremiseSettings(orgId),
      platformStore.getLiveCheckins(orgId),
      platformStore.getRawGeofenceEvents(orgId)
    ]);
    const visibleCheckins = isStaff ? allCheckins : allCheckins.filter(
      (c) => c.personId === req.user?.id || c.personId === req.user?.email || req.user?.name && c.personName === req.user.name
    );
    return res.status(200).json({
      success: true,
      configured: premiseData.configured,
      site: premiseData.site,
      premiseSettings: premiseData.premiseSettings,
      liveCheckins: visibleCheckins,
      totalCheckedIn: allCheckins.length,
      telemetrySummary: computeTelemetrySummaryFromEvents(rawEvents, isStaff)
    });
  }
);
app.post(
  ["/campus-premise", "/api/campus-premise"],
  requireAuthRole("admin", "super_admin", "creator"),
  requireActiveLicense,
  async (req, res) => {
    const parsed = PremiseConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "invalid_premise_coordinates",
        message: "Valid latitude (-90..90) and longitude (-180..180) are required.",
        details: parsed.error.flatten()
      });
    }
    const data = parsed.data;
    try {
      const saved = await platformStore.savePremiseSettings(req.organizationId, {
        siteId: data.siteId,
        churchName: data.churchName,
        campusName: data.campusName,
        campusAddress: data.campusAddress,
        lat: data.lat,
        lng: data.lng,
        accuracyM: data.accuracyM ?? null,
        innerGeofenceMeters: data.innerGeofenceMeters,
        outerGeofenceMeters: Math.max(data.outerGeofenceMeters, data.innerGeofenceMeters),
        dwellTimeMinutes: data.dwellTimeMinutes,
        updatedBy: data.updatedBy || req.user?.email || "Administrator"
      });
      return res.status(200).json({
        success: true,
        configured: true,
        site: saved.site,
        premiseSettings: saved.premiseSettings,
        sites: saved.sites
      });
    } catch (err) {
      if (err?.code === "SITE_LIMIT_REACHED") {
        return res.status(403).json({
          error: "license_limit_exceeded",
          code: "SITE_LIMIT_REACHED",
          message: err.message
        });
      }
      return res.status(500).json({
        error: "premise_save_failed",
        message: err?.message || "Failed to save campus premise settings."
      });
    }
  }
);
app.delete(
  ["/campus-premise", "/api/campus-premise"],
  requireAuthRole("admin", "super_admin", "creator"),
  requireActiveLicense,
  async (req, res) => {
    const premiseSettings = await platformStore.clearPremiseSettings(req.organizationId);
    return res.status(200).json({
      success: true,
      configured: false,
      site: null,
      premiseSettings,
      sites: []
    });
  }
);
var SystemSettingsPatchSchema = import_zod2.z.object({
  churchName: import_zod2.z.string().trim().max(300).optional(),
  churchLogoUrl: import_zod2.z.string().trim().max(4e4).optional(),
  campusName: import_zod2.z.string().trim().max(300).optional(),
  campusAddress: import_zod2.z.string().trim().max(500).optional(),
  campusLatitude: import_zod2.z.number().min(-90).max(90).nullable().optional(),
  campusLongitude: import_zod2.z.number().min(-180).max(180).nullable().optional(),
  campusLocationAccuracyM: import_zod2.z.number().min(0).nullable().optional(),
  campusLocationUpdatedAt: import_zod2.z.string().max(100).nullable().optional(),
  seniorPastor: import_zod2.z.string().trim().max(200).optional(),
  contactEmail: import_zod2.z.string().trim().max(200).optional(),
  contactPhone: import_zod2.z.string().trim().max(64).optional(),
  timezone: import_zod2.z.string().trim().max(120).optional(),
  currency: import_zod2.z.string().trim().max(80).optional(),
  outerGeofenceMeters: import_zod2.z.number().min(25).max(1e4).optional(),
  innerGeofenceMeters: import_zod2.z.number().min(10).max(5e3).optional(),
  dwellTimeMinutes: import_zod2.z.number().min(1).max(120).optional(),
  serviceWindowBeforeMinutes: import_zod2.z.number().min(0).max(240).optional(),
  serviceWindowAfterMinutes: import_zod2.z.number().min(0).max(240).optional(),
  bleBeaconRssiThreshold: import_zod2.z.number().min(-100).max(-20).optional(),
  driveByProtection: import_zod2.z.boolean().optional(),
  absenteeThresholdServices: import_zod2.z.number().min(1).max(12).optional(),
  firstTimerFollowupHours: import_zod2.z.number().min(1).max(336).optional(),
  autoAssignCellLeaders: import_zod2.z.boolean().optional(),
  autoMessageAbsentMembers: import_zod2.z.boolean().optional(),
  absentMemberMessageChannel: import_zod2.z.enum(["sms", "email", "sms_and_email"]).optional(),
  absentMemberMessageTemplate: import_zod2.z.string().trim().max(1e3).optional(),
  autoSendLeaderCareReminders: import_zod2.z.boolean().optional(),
  requireExplicitConsent: import_zod2.z.boolean().optional(),
  auditLogRetentionDays: import_zod2.z.number().min(7).max(3650).optional(),
  sessionTimeoutMinutes: import_zod2.z.number().min(0).max(480).optional(),
  smsGatewayProvider: import_zod2.z.string().trim().min(1).max(120).optional(),
  smsSenderId: import_zod2.z.string().trim().min(1).max(11).optional(),
  emailGatewayProvider: import_zod2.z.string().trim().min(1).max(120).optional(),
  emailFromAddress: import_zod2.z.string().trim().max(200).optional(),
  emailSenderName: import_zod2.z.string().trim().max(160).optional(),
  enablePushNotifications: import_zod2.z.boolean().optional(),
  customGroupCategories: import_zod2.z.array(
    import_zod2.z.object({
      id: import_zod2.z.string().trim().max(64).optional(),
      label: import_zod2.z.string().trim().min(1).max(48),
      pluralLabel: import_zod2.z.string().trim().max(56).optional(),
      description: import_zod2.z.string().trim().max(100).optional(),
      color: import_zod2.z.enum(["indigo", "emerald", "sky", "violet", "amber", "rose", "teal"]).optional(),
      isBuiltIn: import_zod2.z.boolean().optional(),
      createdAt: import_zod2.z.string().trim().max(40).optional()
    })
  ).max(50).optional()
});
var TestSmsGatewaySchema = import_zod2.z.object({
  provider: import_zod2.z.string().trim().min(1, "SMS gateway provider is required.").max(120),
  senderId: import_zod2.z.string().trim().min(1, "SMS Sender ID is required.").max(11, "SMS Sender ID must be 11 characters or fewer."),
  recipientPhone: import_zod2.z.string().trim().max(40).optional(),
  message: import_zod2.z.string().trim().max(480).optional()
});
var TestEmailGatewaySchema = import_zod2.z.object({
  provider: import_zod2.z.string().trim().min(1).max(120).default("Resend Email"),
  fromEmail: import_zod2.z.string().trim().email("Valid From email address is required.").optional(),
  fromName: import_zod2.z.string().trim().max(160).optional(),
  recipientEmail: import_zod2.z.string().trim().email("Valid test recipient email address is required."),
  subject: import_zod2.z.string().trim().max(200).optional(),
  message: import_zod2.z.string().trim().max(2e3).optional()
});
var BroadcastDispatchSchema = import_zod2.z.object({
  channel: import_zod2.z.enum(["push", "sms", "email"]),
  audience: import_zod2.z.string().trim().min(1).max(160),
  subject: import_zod2.z.string().trim().min(1, "Subject is required.").max(200),
  body: import_zod2.z.string().trim().min(1, "Message body is required.").max(4e3)
});
var ChurchGroupCategorySchema = import_zod2.z.string().trim().min(1, "Group category is required.").max(64, "Group category must be 64 characters or fewer.").transform((val) => normalizeIncomingGroupCategory(val) || "").refine((val) => isValidGroupCategorySlug(val), {
  message: "Group category must contain letters, numbers, hyphens, or underscores."
});
var ChurchGroupCreateSchema = import_zod2.z.object({
  name: import_zod2.z.string().trim().min(1, "Group name is required.").max(160),
  category: ChurchGroupCategorySchema,
  leaderName: import_zod2.z.string().trim().min(1, "Primary leader name is required.").max(160),
  leaderMemberId: import_zod2.z.string().trim().max(120).optional().nullable(),
  leaderPhone: import_zod2.z.string().trim().max(64).optional().nullable(),
  leaderEmail: import_zod2.z.string().trim().max(160).optional().nullable(),
  assistantLeader: import_zod2.z.string().trim().max(160).optional().nullable(),
  assistantLeaderMemberId: import_zod2.z.string().trim().max(120).optional().nullable(),
  meetingDay: import_zod2.z.string().trim().max(100).optional().nullable(),
  meetingTime: import_zod2.z.string().trim().max(100).optional().nullable(),
  meetingLocation: import_zod2.z.string().trim().max(240).optional().nullable(),
  targetDemographic: import_zod2.z.string().trim().max(160).optional().nullable(),
  description: import_zod2.z.string().trim().max(1e3).optional().default(""),
  active: import_zod2.z.boolean().optional().default(true)
});
var ChurchGroupUpdateSchema = ChurchGroupCreateSchema.partial().extend({
  leadershipChangeReason: import_zod2.z.string().trim().max(300).optional().nullable()
});
app.get(
  "/api/system-settings",
  requireAuthRole("admin", "pastor", "usher", "member", "group_leader", "finance", "super_admin", "creator"),
  requireActiveLicense,
  async (req, res) => {
    try {
      const result = await platformStore.getSystemSettings(req.organizationId);
      return res.status(200).json({
        success: true,
        ...result
      });
    } catch (err) {
      return res.status(500).json({
        error: "system_settings_fetch_failed",
        message: err?.message || "Failed to load organisation system settings."
      });
    }
  }
);
app.put(
  "/api/system-settings",
  requireAuthRole("admin", "super_admin", "creator"),
  requireActiveLicense,
  async (req, res) => {
    const parsed = SystemSettingsPatchSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        error: "validation_error",
        message: parsed.error.issues[0]?.message || "Invalid system settings payload.",
        details: parsed.error.flatten()
      });
    }
    try {
      const { customGroupCategories: rawCustomCategories, ...restPatch } = parsed.data;
      const sanitizedPatch = {
        ...restPatch,
        ...rawCustomCategories !== void 0 ? { customGroupCategories: sanitizeCustomGroupCategories(rawCustomCategories) } : {}
      };
      const result = await platformStore.saveSystemSettings(req.organizationId, sanitizedPatch, {
        id: req.user?.id,
        email: req.user?.email,
        role: req.user?.role,
        name: req.user?.name,
        ipAddress: getClientIpKey(req)
      });
      return res.status(200).json({
        success: true,
        ...result
      });
    } catch (err) {
      if (err?.code === "SITE_LIMIT_REACHED") {
        return res.status(403).json({
          error: "license_limit_exceeded",
          code: "SITE_LIMIT_REACHED",
          message: err.message
        });
      }
      return res.status(500).json({
        error: "system_settings_save_failed",
        message: err?.message || "Failed to save organisation system settings."
      });
    }
  }
);
app.patch(
  "/api/system-settings",
  requireAuthRole("admin", "super_admin", "creator"),
  requireActiveLicense,
  async (req, res) => {
    const parsed = SystemSettingsPatchSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        error: "validation_error",
        message: parsed.error.issues[0]?.message || "Invalid system settings payload.",
        details: parsed.error.flatten()
      });
    }
    try {
      const { customGroupCategories: rawCustomCategories, ...restPatch } = parsed.data;
      const sanitizedPatch = {
        ...restPatch,
        ...rawCustomCategories !== void 0 ? { customGroupCategories: sanitizeCustomGroupCategories(rawCustomCategories) } : {}
      };
      const result = await platformStore.saveSystemSettings(req.organizationId, sanitizedPatch, {
        id: req.user?.id,
        email: req.user?.email,
        role: req.user?.role,
        name: req.user?.name,
        ipAddress: getClientIpKey(req)
      });
      return res.status(200).json({
        success: true,
        ...result
      });
    } catch (err) {
      if (err?.code === "SITE_LIMIT_REACHED") {
        return res.status(403).json({
          error: "license_limit_exceeded",
          code: "SITE_LIMIT_REACHED",
          message: err.message
        });
      }
      return res.status(500).json({
        error: "system_settings_save_failed",
        message: err?.message || "Failed to save organisation system settings."
      });
    }
  }
);
app.post(
  "/api/system-settings/reset",
  requireAuthRole("admin", "super_admin", "creator"),
  requireActiveLicense,
  async (req, res) => {
    try {
      const result = await platformStore.resetSystemSettings(req.organizationId, {
        id: req.user?.id,
        email: req.user?.email,
        role: req.user?.role,
        name: req.user?.name,
        ipAddress: getClientIpKey(req)
      });
      return res.status(200).json({
        success: true,
        ...result
      });
    } catch (err) {
      return res.status(500).json({
        error: "system_settings_reset_failed",
        message: err?.message || "Failed to reset organisation system settings."
      });
    }
  }
);
var TenantGatewayKeysPatchSchema = import_zod2.z.object({
  arkeselApiKey: import_zod2.z.string().trim().max(300).optional(),
  clearArkeselApiKey: import_zod2.z.boolean().optional(),
  paystackPublicKey: import_zod2.z.string().trim().max(300).refine(
    (val) => !val || /^pk_(live|test)_[a-zA-Z0-9]+$/.test(val) || val.length >= 8,
    "Paystack Public Key should start with pk_live_ or pk_test_."
  ).optional(),
  paystackSecretKey: import_zod2.z.string().trim().max(300).refine(
    (val) => !val || /^sk_(live|test)_[a-zA-Z0-9]+$/.test(val) || val.length >= 8,
    "Paystack Secret Key should start with sk_live_ or sk_test_."
  ).optional(),
  clearPaystackKeys: import_zod2.z.boolean().optional()
});
app.get(
  "/api/system-settings/gateways",
  requireAuthRole("admin", "finance", "super_admin", "creator"),
  requireActiveLicense,
  async (req, res) => {
    try {
      const summary = await platformStore.getTenantGatewayConfigSummary(req.organizationId);
      return res.status(200).json({
        success: true,
        gateways: summary
      });
    } catch (err) {
      return res.status(err?.status || 500).json({
        error: err?.code || "gateways_fetch_failed",
        message: err?.message || "Failed to load tenant gateway configuration."
      });
    }
  }
);
app.put(
  "/api/system-settings/gateways",
  requireAuthRole("admin", "super_admin", "creator"),
  requireActiveLicense,
  async (req, res) => {
    const parsed = TenantGatewayKeysPatchSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        error: "validation_error",
        message: parsed.error.issues[0]?.message || "Invalid gateway API key payload."
      });
    }
    try {
      const summary = await platformStore.saveTenantGatewayKeys(req.organizationId, parsed.data, {
        id: req.user?.id,
        email: req.user?.email,
        role: req.user?.role,
        name: req.user?.name,
        ipAddress: getClientIpKey(req)
      });
      return res.status(200).json({
        success: true,
        gateways: summary,
        message: "Encrypted tenant gateway credentials saved successfully."
      });
    } catch (err) {
      return res.status(err?.status || 500).json({
        error: err?.code || "gateways_save_failed",
        message: err?.message || "Failed to save tenant gateway credentials."
      });
    }
  }
);
app.post(
  "/api/system-settings/test-paystack",
  requireAuthRole("admin", "finance", "super_admin", "creator"),
  requireActiveLicense,
  async (req, res) => {
    try {
      const resolved = await platformStore.getResolvedPaystackKeys(req.organizationId);
      const result = await testPaystackConnection({
        secretKey: resolved.secretKey,
        publicKey: resolved.publicKey
      });
      await platformStore.appendAuditLog({
        organizationId: req.organizationId,
        actorId: req.user?.id || null,
        actorEmail: req.user?.email || "admin@ekklesphere.church",
        actorRole: req.user?.role || "admin",
        action: result.ok ? "paystack.connection_verified" : "paystack.connection_failed",
        targetType: "payment_gateway",
        targetId: req.organizationId,
        metadata: {
          mode: result.mode,
          source: resolved.source,
          ok: result.ok
        },
        ipAddress: getClientIpKey(req)
      });
      if (!result.ok) {
        return res.status(result.configured ? 502 : 400).json({
          success: false,
          configured: result.configured,
          mode: result.mode,
          source: resolved.source,
          error: result.error || "paystack_test_failed",
          message: result.message
        });
      }
      return res.status(200).json({
        success: true,
        configured: true,
        mode: result.mode,
        source: resolved.source,
        message: result.message
      });
    } catch (err) {
      return res.status(err?.status || 500).json({
        success: false,
        error: err?.code || "paystack_test_error",
        message: err?.message || "Could not verify Paystack connection."
      });
    }
  }
);
app.post(
  "/api/system-settings/test-sms",
  requireAuthRole("admin", "pastor", "super_admin", "creator"),
  requireActiveLicense,
  async (req, res) => {
    const parsed = TestSmsGatewaySchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        error: "validation_error",
        message: parsed.error.issues[0]?.message || "Valid SMS gateway provider and Sender ID are required."
      });
    }
    const senderId = parsed.data.senderId.toUpperCase();
    const dispatchedAt = (/* @__PURE__ */ new Date()).toISOString();
    const resolvedArkesel = await platformStore.getResolvedArkeselApiKey(req.organizationId);
    const arkeselConfigured = Boolean(resolvedArkesel.apiKey);
    const recipientPhone = parsed.data.recipientPhone?.trim();
    const isArkesel = parsed.data.provider.toLowerCase().includes("arkesel");
    let liveResult = null;
    if (recipientPhone && isArkesel) {
      const settingsRes = await platformStore.getSystemSettings(req.organizationId).catch(() => null);
      const churchLabel = settingsRes?.settings?.churchName || "Ekklesphere Church";
      liveResult = await sendArkeselSms({
        apiKey: resolvedArkesel.apiKey,
        senderId,
        recipients: [recipientPhone],
        message: parsed.data.message || `Test SMS from ${churchLabel} via Arkesel (${senderId}) confirmed at ${dispatchedAt.slice(11, 16)} UTC.`
      });
      if (!liveResult.ok) {
        return res.status(liveResult.configured ? 502 : 400).json({
          success: false,
          configured: liveResult.configured,
          error: liveResult.error || "sms_dispatch_failed",
          provider: parsed.data.provider,
          senderId,
          message: liveResult.message
        });
      }
    }
    await platformStore.appendAuditLog({
      organizationId: req.organizationId,
      actorId: req.user?.id || null,
      actorEmail: req.user?.email || "admin@ekklesphere.church",
      actorRole: req.user?.role || "admin",
      action: liveResult?.ok ? "sms.test_sent_live" : "sms.test_dispatched",
      targetType: "sms_gateway",
      targetId: req.organizationId,
      metadata: {
        provider: parsed.data.provider,
        senderId,
        arkeselConfigured,
        arkeselSource: resolvedArkesel.source,
        recipientCount: liveResult ? liveResult.sentCount : 0,
        dispatchedAt
      },
      ipAddress: getClientIpKey(req)
    });
    return res.status(200).json({
      success: true,
      mode: liveResult?.ok ? "live" : "validated",
      configured: arkeselConfigured,
      source: resolvedArkesel.source,
      provider: parsed.data.provider,
      senderId,
      dispatchedAt,
      message: liveResult?.ok ? liveResult.message : `Test SMS payload validated via ${parsed.data.provider} (Sender ID: ${senderId}).${isArkesel && !arkeselConfigured ? " Save your church Arkesel API key in SMS & Paystack Gateways to transmit live SMS." : ""}`
    });
  }
);
app.post(
  "/api/system-settings/test-email",
  requireAuthRole("admin", "pastor", "super_admin", "creator"),
  requireActiveLicense,
  async (req, res) => {
    const parsed = TestEmailGatewaySchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        error: "validation_error",
        message: parsed.error.issues[0]?.message || "Valid test email recipient is required."
      });
    }
    const settingsRes = await platformStore.getSystemSettings(req.organizationId).catch(() => null);
    const churchName = settingsRes?.settings?.churchName || "Ekklesphere Church";
    const fromEmail = parsed.data.fromEmail || settingsRes?.settings?.emailFromAddress || void 0;
    const fromName = parsed.data.fromName || settingsRes?.settings?.emailSenderName || churchName;
    const subject = parsed.data.subject || `${churchName} \u2014 Resend Email Gateway Verification`;
    const text = parsed.data.message || `Hello,

This is a live test message from ${churchName} verifying that the Resend Email API gateway is active and ready for congregational communications.

Blessings,
${churchName}`;
    const result = await sendResendEmail({
      fromEmail,
      fromName,
      organizationName: churchName,
      to: [parsed.data.recipientEmail],
      subject,
      text
    });
    if (!result.ok) {
      return res.status(result.configured ? 502 : 400).json({
        success: false,
        configured: result.configured,
        error: result.error || "email_dispatch_failed",
        provider: result.provider,
        message: result.message
      });
    }
    await platformStore.appendAuditLog({
      organizationId: req.organizationId,
      actorId: req.user?.id || null,
      actorEmail: req.user?.email || "admin@ekklesphere.church",
      actorRole: req.user?.role || "admin",
      action: "email.test_sent_live",
      targetType: "email_gateway",
      targetId: req.organizationId,
      metadata: {
        provider: "Resend Email",
        from: result.from,
        recipient: parsed.data.recipientEmail,
        emailIds: result.emailIds
      },
      ipAddress: getClientIpKey(req)
    });
    return res.status(200).json({
      success: true,
      configured: true,
      provider: "Resend Email",
      from: result.from,
      emailIds: result.emailIds,
      message: result.message
    });
  }
);
app.get(
  "/api/communications/status",
  requireAuthRole("admin", "pastor", "usher", "member", "group_leader", "finance", "super_admin", "creator"),
  requireActiveLicense,
  async (req, res) => {
    const baseStatus = getCommunicationGatewayStatus();
    const tenantSummary = await platformStore.getTenantGatewayConfigSummary(req.organizationId);
    const isAdminOrFinance = ["admin", "finance", "super_admin", "creator"].includes(req.user.role);
    return res.status(200).json({
      success: true,
      ...baseStatus,
      arkeselConfigured: tenantSummary.arkeselConfigured,
      arkeselSource: tenantSummary.arkeselSource,
      arkeselKeyMasked: isAdminOrFinance ? tenantSummary.arkeselKeyMasked : null,
      paystackConfigured: tenantSummary.paystackConfigured,
      paystackSource: tenantSummary.paystackSource,
      paystackPublicKey: tenantSummary.paystackPublicKey,
      paystackSecretMasked: isAdminOrFinance ? tenantSummary.paystackSecretMasked : null,
      paystackMode: tenantSummary.paystackMode
    });
  }
);
app.post(
  "/api/communications/broadcast",
  requireAuthRole("admin", "pastor", "super_admin", "creator"),
  requireActiveLicense,
  async (req, res) => {
    const parsed = BroadcastDispatchSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        error: "validation_error",
        message: parsed.error.issues[0]?.message || "Valid broadcast channel, audience, subject, and body are required."
      });
    }
    try {
      const orgId = req.organizationId;
      const [orgMembers, settingsRes, resolvedArkesel] = await Promise.all([
        platformStore.getMembers(orgId),
        platformStore.getSystemSettings(orgId),
        platformStore.getResolvedArkeselApiKey(orgId)
      ]);
      const settings = settingsRes.settings;
      const threshold = Math.max(1, Number(settings.absenteeThresholdServices) || 2);
      const audience = parsed.data.audience.trim();
      const audienceLower = audience.toLowerCase();
      const targetMembers = orgMembers.filter((m) => {
        if (audienceLower === "all") return true;
        if (audienceLower === "absent") return Number(m.consecutiveAbsences || 0) >= threshold;
        if (audienceLower === "visitors") return m.status === "visitor";
        if (audienceLower === "officers") return isPastoralOfficerOrLeader(m);
        const candidates = [m.groupName, m.homeCellGroup, m.department].map((v) => String(v || "").trim().toLowerCase()).filter(Boolean);
        return candidates.some(
          (c) => c === audienceLower || audienceLower.length >= 4 && c.includes(audienceLower) || c.length >= 4 && audienceLower.includes(c)
        );
      });
      const { channel, subject, body } = parsed.data;
      if (channel === "sms") {
        const phones = targetMembers.map((m) => String(m.phoneE164 || m.phoneNumber || "").trim()).filter(Boolean);
        const smsText = subject && !body.startsWith(subject) ? `${subject}: ${body}` : body;
        const smsResult = await sendArkeselSms({
          apiKey: resolvedArkesel.apiKey,
          senderId: settings.smsSenderId || "EKKLESPHERE",
          recipients: phones,
          message: smsText
        });
        if (!smsResult.ok) {
          return res.status(smsResult.configured ? 502 : 400).json({
            success: false,
            configured: smsResult.configured,
            channel: "sms",
            provider: smsResult.provider,
            matchedMembersCount: targetMembers.length,
            message: smsResult.message
          });
        }
        await platformStore.appendAuditLog({
          organizationId: orgId,
          actorId: req.user?.id || null,
          actorEmail: req.user?.email || "admin@ekklesphere.church",
          actorRole: req.user?.role || "admin",
          action: "communication.broadcast_sms",
          targetType: "communications",
          targetId: orgId,
          metadata: {
            provider: "Arkesel SMS",
            senderId: smsResult.senderId,
            keySource: resolvedArkesel.source,
            audience,
            sentCount: smsResult.sentCount,
            invalidCount: smsResult.invalidCount
          },
          ipAddress: getClientIpKey(req)
        });
        return res.status(200).json({
          success: true,
          channel: "sms",
          provider: "Arkesel SMS",
          sentCount: smsResult.sentCount,
          matchedMembersCount: targetMembers.length,
          message: smsResult.message
        });
      }
      if (channel === "email") {
        const emails = targetMembers.map((m) => String(m.email || "").trim().toLowerCase()).filter(Boolean);
        const emailResult = await sendResendEmail({
          fromEmail: settings.emailFromAddress || void 0,
          fromName: settings.emailSenderName || settings.churchName || void 0,
          organizationName: settings.churchName || "Ekklesphere Church",
          to: emails,
          subject,
          text: body
        });
        if (!emailResult.ok) {
          return res.status(emailResult.configured ? 502 : 400).json({
            success: false,
            configured: emailResult.configured,
            channel: "email",
            provider: emailResult.provider,
            matchedMembersCount: targetMembers.length,
            message: emailResult.message
          });
        }
        await platformStore.appendAuditLog({
          organizationId: orgId,
          actorId: req.user?.id || null,
          actorEmail: req.user?.email || "admin@ekklesphere.church",
          actorRole: req.user?.role || "admin",
          action: "communication.broadcast_email",
          targetType: "communications",
          targetId: orgId,
          metadata: {
            provider: "Resend Email",
            from: emailResult.from,
            audience,
            sentCount: emailResult.sentCount,
            failedCount: emailResult.failedCount
          },
          ipAddress: getClientIpKey(req)
        });
        return res.status(200).json({
          success: true,
          channel: "email",
          provider: "Resend Email",
          sentCount: emailResult.sentCount,
          matchedMembersCount: targetMembers.length,
          message: emailResult.message
        });
      }
      if (!settings.enablePushNotifications) {
        return res.status(400).json({
          success: false,
          channel: "push",
          message: "Push broadcasts are paused in System Settings \u2192 Gateways."
        });
      }
      await platformStore.appendAuditLog({
        organizationId: orgId,
        actorId: req.user?.id || null,
        actorEmail: req.user?.email || "admin@ekklesphere.church",
        actorRole: req.user?.role || "admin",
        action: "communication.broadcast_push",
        targetType: "communications",
        targetId: orgId,
        metadata: {
          audience,
          subject,
          matchedMembersCount: targetMembers.length
        },
        ipAddress: getClientIpKey(req)
      });
      return res.status(200).json({
        success: true,
        channel: "push",
        provider: "Web & Mobile Push",
        sentCount: targetMembers.length,
        matchedMembersCount: targetMembers.length,
        message: `Push broadcast queued for ${targetMembers.length} recipient${targetMembers.length === 1 ? "" : "s"} (${audience}).`
      });
    } catch (err) {
      return res.status(500).json({
        error: "broadcast_dispatch_failed",
        message: err?.message || "Failed to dispatch broadcast message."
      });
    }
  }
);
app.get(
  "/api/system-settings/audit-logs",
  requireAuthRole("admin", "pastor", "super_admin", "creator"),
  requireActiveLicense,
  async (req, res) => {
    try {
      const rows = await platformStore.listAuditLogs({
        organizationId: req.organizationId,
        limit: 150
      });
      const auditLogs = rows.map((row) => ({
        id: row.id,
        actor: row.actorEmail,
        actorRole: row.actorRole,
        action: row.action,
        entityType: row.targetType,
        targetId: row.targetId,
        timestamp: row.createdAt,
        details: row.reason || (row.metadata && Object.keys(row.metadata).length > 0 ? JSON.stringify(row.metadata) : `${row.action} (${row.targetType})`),
        metadata: row.metadata || {}
      }));
      return res.status(200).json({
        success: true,
        auditLogs
      });
    } catch (err) {
      return res.status(500).json({
        error: "audit_logs_fetch_failed",
        message: err?.message || "Failed to load audit logs."
      });
    }
  }
);
app.get(
  "/api/church-groups",
  requireAuthRole("admin", "pastor", "usher", "member", "group_leader", "finance", "super_admin", "creator"),
  requireActiveLicense,
  async (req, res) => {
    try {
      const groups = await platformStore.listChurchGroups(req.organizationId);
      return res.status(200).json({
        success: true,
        groups
      });
    } catch (err) {
      return res.status(500).json({
        error: "church_groups_fetch_failed",
        message: err?.message || "Failed to load church groups."
      });
    }
  }
);
app.get(
  "/api/church-groups/leadership-history",
  requireAuthRole("admin", "pastor", "usher", "member", "group_leader", "finance", "super_admin", "creator"),
  requireActiveLicense,
  async (req, res) => {
    try {
      const rawCategory = typeof req.query.category === "string" ? req.query.category.trim() : "all";
      const category = rawCategory === "all" || !rawCategory ? "all" : normalizeIncomingGroupCategory(rawCategory) || "all";
      const rawRole = typeof req.query.role === "string" ? req.query.role.trim() : "all";
      const role = rawRole === "primary_leader" || rawRole === "assistant_leader" ? rawRole : "all";
      const groupId = typeof req.query.groupId === "string" ? req.query.groupId.trim() : void 0;
      const parsedLimit = Number.parseInt(String(req.query.limit || "200"), 10);
      const limit = Number.isFinite(parsedLimit) ? parsedLimit : 200;
      const history = await platformStore.listChurchGroupLeadershipHistory(req.organizationId, {
        category,
        groupId,
        role,
        limit
      });
      return res.status(200).json({
        success: true,
        history
      });
    } catch (err) {
      return res.status(500).json({
        error: "leadership_history_fetch_failed",
        message: err?.message || "Failed to load leadership change history."
      });
    }
  }
);
app.post(
  "/api/church-groups",
  requireAuthRole("admin", "pastor", "super_admin", "creator"),
  requireActiveLicense,
  async (req, res) => {
    const parsed = ChurchGroupCreateSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        error: "validation_error",
        message: parsed.error.issues[0]?.message || "Valid group fields are required."
      });
    }
    try {
      const primaryLeader = await platformStore.resolveOrganizationLeaderMember(
        req.organizationId,
        {
          memberId: parsed.data.leaderMemberId,
          leaderName: parsed.data.leaderName,
          fieldLabel: "leader"
        }
      );
      let resolvedAssistant = null;
      const assistantNameRaw = (parsed.data.assistantLeader || "").trim();
      const assistantIdRaw = (parsed.data.assistantLeaderMemberId || "").trim();
      if (assistantNameRaw || assistantIdRaw) {
        resolvedAssistant = await platformStore.resolveOrganizationLeaderMember(
          req.organizationId,
          {
            memberId: assistantIdRaw || void 0,
            leaderName: assistantNameRaw || void 0,
            fieldLabel: "assistantLeader"
          }
        );
        if (resolvedAssistant.id === primaryLeader.id) {
          return res.status(400).json({
            error: "invalid_leader_member",
            field: "assistantLeader",
            message: "Assistant / Co-Leader must be a different member from the Primary Leader."
          });
        }
      }
      const group = await platformStore.createChurchGroup(
        req.organizationId,
        {
          name: parsed.data.name,
          category: parsed.data.category,
          leaderName: primaryLeader.fullName,
          leaderMemberId: primaryLeader.id,
          leaderPhone: parsed.data.leaderPhone?.trim() || primaryLeader.phoneE164 || void 0,
          leaderEmail: parsed.data.leaderEmail?.trim() || primaryLeader.email || void 0,
          assistantLeader: resolvedAssistant ? resolvedAssistant.fullName : void 0,
          assistantLeaderMemberId: resolvedAssistant ? resolvedAssistant.id : void 0,
          meetingDay: parsed.data.meetingDay?.trim() || void 0,
          meetingTime: parsed.data.meetingTime?.trim() || void 0,
          meetingLocation: parsed.data.meetingLocation?.trim() || void 0,
          targetDemographic: parsed.data.targetDemographic?.trim() || void 0,
          description: parsed.data.description ?? "",
          active: parsed.data.active ?? true
        },
        {
          id: req.user?.id,
          email: req.user?.email,
          role: req.user?.role,
          name: req.user?.name,
          ipAddress: getClientIpKey(req)
        }
      );
      return res.status(201).json({
        success: true,
        group
      });
    } catch (err) {
      const status = typeof err?.status === "number" ? err.status : 500;
      const code = err?.code === "INVALID_LEADER_MEMBER" || err?.code === "AMBIGUOUS_LEADER_MEMBER" ? "invalid_leader_member" : "church_group_create_failed";
      return res.status(status).json({
        error: code,
        field: err?.field,
        message: err?.message || "Failed to create church group."
      });
    }
  }
);
async function handleUpdateChurchGroupRequest(req, res) {
  const parsed = ChurchGroupUpdateSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({
      error: "validation_error",
      message: parsed.error.issues[0]?.message || "Valid group update fields are required."
    });
  }
  try {
    const existingList = await platformStore.listChurchGroups(req.organizationId);
    const existingGroup = existingList.find((g) => g.id === req.params.id);
    const patch = {};
    if (parsed.data.name !== void 0) patch.name = parsed.data.name;
    if (parsed.data.category !== void 0) patch.category = parsed.data.category;
    if (parsed.data.leaderPhone !== void 0) patch.leaderPhone = parsed.data.leaderPhone ?? "";
    if (parsed.data.leaderEmail !== void 0) patch.leaderEmail = parsed.data.leaderEmail ?? "";
    if (parsed.data.meetingDay !== void 0) patch.meetingDay = parsed.data.meetingDay ?? "";
    if (parsed.data.meetingTime !== void 0) patch.meetingTime = parsed.data.meetingTime ?? "";
    if (parsed.data.meetingLocation !== void 0) {
      patch.meetingLocation = parsed.data.meetingLocation ?? "";
    }
    if (parsed.data.targetDemographic !== void 0) {
      patch.targetDemographic = parsed.data.targetDemographic ?? "";
    }
    if (parsed.data.description !== void 0) patch.description = parsed.data.description;
    if (parsed.data.active !== void 0) patch.active = parsed.data.active;
    if (parsed.data.leadershipChangeReason !== void 0) {
      patch.leadershipChangeReason = parsed.data.leadershipChangeReason ?? null;
    }
    let resolvedPrimaryId = existingGroup?.leaderMemberId;
    if (parsed.data.leaderName !== void 0 || parsed.data.leaderMemberId !== void 0) {
      const primaryLeader = await platformStore.resolveOrganizationLeaderMember(
        req.organizationId,
        {
          memberId: parsed.data.leaderMemberId ?? void 0,
          leaderName: parsed.data.leaderName ?? void 0,
          fieldLabel: "leader"
        }
      );
      patch.leaderName = primaryLeader.fullName;
      patch.leaderMemberId = primaryLeader.id;
      resolvedPrimaryId = primaryLeader.id;
      if (parsed.data.leaderPhone === void 0 && !existingGroup?.leaderPhone && primaryLeader.phoneE164) {
        patch.leaderPhone = primaryLeader.phoneE164;
      }
      if (parsed.data.leaderEmail === void 0 && !existingGroup?.leaderEmail && primaryLeader.email) {
        patch.leaderEmail = primaryLeader.email;
      }
    }
    if (parsed.data.assistantLeader !== void 0 || parsed.data.assistantLeaderMemberId !== void 0) {
      const assistantNameRaw = (parsed.data.assistantLeader || "").trim();
      const assistantIdRaw = (parsed.data.assistantLeaderMemberId || "").trim();
      if (!assistantNameRaw && !assistantIdRaw) {
        patch.assistantLeader = "";
        patch.assistantLeaderMemberId = null;
      } else {
        const resolvedAssistant = await platformStore.resolveOrganizationLeaderMember(
          req.organizationId,
          {
            memberId: assistantIdRaw || void 0,
            leaderName: assistantNameRaw || void 0,
            fieldLabel: "assistantLeader"
          }
        );
        if (resolvedPrimaryId && resolvedAssistant.id === resolvedPrimaryId) {
          return res.status(400).json({
            error: "invalid_leader_member",
            field: "assistantLeader",
            message: "Assistant / Co-Leader must be a different member from the Primary Leader."
          });
        }
        patch.assistantLeader = resolvedAssistant.fullName;
        patch.assistantLeaderMemberId = resolvedAssistant.id;
      }
    }
    const group = await platformStore.updateChurchGroup(
      req.organizationId,
      req.params.id,
      patch,
      {
        id: req.user?.id,
        email: req.user?.email,
        role: req.user?.role,
        name: req.user?.name,
        ipAddress: getClientIpKey(req)
      }
    );
    return res.status(200).json({
      success: true,
      group
    });
  } catch (err) {
    const status = typeof err?.status === "number" ? err.status : 500;
    const errorCode = status === 404 ? "not_found" : err?.code === "INVALID_LEADER_MEMBER" || err?.code === "AMBIGUOUS_LEADER_MEMBER" ? "invalid_leader_member" : "church_group_update_failed";
    return res.status(status).json({
      error: errorCode,
      field: err?.field,
      message: err?.message || "Failed to update church group."
    });
  }
}
app.put(
  "/api/church-groups/:id",
  requireAuthRole("admin", "pastor", "super_admin", "creator"),
  requireActiveLicense,
  handleUpdateChurchGroupRequest
);
app.patch(
  "/api/church-groups/:id",
  requireAuthRole("admin", "pastor", "super_admin", "creator"),
  requireActiveLicense,
  handleUpdateChurchGroupRequest
);
app.delete(
  "/api/church-groups/:id",
  requireAuthRole("admin", "pastor", "super_admin", "creator"),
  requireActiveLicense,
  async (req, res) => {
    try {
      await platformStore.deleteChurchGroup(req.organizationId, req.params.id, {
        id: req.user?.id,
        email: req.user?.email,
        role: req.user?.role,
        name: req.user?.name,
        ipAddress: getClientIpKey(req)
      });
      return res.status(200).json({
        success: true
      });
    } catch (err) {
      const status = typeof err?.status === "number" ? err.status : 500;
      return res.status(status).json({
        error: status === 404 ? "not_found" : "church_group_delete_failed",
        message: err?.message || "Failed to delete church group."
      });
    }
  }
);
function isValidLatLng(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 && !(lat === 0 && lng === 0);
}
function isAllowedMapHost(hostname) {
  const h = hostname.toLowerCase();
  return h === "maps.app.goo.gl" || h === "goo.gl" || h === "g.co" || h === "google.com" || h.endsWith(".google.com") || /^www\.google\.[a-z.]+$/.test(h) || /^maps\.google\.[a-z.]+$/.test(h) || h === "maps.apple.com";
}
function parseDmsPair(text) {
  const dmsRegex = /(\d{1,2})\s*[°]\s*(\d{1,2})\s*['′]\s*(\d{1,2}(?:\.\d+)?)\s*(?:["″]|'')?\s*([NSns])[\s,+;/]+(\d{1,3})\s*[°]\s*(\d{1,2})\s*['′]\s*(\d{1,2}(?:\.\d+)?)\s*(?:["″]|'')?\s*([EWew])/;
  const m = text.match(dmsRegex);
  if (!m) return null;
  let lat = Number(m[1]) + Number(m[2]) / 60 + Number(m[3]) / 3600;
  if (m[4].toUpperCase() === "S") lat = -lat;
  let lng = Number(m[5]) + Number(m[6]) / 60 + Number(m[7]) / 3600;
  if (m[8].toUpperCase() === "W") lng = -lng;
  return isValidLatLng(lat, lng) ? { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) } : null;
}
function extractPlaceNameFromUrl(urlStr) {
  try {
    const placeMatch = urlStr.match(/\/maps\/place\/([^/@?]+)/i);
    if (!placeMatch) return null;
    const decoded = decodeURIComponent(placeMatch[1].replace(/\+/g, " ")).trim();
    if (!decoded || /^[-?\d.\s°'"NSWE,]+$/i.test(decoded)) return null;
    return decoded.slice(0, 140);
  } catch {
    return null;
  }
}
function extractCoordsFromString(input) {
  let decoded = input;
  try {
    decoded = decodeURIComponent(input.replace(/\+/g, " "));
  } catch {
    decoded = input;
  }
  const placeName = extractPlaceNameFromUrl(input);
  const pinMatches = Array.from(decoded.matchAll(/!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/g));
  if (pinMatches.length > 0) {
    const last = pinMatches[pinMatches.length - 1];
    const lat = Number(last[1]);
    const lng = Number(last[2]);
    if (isValidLatLng(lat, lng)) {
      return { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)), placeName };
    }
  }
  try {
    const urlMatch = input.match(/https?:\/\/[^\s"'<>]+/i);
    if (urlMatch) {
      const u = new URL(urlMatch[0]);
      const paramKeys = ["q", "query", "ll", "sll", "center", "destination", "daddr", "viewpoint"];
      for (const key of paramKeys) {
        const val = u.searchParams.get(key);
        if (!val) continue;
        const cleanVal = val.replace(/^loc:/i, "").trim();
        const dmsInParam = parseDmsPair(cleanVal);
        if (dmsInParam) return { ...dmsInParam, placeName };
        const pairMatch = cleanVal.match(/(-?\d{1,2}\.\d+)\s*[,\s]\s*\+?(-?\d{1,3}\.\d+)/);
        if (pairMatch) {
          const lat = Number(pairMatch[1]);
          const lng = Number(pairMatch[2]);
          if (isValidLatLng(lat, lng)) {
            return { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)), placeName };
          }
        }
      }
    }
  } catch {
  }
  const pathCoordMatch = decoded.match(
    /\/maps\/(?:search|place|dir\/[^/]*)\/\s*(-?\d{1,2}\.\d+)\s*,\s*\+?(-?\d{1,3}\.\d+)/i
  );
  if (pathCoordMatch) {
    const lat = Number(pathCoordMatch[1]);
    const lng = Number(pathCoordMatch[2]);
    if (isValidLatLng(lat, lng)) {
      return { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)), placeName };
    }
  }
  const dms = parseDmsPair(decoded);
  if (dms) {
    return { ...dms, placeName };
  }
  const atMatch = decoded.match(/@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/);
  if (atMatch) {
    const lat = Number(atMatch[1]);
    const lng = Number(atMatch[2]);
    if (isValidLatLng(lat, lng)) {
      return { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)), placeName };
    }
  }
  const rawPairMatch = decoded.trim().match(/^\(?\s*(-?\d{1,2}\.\d+)\s*[,/\s]\s*\+?(-?\d{1,3}\.\d+)\s*\)?$/);
  if (rawPairMatch) {
    const lat = Number(rawPairMatch[1]);
    const lng = Number(rawPairMatch[2]);
    if (isValidLatLng(lat, lng)) {
      return { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)), placeName: null };
    }
  }
  return null;
}
app.post(
  ["/campus-premise/resolve-link", "/api/campus-premise/resolve-link"],
  requireAuthRole("admin", "pastor", "super_admin", "creator"),
  requireActiveLicense,
  async (req, res) => {
    const rawInput = typeof req.body?.input === "string" ? req.body.input.trim() : "";
    if (!rawInput || rawInput.length > 2e3) {
      return res.status(400).json({
        error: "invalid_input",
        message: "Paste a shared Google Maps link or GPS coordinate pair."
      });
    }
    const direct = extractCoordsFromString(rawInput);
    if (direct) {
      return res.status(200).json({
        success: true,
        lat: direct.lat,
        lng: direct.lng,
        placeName: direct.placeName || null,
        resolvedUrl: rawInput
      });
    }
    const urlMatch = rawInput.match(/https?:\/\/[^\s"'<>]+/i);
    if (!urlMatch) {
      return res.status(422).json({
        error: "coordinates_not_found",
        message: "Could not find GPS coordinates or a valid Google Maps link in the pasted text."
      });
    }
    let currentUrl = urlMatch[0];
    try {
      const initialParsed = new URL(currentUrl);
      if (!isAllowedMapHost(initialParsed.hostname)) {
        return res.status(400).json({
          error: "unsupported_domain",
          message: "Only Google Maps and Apple Maps shared links are supported."
        });
      }
    } catch {
      return res.status(400).json({
        error: "invalid_url",
        message: "The pasted link is not a valid URL."
      });
    }
    try {
      for (let hop = 0; hop < 6; hop++) {
        const parsedHop = new URL(currentUrl);
        if (!isAllowedMapHost(parsedHop.hostname)) break;
        if (parsedHop.hostname.includes("consent.google.")) {
          const continueUrl = parsedHop.searchParams.get("continue");
          if (continueUrl) {
            currentUrl = continueUrl;
            const fromConsent = extractCoordsFromString(currentUrl);
            if (fromConsent) {
              return res.status(200).json({
                success: true,
                lat: fromConsent.lat,
                lng: fromConsent.lng,
                placeName: fromConsent.placeName || null,
                resolvedUrl: currentUrl
              });
            }
            continue;
          }
        }
        const response = await fetch(currentUrl, {
          method: "GET",
          redirect: "manual",
          signal: AbortSignal.timeout(8e3),
          headers: {
            "User-Agent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
            "Accept-Language": "en-US,en;q=0.9"
          }
        });
        const locationHeader = response.headers.get("location");
        if (locationHeader && response.status >= 300 && response.status < 400) {
          currentUrl = new URL(locationHeader, currentUrl).toString();
          const fromRedirect = extractCoordsFromString(currentUrl);
          if (fromRedirect) {
            return res.status(200).json({
              success: true,
              lat: fromRedirect.lat,
              lng: fromRedirect.lng,
              placeName: fromRedirect.placeName || null,
              resolvedUrl: currentUrl
            });
          }
          continue;
        }
        const fromFinalUrl = extractCoordsFromString(currentUrl);
        if (fromFinalUrl) {
          return res.status(200).json({
            success: true,
            lat: fromFinalUrl.lat,
            lng: fromFinalUrl.lng,
            placeName: fromFinalUrl.placeName || null,
            resolvedUrl: currentUrl
          });
        }
        break;
      }
      return res.status(422).json({
        error: "coordinates_not_found",
        message: "Could not extract exact coordinates from that link. Please copy coordinate numbers directly."
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error";
      return res.status(502).json({
        error: "link_resolution_failed",
        message: `Failed to expand shared link: ${msg}`
      });
    }
  }
);
app.get(
  ["/live-checkins", "/api/live-checkins"],
  requireAuthRole("usher", "admin", "pastor", "member", "group_leader", "super_admin", "creator"),
  requireActiveLicense,
  async (req, res) => {
    try {
      const checkins = await platformStore.getLiveCheckins(req.organizationId);
      if (req.user?.role === "member") {
        const own = checkins.filter(
          (c) => c.personId === req.user?.id || c.personId === req.user?.email || req.user?.name && c.personName === req.user.name
        );
        return res.status(200).json(own);
      }
      return res.status(200).json(checkins);
    } catch (err) {
      return res.status(err?.status || 500).json({
        error: err?.code || "live_checkins_fetch_failed",
        message: err?.message || "Failed to load live attendance check-ins from database."
      });
    }
  }
);
app.post(
  ["/live-checkins", "/api/live-checkins"],
  requireAuthRole("usher", "admin", "pastor", "member", "group_leader", "super_admin", "creator"),
  requireActiveLicense,
  async (req, res) => {
    const body = req.body || {};
    if (!body.personId || typeof body.personId !== "string") {
      return res.status(400).json({ error: "invalid_checkin", message: "personId is required" });
    }
    if (req.user?.role === "member" || req.user?.role === "group_leader") {
      const ownProfile = await platformStore.getMemberProfileForSession(req.organizationId, req.user.id, req.user.email).catch(() => null);
      const allowedSelfIds = [
        req.user.id,
        req.user.email,
        req.user.name,
        ownProfile?.id ? String(ownProfile.id) : null
      ].filter(Boolean);
      if (!allowedSelfIds.includes(body.personId)) {
        return res.status(403).json({
          error: "forbidden",
          message: "Members are only permitted to check in for their own profile."
        });
      }
    }
    try {
      const nowIso = (/* @__PURE__ */ new Date()).toISOString();
      const targetServiceInstanceId = typeof body.serviceInstanceId === "string" ? body.serviceInstanceId.trim() : "";
      if (!targetServiceInstanceId || targetServiceInstanceId === "svc-live-main" || targetServiceInstanceId === "svc-sun-1") {
        return res.status(400).json({
          error: "NO_SERVICE_SCHEDULED",
          code: "NO_SERVICE_SCHEDULED",
          message: "No service is scheduled. Please schedule a service before checking in members."
        });
      }
      const result = await platformStore.recordLiveCheckin(req.organizationId, {
        id: body.id || `rec-${body.personId}-${Date.now()}`,
        personId: body.personId,
        personName: body.personName,
        serviceInstanceId: targetServiceInstanceId,
        campusId: req.campus_id || PRIMARY_CAMPUS_SITE_ID,
        method: body.method || "manual",
        confidence: typeof body.confidence === "number" ? body.confidence : 95,
        checkedInAt: body.checkedInAt || (/* @__PURE__ */ new Date()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        checkedInIso: body.checkedInIso || nowIso,
        late: Boolean(body.late),
        recordedBy: body.recordedBy || req.user?.name || req.user?.role,
        note: body.note,
        distanceM: body.distanceM ?? null,
        lat: body.lat ?? null,
        lng: body.lng ?? null
      });
      return res.status(200).json({
        success: true,
        record: result.record,
        liveCheckins: result.liveCheckins
      });
    } catch (err) {
      return res.status(err?.status || 500).json({
        error: err?.code || "live_checkin_failed",
        code: err?.code || "live_checkin_failed",
        message: err?.message || "Failed to save attendance check-in to database."
      });
    }
  }
);
app.delete(
  ["/live-checkins/:personId", "/api/live-checkins/:personId"],
  requireAuthRole("usher", "admin", "pastor", "super_admin", "creator"),
  requireActiveLicense,
  async (req, res) => {
    const { personId } = req.params;
    const serviceId = typeof req.query.serviceId === "string" && req.query.serviceId.trim() ? req.query.serviceId.trim() : null;
    try {
      const liveCheckins = await platformStore.deleteLiveCheckin(req.organizationId, personId, serviceId);
      return res.status(200).json({ success: true, liveCheckins });
    } catch (err) {
      return res.status(err?.status || 500).json({
        error: err?.code || "live_checkin_delete_failed",
        message: err?.message || "Failed to remove attendance check-in from database."
      });
    }
  }
);
async function handleAttendanceEvent(req, res) {
  const parsed = EventSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten() });
  }
  const orgId = req.organizationId;
  const e = parsed.data;
  const userId = e.personId || req.user.id;
  const reasons = [];
  let status = "accepted";
  let distance = null;
  const downgrade = (reason) => {
    reasons.push(reason);
    if (status === "accepted") status = "flagged";
  };
  if (e.isMock) {
    status = "rejected";
    reasons.push("mock_location");
  }
  const [sites, premiseData] = await Promise.all([
    platformStore.getSitesForOrg(orgId),
    platformStore.getPremiseSettings(orgId)
  ]);
  const site = sites.find((s) => s.id === e.siteId) || sites[0] || null;
  const siteRadius = site?.radius_m || premiseData.premiseSettings?.innerGeofenceMeters || 50;
  if (site && e.lat != null && e.lng != null) {
    distance = computeDistanceMeters(e.lat, e.lng, site.lat, site.lng);
    if (distance <= siteRadius) {
      if (status !== "rejected") status = "accepted";
    } else if (distance <= siteRadius + 25) {
      downgrade(`perimeter_margin_${distance}m`);
    } else {
      status = "rejected";
      reasons.push(`outside_fence_${distance}m`);
    }
  }
  if (e.accuracyM != null && e.accuracyM > MAX_ACCURACY_M) {
    downgrade(`low_accuracy_${Math.round(e.accuracyM)}m`);
  }
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const row = {
    id: `evt-${Date.now()}`,
    organization_id: orgId,
    client_event_id: e.clientEventId,
    user_id: userId,
    person_id: e.personId,
    person_name: e.personName,
    service_instance_id: e.serviceInstanceId,
    site_id: site?.id || e.siteId,
    type: e.type,
    source: e.source,
    platform: e.platform,
    lat: e.lat,
    lng: e.lng,
    accuracy_m: e.accuracyM,
    distance_m: distance,
    is_mock: e.isMock,
    device_time: e.deviceTime,
    server_time: now,
    status,
    flag_reasons: reasons
  };
  await platformStore.recordRawGeofenceEvent(orgId, row);
  const isApproved = status !== "rejected" && !reasons.some((r) => r.startsWith("outside_") || r.includes("mock")) && (distance === null || distance <= siteRadius + 25);
  let checkinRecorded = false;
  let checkinBlockedReason = null;
  let checkinBlockedMessage = null;
  if (isApproved && e.personId) {
    const targetServiceInstanceId = typeof e.serviceInstanceId === "string" ? e.serviceInstanceId.trim() : "";
    if (!targetServiceInstanceId || targetServiceInstanceId === "svc-live-main" || targetServiceInstanceId === "svc-sun-1") {
      checkinBlockedReason = "NO_SERVICE_SCHEDULED";
      checkinBlockedMessage = "No service is scheduled. Please schedule a service before checking in members.";
    } else {
      try {
        await platformStore.recordLiveCheckin(orgId, {
          id: `rec-${e.personId}-${Date.now()}`,
          personId: e.personId,
          personName: e.personName,
          serviceInstanceId: targetServiceInstanceId,
          campusId: site?.id || PRIMARY_CAMPUS_SITE_ID,
          method: e.source === "geofence" ? "geofence" : "manual",
          confidence: typeof e.accuracyM === "number" ? Math.max(70, Math.min(99, Math.round(100 - e.accuracyM / 3))) : 95,
          checkedInAt: (/* @__PURE__ */ new Date()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          checkedInIso: now,
          late: false,
          recordedBy: "GPS Geofence Radar",
          note: `Verified Live GPS (${distance ?? 0}m from center, \xB1${Math.round(e.accuracyM ?? 0)}m)`,
          distanceM: distance,
          lat: e.lat,
          lng: e.lng
        });
        checkinRecorded = true;
      } catch (err) {
        if (err?.code === "NO_SERVICE_SCHEDULED" || err?.code === "SERVICE_NOT_OPEN") {
          checkinBlockedReason = err.code;
          checkinBlockedMessage = err.message;
        } else {
          throw err;
        }
      }
    }
  }
  return res.status(200).json({
    ...row,
    site_radius_m: siteRadius,
    site_name: site?.name || premiseData.premiseSettings?.campusName || null,
    checkin_recorded: checkinRecorded,
    checkin_blocked_reason: checkinBlockedReason,
    checkin_blocked_message: checkinBlockedMessage
  });
}
app.post(
  ["/attendance/events", "/api/attendance/events"],
  attendanceLimiter,
  requireAuthRole("admin", "pastor", "usher", "member", "group_leader", "super_admin", "creator"),
  requireActiveLicense,
  handleAttendanceEvent
);
app.get(
  ["/attendance/raw-events", "/api/attendance/raw-events"],
  requireAuthRole("admin", "pastor", "usher", "super_admin", "creator"),
  requireActiveLicense,
  async (req, res) => {
    const events = await platformStore.getRawGeofenceEvents(req.organizationId);
    return res.status(200).json(events);
  }
);
app.get(
  ["/attendance/shifts", "/api/attendance/shifts"],
  requireAuthRole("admin", "pastor", "usher", "super_admin", "creator"),
  requireActiveLicense,
  async (req, res) => {
    const events = await platformStore.getRawGeofenceEvents(req.organizationId);
    const shifts = [];
    const eventsByUser = /* @__PURE__ */ new Map();
    for (const ev of events) {
      const list = eventsByUser.get(ev.user_id) || [];
      list.push(ev);
      eventsByUser.set(ev.user_id, list);
    }
    for (const [userId, userEvents] of eventsByUser.entries()) {
      const chronological = [...userEvents].sort(
        (a, b) => new Date(a.server_time).getTime() - new Date(b.server_time).getTime()
      );
      let openIn = null;
      for (const ev of chronological) {
        if (ev.type === "enter" || ev.type === "manual_in") {
          if (openIn) {
            shifts.unshift({
              user_id: userId,
              site_id: openIn.site_id,
              in_event_id: openIn.id,
              clock_in: openIn.server_time,
              out_event_id: null,
              clock_out: null,
              duration_minutes: null,
              needs_review: openIn.status === "flagged",
              is_open: true
            });
          }
          openIn = ev;
        } else if ((ev.type === "exit" || ev.type === "manual_out") && openIn) {
          const inMs = new Date(openIn.server_time).getTime();
          const outMs = new Date(ev.server_time).getTime();
          const durMin = Math.max(0, Math.round((outMs - inMs) / 6e4));
          shifts.unshift({
            user_id: userId,
            site_id: openIn.site_id,
            in_event_id: openIn.id,
            clock_in: openIn.server_time,
            out_event_id: ev.id,
            clock_out: ev.server_time,
            duration_minutes: durMin,
            needs_review: openIn.status === "flagged" || ev.status === "flagged",
            is_open: false
          });
          openIn = null;
        }
      }
      if (openIn) {
        shifts.unshift({
          user_id: userId,
          site_id: openIn.site_id,
          in_event_id: openIn.id,
          clock_in: openIn.server_time,
          out_event_id: null,
          clock_out: null,
          duration_minutes: null,
          needs_review: openIn.status === "flagged",
          is_open: true
        });
      }
    }
    return res.status(200).json(shifts);
  }
);
app.post(
  ["/attendance/auto-close", "/api/attendance/auto-close"],
  requireAuthRole("admin", "pastor", "usher", "super_admin", "creator"),
  requireActiveLicense,
  async (req, res) => {
    const orgId = req.organizationId;
    const maxHours = Number(req.body?.maxHours) || 12;
    const now = Date.now();
    let closedCount = 0;
    const [liveCheckins, rawEvents] = await Promise.all([
      platformStore.getLiveCheckins(orgId),
      platformStore.getRawGeofenceEvents(orgId)
    ]);
    for (const checkin of liveCheckins) {
      const matchingEvents = rawEvents.filter((e) => e.user_id === checkin.personId);
      const lastEvent = matchingEvents[0];
      if (lastEvent && (lastEvent.type === "enter" || lastEvent.type === "manual_in")) {
        const elapsedHours = (now - new Date(lastEvent.server_time).getTime()) / 36e5;
        if (elapsedHours >= maxHours || req.body?.force) {
          const exitEvt = {
            id: `evt-autoclose-${Date.now()}-${closedCount}`,
            organization_id: orgId,
            client_event_id: `auto-close-${checkin.personId}-${Date.now()}`,
            user_id: checkin.personId,
            person_id: checkin.personId,
            person_name: checkin.personName,
            site_id: checkin.campusId || PRIMARY_CAMPUS_SITE_ID,
            type: "exit",
            source: "system_auto_close",
            platform: "web",
            lat: checkin.lat ?? null,
            lng: checkin.lng ?? null,
            accuracy_m: null,
            distance_m: checkin.distanceM ?? null,
            is_mock: false,
            device_time: (/* @__PURE__ */ new Date()).toISOString(),
            server_time: (/* @__PURE__ */ new Date()).toISOString(),
            status: "accepted",
            flag_reasons: ["auto_closed_timeout"]
          };
          await platformStore.recordRawGeofenceEvent(orgId, exitEvt);
          closedCount++;
        }
      }
    }
    return res.status(200).json({ success: true, closedShifts: closedCount });
  }
);
app.get(
  ["/attendance/sites", "/api/attendance/sites"],
  requireAuthRole("admin", "pastor", "usher", "member", "group_leader", "super_admin", "creator"),
  requireActiveLicense,
  async (req, res) => {
    const sites = await platformStore.getSitesForOrg(req.organizationId);
    return res.status(200).json(sites);
  }
);
app.get(
  ["/attendance/insights", "/api/attendance/insights"],
  requireAuthRole("admin", "pastor", "usher", "group_leader", "super_admin", "creator"),
  requireActiveLicense,
  async (req, res) => {
    const orgId = req.organizationId;
    const serviceId = typeof req.query.serviceId === "string" && req.query.serviceId.trim() ? req.query.serviceId.trim() : null;
    const [scopedCheckins, rawEvents] = await Promise.all([
      platformStore.getLiveCheckins(orgId, serviceId),
      platformStore.getRawGeofenceEvents(orgId)
    ]);
    const methodBreakdown = {
      geofence: 0,
      beacon: 0,
      usher: 0,
      posted_qr: 0,
      manual: 0,
      email_link: 0
    };
    let onTimeCount = 0;
    let lateCount = 0;
    let confidenceSum = 0;
    const gpsDistances = [];
    for (const rec of scopedCheckins) {
      methodBreakdown[rec.method] = (methodBreakdown[rec.method] || 0) + 1;
      if (rec.late) lateCount++;
      else onTimeCount++;
      confidenceSum += typeof rec.confidence === "number" ? rec.confidence : 95;
      if (typeof rec.distanceM === "number" && Number.isFinite(rec.distanceM)) {
        gpsDistances.push(rec.distanceM);
      }
    }
    const totalCheckedIn = scopedCheckins.length;
    const avgConfidence = totalCheckedIn > 0 ? Math.round(confidenceSum / totalCheckedIn) : 0;
    const avgDistanceM = gpsDistances.length > 0 ? Math.round(gpsDistances.reduce((a, b) => a + b, 0) / gpsDistances.length * 10) / 10 : null;
    return res.status(200).json({
      serviceId,
      totalCheckedIn,
      onTimeCount,
      lateCount,
      avgConfidence,
      avgDistanceM,
      methodBreakdown,
      telemetrySummary: computeTelemetrySummaryFromEvents(rawEvents, true),
      liveCheckins: scopedCheckins,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
  }
);
function formatLocalDateIsoServer(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
function buildShortWeekLabel(start, end) {
  const sDay = start.getDate();
  const eDay = end.getDate();
  const sMonth = start.toLocaleDateString("en-GB", { month: "short" });
  const eMonth = end.toLocaleDateString("en-GB", { month: "short" });
  if (sDay === eDay && sMonth === eMonth) return `${sDay} ${sMonth}`;
  if (sMonth === eMonth) return `${sDay}\u2013${eDay} ${sMonth}`;
  return `${sDay} ${sMonth}\u2013${eDay} ${eMonth}`;
}
function buildFullWeekRangeLabel(start, end) {
  const sFmt = start.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const eFmt = end.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  if (formatLocalDateIsoServer(start) === formatLocalDateIsoServer(end)) {
    return end.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }
  return `${sFmt} \u2013 ${eFmt}`;
}
app.get(
  ["/attendance/weekly-trend", "/api/attendance/weekly-trend"],
  requireAuthRole("admin", "pastor", "usher", "group_leader", "super_admin", "creator"),
  requireActiveLicense,
  async (req, res) => {
    const orgId = req.organizationId;
    const now = /* @__PURE__ */ new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const windowStart = new Date(today);
    windowStart.setDate(today.getDate() - 29);
    const startDateIso = formatLocalDateIsoServer(windowStart);
    const endDateIso = formatLocalDateIsoServer(today);
    const [eventsList, checkinsList, activeMemberBaseline] = await Promise.all([
      platformStore.getEvents(orgId),
      platformStore.getLiveCheckins(orgId),
      platformStore.getMemberCountForOrg(orgId)
    ]);
    const eventDateMap = /* @__PURE__ */ new Map();
    for (const ev of eventsList) {
      if (ev && typeof ev.id === "string") {
        const normalized = normalizeEventRow(ev);
        if (normalized.date) {
          eventDateMap.set(ev.id, normalized.date);
        }
      }
    }
    const mergedByKey = /* @__PURE__ */ new Map();
    for (const rec of checkinsList) {
      const key = `${rec.serviceInstanceId || "svc"}::${rec.personId}`;
      mergedByKey.set(key, rec);
    }
    const buckets = [];
    const cursor = new Date(windowStart);
    while (cursor.getTime() <= today.getTime()) {
      const bStart = new Date(cursor);
      const dow = bStart.getDay();
      const daysUntilSunday = dow === 0 ? 0 : 7 - dow;
      const candidateEnd = new Date(bStart);
      candidateEnd.setDate(bStart.getDate() + daysUntilSunday);
      const bEnd = candidateEnd.getTime() > today.getTime() ? new Date(today) : candidateEnd;
      const sIso = formatLocalDateIsoServer(bStart);
      const eIso = formatLocalDateIsoServer(bEnd);
      const serviceIds = /* @__PURE__ */ new Set();
      for (const [evId, evDate] of eventDateMap.entries()) {
        if (evDate >= sIso && evDate <= eIso) {
          serviceIds.add(evId);
        }
      }
      buckets.push({
        weekKey: `${sIso}_${eIso}`,
        startDate: sIso,
        endDate: eIso,
        shortLabel: buildShortWeekLabel(bStart, bEnd),
        fullRangeLabel: buildFullWeekRangeLabel(bStart, bEnd),
        isCurrentWeek: eIso === endDateIso,
        records: [],
        serviceIds
      });
      cursor.setTime(bEnd.getTime());
      cursor.setDate(cursor.getDate() + 1);
    }
    const windowHistoricalRecords = [];
    const uniquePeople30d = /* @__PURE__ */ new Set();
    for (const rec of mergedByKey.values()) {
      let resolvedDateIso = eventDateMap.get(rec.serviceInstanceId) || "";
      if (!resolvedDateIso && rec.checkedInIso) {
        const parsed = new Date(rec.checkedInIso);
        if (!Number.isNaN(parsed.getTime())) {
          resolvedDateIso = formatLocalDateIsoServer(parsed);
        }
      }
      if (!resolvedDateIso) {
        resolvedDateIso = endDateIso;
      }
      if (resolvedDateIso < startDateIso || resolvedDateIso > endDateIso) {
        continue;
      }
      windowHistoricalRecords.push(rec);
      uniquePeople30d.add(rec.personId);
      const targetBucket = buckets.find(
        (b) => resolvedDateIso >= b.startDate && resolvedDateIso <= b.endDate
      );
      if (targetBucket) {
        targetBucket.records.push(rec);
        if (rec.serviceInstanceId) {
          targetBucket.serviceIds.add(rec.serviceInstanceId);
        }
      }
    }
    let peakWeekLabel = null;
    let peakWeekCount = 0;
    const weeks = buckets.map((b) => {
      const totalCheckins = b.records.length;
      const uniqueSet = new Set(b.records.map((r) => r.personId));
      const uniqueAttendees = uniqueSet.size;
      const lateCount = b.records.filter((r) => r.late).length;
      const onTimeCount = Math.max(0, totalCheckins - lateCount);
      const autoProximityCount = b.records.filter(
        (r) => r.method === "geofence" || r.method === "beacon"
      ).length;
      const assistedDoorCount = Math.max(0, totalCheckins - autoProximityCount);
      const engagementRatePct = activeMemberBaseline > 0 ? Math.min(100, Math.round(uniqueAttendees / activeMemberBaseline * 100)) : 0;
      if (totalCheckins > peakWeekCount) {
        peakWeekCount = totalCheckins;
        peakWeekLabel = b.shortLabel;
      }
      return {
        weekKey: b.weekKey,
        startDate: b.startDate,
        endDate: b.endDate,
        shortLabel: b.shortLabel,
        fullRangeLabel: b.fullRangeLabel,
        isCurrentWeek: b.isCurrentWeek,
        totalCheckins,
        uniqueAttendees,
        onTimeCount,
        lateCount,
        autoProximityCount,
        assistedDoorCount,
        servicesCount: b.serviceIds.size,
        engagementRatePct
      };
    });
    const totalCheckins30d = windowHistoricalRecords.length;
    const averageWeeklyAttendance = weeks.length > 0 ? Math.round(totalCheckins30d / weeks.length * 10) / 10 : 0;
    return res.status(200).json({
      windowDays: 30,
      startDate: startDateIso,
      endDate: endDateIso,
      totalCheckins30d,
      uniqueAttendees30d: uniquePeople30d.size,
      averageWeeklyAttendance,
      peakWeekLabel,
      peakWeekCount,
      weeks,
      historicalRecords: windowHistoricalRecords,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
  }
);
function parseExpectedAttendanceFromDescription(desc) {
  if (typeof desc !== "string") return 0;
  const match = desc.match(/Expected attendance:\s*(\d+)/i);
  return match ? Number(match[1]) || 0 : 0;
}
function normalizeEventRow(row) {
  const startRaw = row.start_time || row.starts_at || null;
  const endRaw = row.end_time || row.ends_at || null;
  let dateStr = typeof row.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(row.date) ? row.date : "";
  if (!dateStr && typeof startRaw === "string" && startRaw.includes("T")) {
    dateStr = startRaw.split("T")[0];
  }
  if (!dateStr) {
    dateStr = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  }
  const expected = typeof row.expected_attendance === "number" ? row.expected_attendance : parseExpectedAttendanceFromDescription(row.description);
  const allowanceMinutes = Math.max(
    0,
    Number(row.dwell_min ?? row.dwellMinutes ?? row.allowance_minutes ?? 0) || 0
  );
  return {
    ...row,
    date: dateStr,
    start_time: startRaw,
    end_time: endRaw,
    starts_at: startRaw,
    ends_at: endRaw,
    dwell_min: allowanceMinutes,
    allowance_minutes: allowanceMinutes,
    expected_attendance: expected
  };
}
function buildIsoTimestamp(dateStr, timeOrIso) {
  if (timeOrIso.includes("T")) {
    const parsed = new Date(timeOrIso);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  const timeMatch = timeOrIso.match(/^(\d{1,2}):(\d{2})/);
  const hh = timeMatch ? String(Math.min(23, Math.max(0, Number(timeMatch[1])))).padStart(2, "0") : "08";
  const mm = timeMatch ? String(Math.min(59, Math.max(0, Number(timeMatch[2])))).padStart(2, "0") : "00";
  const candidate = /* @__PURE__ */ new Date(`${dateStr}T${hh}:${mm}:00.000Z`);
  return Number.isNaN(candidate.getTime()) ? /* @__PURE__ */ new Date() : candidate;
}
app.get(
  ["/api/v1/events", "/api/events"],
  requireAuthRole("admin", "pastor", "usher", "member", "group_leader", "finance", "super_admin", "creator"),
  requireActiveLicense,
  async (req, res) => {
    const stored = await platformStore.getEvents(req.organizationId);
    return res.json(stored.map(normalizeEventRow));
  }
);
app.post(
  ["/api/v1/events", "/api/events"],
  requireAuthRole("admin", "pastor", "super_admin", "creator"),
  requireActiveLicense,
  async (req, res) => {
    const name = typeof req.body?.name === "string" && req.body.name.trim() ? req.body.name.trim() : "Worship Service";
    const todayIso = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
    const rawDate = typeof req.body?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.body.date.trim()) ? req.body.date.trim() : todayIso;
    const rawStartsAt = typeof req.body?.startsAt === "string" && req.body.startsAt.trim() ? req.body.startsAt.trim() : "08:00";
    const rawEndsAt = typeof req.body?.endsAt === "string" && req.body.endsAt.trim() ? req.body.endsAt.trim() : "10:30";
    const rawAllowance = req.body?.allowanceMinutes ?? req.body?.dwellMinutes ?? req.body?.dwellMin;
    const dwellMin = Number.isFinite(Number(rawAllowance)) ? Math.max(0, Math.round(Number(rawAllowance))) : 5;
    const expectedAttendance = Number.isFinite(Number(req.body?.expectedAttendance)) ? Math.max(0, Number(req.body.expectedAttendance)) : 0;
    let startDateObj;
    if (typeof req.body?.startTimeIso === "string" && !Number.isNaN(new Date(req.body.startTimeIso).getTime())) {
      startDateObj = new Date(req.body.startTimeIso);
    } else {
      startDateObj = buildIsoTimestamp(rawDate, rawStartsAt);
    }
    let endDateObj;
    if (typeof req.body?.endTimeIso === "string" && !Number.isNaN(new Date(req.body.endTimeIso).getTime())) {
      endDateObj = new Date(req.body.endTimeIso);
    } else if (req.body?.endsAt) {
      endDateObj = buildIsoTimestamp(rawDate, rawEndsAt);
    } else {
      endDateObj = new Date(startDateObj.getTime() + 90 * 60 * 1e3);
    }
    if (endDateObj.getTime() <= startDateObj.getTime()) {
      endDateObj = new Date(endDateObj.getTime() + 24 * 60 * 60 * 1e3);
    }
    const reqStatus = typeof req.body?.status === "string" ? req.body.status.trim().toLowerCase() : "";
    const dbStatus = reqStatus === "closed" || reqStatus === "cancelled" || reqStatus === "completed" ? "closed" : "active";
    try {
      const created = await platformStore.createEvent(req.organizationId, {
        name,
        date: rawDate,
        startTimeIso: startDateObj.toISOString(),
        endTimeIso: endDateObj.toISOString(),
        dwellMin,
        status: dbStatus,
        expectedAttendance
      });
      return res.status(201).json(normalizeEventRow(created));
    } catch (err) {
      return res.status(500).json({
        error: "database_error",
        message: err?.message || "Failed to save scheduled service."
      });
    }
  }
);
var handleUpdateEvent = async (req, res) => {
  const body = req.body || {};
  const updates = {};
  if (typeof body.name === "string" && body.name.trim()) {
    updates.name = body.name.trim();
  }
  const cleanDate = typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date.trim()) ? body.date.trim() : void 0;
  if (cleanDate) updates.date = cleanDate;
  const fallbackDate = cleanDate || (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  if (typeof body.startTimeIso === "string" && !Number.isNaN(new Date(body.startTimeIso).getTime())) {
    updates.startTimeIso = new Date(body.startTimeIso).toISOString();
  } else if (typeof body.startsAt === "string" && body.startsAt.trim()) {
    updates.startTimeIso = buildIsoTimestamp(fallbackDate, body.startsAt.trim()).toISOString();
  }
  if (typeof body.endTimeIso === "string" && !Number.isNaN(new Date(body.endTimeIso).getTime())) {
    updates.endTimeIso = new Date(body.endTimeIso).toISOString();
  } else if (typeof body.endsAt === "string" && body.endsAt.trim()) {
    const endObj = buildIsoTimestamp(fallbackDate, body.endsAt.trim());
    if (updates.startTimeIso && endObj.getTime() <= Date.parse(updates.startTimeIso)) {
      endObj.setTime(endObj.getTime() + 24 * 60 * 60 * 1e3);
    }
    updates.endTimeIso = endObj.toISOString();
  }
  const rawAllowance = body.allowanceMinutes ?? body.dwellMinutes ?? body.dwellMin;
  if (rawAllowance !== void 0 && Number.isFinite(Number(rawAllowance))) {
    updates.dwellMin = Math.max(0, Math.round(Number(rawAllowance)));
  }
  if (body.expectedAttendance !== void 0 && Number.isFinite(Number(body.expectedAttendance))) {
    updates.expectedAttendance = Math.max(0, Math.round(Number(body.expectedAttendance)));
  }
  if (typeof body.status === "string" && body.status.trim()) {
    const st = body.status.trim().toLowerCase();
    updates.status = st === "closed" || st === "completed" || st === "cancelled" ? "closed" : "active";
  }
  try {
    const updated = await platformStore.updateEvent(req.organizationId, req.params.id, updates);
    let absenceSweep = null;
    if (updates.status === "closed") {
      try {
        absenceSweep = await platformStore.processServiceAbsenceSweep(req.organizationId, {
          eventId: req.params.id,
          triggerSource: "service_closed",
          actorName: req.user?.name
        });
      } catch (sweepErr) {
        console.warn("[Ekklesphere Pastoral Care] Service close absence sweep warning:", sweepErr?.message || sweepErr);
      }
    }
    return res.status(200).json({
      ...normalizeEventRow(updated),
      ...absenceSweep ? { absenceSweep } : {}
    });
  } catch (err) {
    return res.status(err?.status || 500).json({
      error: err?.code || "event_update_failed",
      message: err?.message || "Failed to update scheduled service."
    });
  }
};
app.patch(
  ["/api/v1/events/:id", "/api/events/:id"],
  requireAuthRole("admin", "pastor", "super_admin", "creator"),
  requireActiveLicense,
  handleUpdateEvent
);
app.put(
  ["/api/v1/events/:id", "/api/events/:id"],
  requireAuthRole("admin", "pastor", "super_admin", "creator"),
  requireActiveLicense,
  handleUpdateEvent
);
app.delete(
  ["/api/v1/events/:id", "/api/events/:id"],
  requireAuthRole("admin", "pastor", "super_admin", "creator"),
  requireActiveLicense,
  async (req, res) => {
    try {
      await platformStore.deleteEvent(req.organizationId, req.params.id);
      return res.status(200).json({ success: true });
    } catch (err) {
      return res.status(err?.status || 500).json({
        error: err?.code || "event_delete_failed",
        message: err?.message || "Failed to delete scheduled service."
      });
    }
  }
);
app.get(
  ["/api/v1/events/:id/qr", "/api/events/:id/qr", "/api/services/:id/qr"],
  requireAuthRole("admin", "pastor", "usher", "finance", "super_admin", "creator"),
  requireActiveLicense,
  async (req, res) => {
    try {
      const orgId = req.organizationId;
      const serviceId = String(req.params.id || "").trim();
      const events = await platformStore.getEvents(orgId);
      const rawEvent = events.find((ev) => String(ev.id) === serviceId);
      if (!rawEvent) {
        return res.status(404).json({
          error: "service_not_found",
          code: "SERVICE_NOT_FOUND",
          message: "Scheduled service not found for your organisation."
        });
      }
      const normalized = normalizeEventRow(rawEvent);
      const allowanceMinutes = Number(normalized.allowance_minutes ?? normalized.dwell_min ?? 0) || 0;
      const windowResult = resolveServiceWindow({
        date: normalized.date,
        startTimeIso: normalized.start_time,
        endTimeIso: normalized.end_time,
        allowanceMinutes,
        rawStatus: normalized.status || "active",
        nowMs: Date.now()
      });
      const qrToken = createServiceQrToken(orgId, serviceId);
      const checkInPath = buildServiceQrCheckInPath({
        serviceId,
        qrToken,
        organizationId: orgId
      });
      const host = req.get("host");
      const protocol = req.headers["x-forwarded-proto"] ? String(req.headers["x-forwarded-proto"]).split(",")[0].trim() : req.protocol || "https";
      const checkInUrl = host ? `${protocol}://${host}${checkInPath}` : checkInPath;
      return res.status(200).json({
        serviceId,
        serviceName: String(normalized.name || "Worship Service"),
        date: normalized.date,
        startTimeIso: normalized.start_time,
        endTimeIso: normalized.end_time,
        allowanceMinutes,
        status: windowResult.status,
        closesAtIso: windowResult.closesAtIso,
        organizationId: orgId,
        shortCode: formatServiceShortCode(serviceId),
        qrToken,
        qrPayload: `EKKLESPHERE:SERVICE:${serviceId}:${qrToken}:${orgId}`,
        checkInPath,
        checkInUrl
      });
    } catch (err) {
      return res.status(err?.status || 500).json({
        error: err?.code || "service_qr_failed",
        message: err?.message || "Failed to generate service check-in QR code."
      });
    }
  }
);
app.post(
  ["/api/v1/events/:id/qr-checkin", "/api/events/:id/qr-checkin", "/api/services/:id/qr-checkin"],
  requireAuthRole("member", "group_leader", "usher", "admin", "pastor", "finance", "super_admin", "creator"),
  requireActiveLicense,
  async (req, res) => {
    try {
      const orgId = req.organizationId;
      const serviceId = String(req.params.id || "").trim();
      const body = req.body || {};
      const qrTokenRaw = typeof body.qrToken === "string" ? body.qrToken : typeof body.token === "string" ? body.token : typeof req.query.token === "string" ? req.query.token : "";
      const qrToken = qrTokenRaw.trim();
      if (!serviceId) {
        return res.status(400).json({
          error: "INVALID_SERVICE",
          code: "INVALID_SERVICE",
          message: "Scheduled service ID is required."
        });
      }
      const events = await platformStore.getEvents(orgId);
      const rawEvent = events.find((ev) => String(ev.id) === serviceId);
      if (!rawEvent) {
        return res.status(404).json({
          error: "service_not_found",
          code: "SERVICE_NOT_FOUND",
          message: "Scheduled service not found for your organisation."
        });
      }
      const isStaff = ["admin", "pastor", "usher", "super_admin", "creator"].includes(
        req.user?.role || ""
      );
      if (!qrToken) {
        if (!isStaff) {
          return res.status(400).json({
            error: "QR_TOKEN_REQUIRED",
            code: "QR_TOKEN_REQUIRED",
            message: "A valid service QR code token is required to check in."
          });
        }
      } else if (!verifyServiceQrToken(orgId, serviceId, qrToken)) {
        return res.status(403).json({
          error: "INVALID_QR_TOKEN",
          code: "INVALID_QR_TOKEN",
          message: "Invalid or expired service QR code for this organisation."
        });
      }
      const normalized = normalizeEventRow(rawEvent);
      const allowanceMinutes = Number(normalized.allowance_minutes ?? normalized.dwell_min ?? 0) || 0;
      const nowMs = Date.now();
      const windowResult = resolveServiceWindow({
        date: normalized.date,
        startTimeIso: normalized.start_time,
        endTimeIso: normalized.end_time,
        allowanceMinutes,
        rawStatus: normalized.status || "active",
        nowMs
      });
      if (windowResult.status !== "live") {
        return res.status(400).json({
          error: "SERVICE_NOT_OPEN",
          code: "SERVICE_NOT_OPEN",
          message: `Check-in is closed for "${normalized.name}". Reopen or schedule a live service within its active window first.`
        });
      }
      const requestedMemberId = isStaff && typeof body.memberId === "string" && body.memberId.trim() ? body.memberId.trim() : "";
      let targetPersonId = requestedMemberId;
      let targetPersonName = req.user?.name || "Member";
      if (requestedMemberId) {
        const orgMembers = await platformStore.getMembers(orgId);
        const foundMember = orgMembers.find((m) => String(m.id) === requestedMemberId);
        if (!foundMember) {
          return res.status(404).json({
            error: "MEMBER_NOT_FOUND",
            code: "MEMBER_NOT_FOUND",
            message: "Target member profile was not found in your organisation."
          });
        }
        targetPersonId = String(foundMember.id);
        targetPersonName = `${foundMember.firstName || ""} ${foundMember.lastName || ""}`.trim() || targetPersonName;
      } else {
        const selfProfile = await platformStore.getMemberProfileForSession(orgId, req.user.id, req.user.email).catch(() => null);
        if (selfProfile?.id) {
          targetPersonId = String(selfProfile.id);
          targetPersonName = `${selfProfile.firstName || ""} ${selfProfile.lastName || ""}`.trim() || targetPersonName;
        } else {
          targetPersonId = req.user.id;
        }
      }
      const existingCheckins = await platformStore.getLiveCheckins(orgId, serviceId);
      const alreadyChecked = existingCheckins.find(
        (c) => c.personId === targetPersonId && c.serviceInstanceId === serviceId
      );
      if (alreadyChecked) {
        return res.status(200).json({
          success: true,
          alreadyCheckedIn: true,
          service: {
            id: serviceId,
            name: String(normalized.name || "Worship Service"),
            date: normalized.date,
            startsAt: normalized.start_time,
            endsAt: normalized.end_time
          },
          record: alreadyChecked,
          liveCheckins: existingCheckins
        });
      }
      const graceDeadlineMs = windowResult.startMs !== null ? windowResult.startMs + Math.max(1, allowanceMinutes || 15) * 6e4 : null;
      const isLate = graceDeadlineMs !== null ? nowMs > graceDeadlineMs : false;
      const nowIso = new Date(nowMs).toISOString();
      const result = await platformStore.recordLiveCheckin(orgId, {
        id: `qr-${targetPersonId}-${nowMs}`,
        personId: targetPersonId,
        personName: targetPersonName,
        serviceInstanceId: serviceId,
        campusId: req.campus_id || PRIMARY_CAMPUS_SITE_ID,
        method: "posted_qr",
        confidence: 99,
        checkedInAt: new Date(nowMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        checkedInIso: nowIso,
        late: isLate,
        recordedBy: req.user?.name || targetPersonName,
        note: `Checked in via Service QR (${normalized.name})`,
        distanceM: null,
        lat: null,
        lng: null
      });
      return res.status(200).json({
        success: true,
        alreadyCheckedIn: false,
        service: {
          id: serviceId,
          name: String(normalized.name || "Worship Service"),
          date: normalized.date,
          startsAt: normalized.start_time,
          endsAt: normalized.end_time
        },
        record: result.record,
        liveCheckins: result.liveCheckins
      });
    } catch (err) {
      return res.status(err?.status || 500).json({
        error: err?.code || "service_qr_checkin_failed",
        code: err?.code || "service_qr_checkin_failed",
        message: err?.message || "Could not process service QR check-in."
      });
    }
  }
);
app.get(
  [
    "/api/v1/services/history",
    "/api/services/history",
    "/api/attendance/service-history",
    "/attendance/service-history"
  ],
  requireAuthRole("admin", "pastor", "usher", "group_leader", "finance", "super_admin", "creator"),
  requireActiveLicense,
  async (req, res) => {
    try {
      const history = await platformStore.getServiceHistory(req.organizationId);
      return res.status(200).json({
        ...history,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      });
    } catch (err) {
      return res.status(err?.status || 500).json({
        error: "service_history_failed",
        message: err?.message || "Could not load service history."
      });
    }
  }
);
app.get(
  ["/api/v1/members", "/api/members"],
  requireAuthRole("admin", "pastor", "usher", "group_leader", "super_admin", "creator"),
  requireActiveLicense,
  async (req, res) => {
    const members = await platformStore.getMembers(req.organizationId);
    return res.status(200).json(members);
  }
);
app.post(
  ["/api/v1/members", "/api/members"],
  requireAuthRole("admin", "pastor", "usher", "super_admin", "creator"),
  requireActiveLicense,
  async (req, res) => {
    const body = req.body || {};
    const firstName = String(body.firstName ?? body.first_name ?? "").trim();
    const lastName = String(body.lastName ?? body.last_name ?? "").trim();
    if (!firstName || !lastName) {
      return res.status(400).json({
        error: "validation_error",
        message: "firstName and lastName are required"
      });
    }
    try {
      const created = await platformStore.createMember(req.organizationId, body);
      return res.status(201).json(created);
    } catch (err) {
      if (err?.code === "SEAT_LIMIT_REACHED") {
        return res.status(403).json({
          error: "license_limit_exceeded",
          code: "SEAT_LIMIT_REACHED",
          message: err.message,
          details: err.details
        });
      }
      return res.status(err?.status || 500).json({
        error: err?.code || "member_create_failed",
        message: err?.message || "Could not register member."
      });
    }
  }
);
var normalizeImportDuplicateMode = (raw) => {
  if (raw === void 0 || raw === null || raw === "") return "skip";
  const mode = String(raw).trim().toLowerCase();
  if (mode === "skip" || mode === "update" || mode === "error") {
    return mode;
  }
  return null;
};
app.post(
  "/api/members/import/validate",
  requireAuthRole("admin", "pastor", "super_admin", "creator"),
  requireActiveLicense,
  async (req, res) => {
    const incoming = Array.isArray(req.body?.members) ? req.body.members : [];
    if (incoming.length === 0) {
      return res.status(400).json({ error: "validation_error", message: "members array is required" });
    }
    const duplicateMode = normalizeImportDuplicateMode(req.body?.duplicateMode);
    if (!duplicateMode) {
      return res.status(400).json({
        error: "validation_error",
        message: "duplicateMode must be one of: skip, update, error"
      });
    }
    try {
      const report = await platformStore.validateMemberImport(
        req.organizationId,
        incoming,
        duplicateMode
      );
      return res.status(200).json({
        success: true,
        duplicateMode,
        ...report
      });
    } catch (err) {
      return res.status(err?.status || 500).json({
        error: err?.code || "import_validation_error",
        message: err?.message || "Could not validate import batch."
      });
    }
  }
);
app.post(
  "/api/members/import",
  requireAuthRole("admin", "pastor", "super_admin", "creator"),
  requireActiveLicense,
  async (req, res) => {
    const incoming = Array.isArray(req.body?.members) ? req.body.members : [];
    if (incoming.length === 0) {
      return res.status(400).json({ error: "validation_error", message: "members array is required" });
    }
    const duplicateMode = normalizeImportDuplicateMode(req.body?.duplicateMode);
    if (!duplicateMode) {
      return res.status(400).json({
        error: "validation_error",
        message: "duplicateMode must be one of: skip, update, error"
      });
    }
    const dryRun = Boolean(req.body?.dryRun);
    try {
      const result = await platformStore.batchImportMembers(req.organizationId, incoming, {
        duplicateMode,
        dryRun
      });
      return res.status(200).json({
        success: true,
        duplicateMode,
        ...result
      });
    } catch (err) {
      if (err?.code === "SEAT_LIMIT_REACHED") {
        return res.status(403).json({
          error: "license_limit_exceeded",
          code: "SEAT_LIMIT_REACHED",
          message: err.message,
          details: err.details
        });
      }
      if (err?.code === "IMPORT_VALIDATION_FAILED") {
        return res.status(422).json({
          error: "import_validation_failed",
          code: "IMPORT_VALIDATION_FAILED",
          message: err.message,
          details: err.details
        });
      }
      return res.status(err?.status || 500).json({
        error: err?.code || "import_failed",
        message: err?.message || "Could not import members.",
        details: err?.details
      });
    }
  }
);
var optionalIsoDateSchema = import_zod2.z.string().trim().refine(
  (v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v),
  "Date must be formatted as YYYY-MM-DD"
).optional();
var updateOwnProfileSchema = import_zod2.z.object({
  firstName: import_zod2.z.string().trim().min(1, "First name is required").max(80).optional(),
  middleName: import_zod2.z.string().trim().max(80).optional(),
  lastName: import_zod2.z.string().trim().min(1, "Last name is required").max(80).optional(),
  preferredName: import_zod2.z.string().trim().max(120).optional(),
  email: import_zod2.z.string().trim().max(160).refine(
    (v) => v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
    "Please provide a valid email address"
  ).optional(),
  phoneE164: import_zod2.z.string().trim().max(32).optional(),
  phoneNumber: import_zod2.z.string().trim().max(32).optional(),
  gender: import_zod2.z.enum(["male", "female", "other"]).optional(),
  dateOfBirth: optionalIsoDateSchema,
  monthOfBirth: import_zod2.z.string().trim().max(32).optional(),
  birthMonthGroup: import_zod2.z.string().trim().max(64).optional(),
  placeOfResidence: import_zod2.z.string().trim().max(160).optional(),
  specificLocation: import_zod2.z.string().trim().max(160).optional(),
  residentialDigitalAddress: import_zod2.z.string().trim().max(64).optional(),
  hometown: import_zod2.z.string().trim().max(120).optional(),
  occupation: import_zod2.z.string().trim().max(120).optional(),
  maritalStatus: import_zod2.z.string().trim().max(40).optional(),
  spouseName: import_zod2.z.string().trim().max(120).optional(),
  numberOfChildren: import_zod2.z.coerce.number().int().min(0).max(50).optional(),
  emergencyContactPerson: import_zod2.z.string().trim().max(120).optional(),
  emergencyContactPhone: import_zod2.z.string().trim().max(32).optional(),
  groupName: import_zod2.z.string().trim().max(120).optional(),
  homeCellGroup: import_zod2.z.string().trim().max(120).optional(),
  department: import_zod2.z.string().trim().max(500).optional(),
  departments: import_zod2.z.array(import_zod2.z.string().trim().max(120)).max(25).optional(),
  squads: import_zod2.z.string().trim().max(240).optional(),
  dateOfSalvation: optionalIsoDateSchema,
  dateOfBaptism: optionalIsoDateSchema,
  dateOfMarriage: optionalIsoDateSchema,
  remarks: import_zod2.z.string().trim().max(500).optional(),
  notes: import_zod2.z.string().trim().max(500).optional(),
  imageUrl: import_zod2.z.string().trim().max(6e5, "Uploaded image is too large (max ~450KB)").refine(
    (v) => v === "" || v.startsWith("data:image/") || v.startsWith("https://") || v.startsWith("http://"),
    "Photo must be a valid uploaded image or http(s) URL"
  ).nullable().optional(),
  autoCheckinOptedIn: import_zod2.z.boolean().optional()
});
app.get(
  "/api/members/me/profile",
  requireUser,
  enforceOrganizationScope,
  async (req, res) => {
    const profile = await platformStore.getMemberProfileForSession(
      req.organizationId,
      req.user.id,
      req.user.email
    );
    return res.status(200).json({ profile });
  }
);
app.patch(
  "/api/members/me/profile",
  requireUser,
  enforceOrganizationScope,
  requireActiveLicense,
  async (req, res) => {
    const parsed = updateOwnProfileSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        error: "validation_error",
        message: parsed.error.issues[0]?.message || "Invalid profile update payload."
      });
    }
    try {
      const updated = await platformStore.updateOwnMemberProfile(
        req.organizationId,
        req.user.id,
        req.user.email,
        parsed.data,
        req.user.name
      );
      return res.status(200).json(updated);
    } catch (err) {
      return res.status(err?.status || 400).json({
        error: err?.code || "profile_update_failed",
        message: err?.message || "Could not update your member profile."
      });
    }
  }
);
app.put(
  "/api/members/:id",
  requireAuthRole("admin", "pastor", "super_admin", "creator"),
  requireActiveLicense,
  async (req, res) => {
    try {
      const updated = await platformStore.updateMember(req.organizationId, req.params.id, req.body || {});
      return res.status(200).json(updated);
    } catch (err) {
      return res.status(err?.status || 404).json({
        error: "member_update_failed",
        message: err?.message || "Member not found."
      });
    }
  }
);
app.delete(
  "/api/members/:id",
  requireAuthRole("admin", "pastor", "super_admin", "creator"),
  requireActiveLicense,
  async (req, res) => {
    try {
      await platformStore.deleteMember(req.organizationId, req.params.id);
      return res.status(200).json({ success: true });
    } catch (err) {
      return res.status(err?.status || 500).json({
        error: err?.code || "member_delete_failed",
        message: err?.message || "Failed to delete member."
      });
    }
  }
);
var createWallPostSchema = import_zod2.z.object({
  message: import_zod2.z.string().trim().min(1, "Please enter a birthday greeting or celebration note").max(600),
  category: import_zod2.z.enum(["birthday", "testimony", "celebration"]).optional().default("birthday"),
  targetMemberId: import_zod2.z.string().trim().max(120).optional(),
  targetMemberName: import_zod2.z.string().trim().max(120).optional()
});
app.get(
  "/api/church-wall",
  requireAuthRole("admin", "pastor", "usher", "member", "group_leader", "finance", "super_admin", "creator"),
  async (req, res) => {
    try {
      const posts = await churchWallStore.listPosts(req.organizationId);
      return res.status(200).json({ posts });
    } catch (err) {
      return res.status(err?.status || 500).json({
        error: err?.code || "church_wall_fetch_failed",
        message: err?.message || "Failed to load church wall posts."
      });
    }
  }
);
app.post(
  "/api/church-wall",
  requireAuthRole("admin", "pastor", "usher", "member", "group_leader", "finance", "super_admin", "creator"),
  async (req, res) => {
    const parsed = createWallPostSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        error: "validation_error",
        message: parsed.error.issues[0]?.message || "Invalid church wall post."
      });
    }
    try {
      const post = await churchWallStore.createPost(req.organizationId, {
        authorId: req.user.id,
        authorName: req.user.name || req.user.email || "Church Member",
        category: parsed.data.category,
        message: parsed.data.message,
        targetMemberId: parsed.data.targetMemberId,
        targetMemberName: parsed.data.targetMemberName
      });
      return res.status(201).json({ post });
    } catch (err) {
      return res.status(err?.status || 500).json({
        error: err?.code || "church_wall_create_failed",
        message: err?.message || "Failed to create church wall post."
      });
    }
  }
);
app.post(
  "/api/church-wall/:id/amen",
  requireAuthRole("admin", "pastor", "usher", "member", "group_leader", "finance", "super_admin", "creator"),
  async (req, res) => {
    try {
      const post = await churchWallStore.toggleAmen(req.organizationId, req.params.id, req.user.id);
      if (!post) {
        return res.status(404).json({ error: "not_found", message: "Church wall post not found." });
      }
      return res.status(200).json({ post });
    } catch (err) {
      return res.status(err?.status || 500).json({
        error: err?.code || "church_wall_amen_failed",
        message: err?.message || "Failed to update church wall reaction."
      });
    }
  }
);
app.post(
  ["/api/notifications/subscribe"],
  requireAuthRole("admin", "pastor", "usher", "member", "group_leader", "finance", "super_admin", "creator"),
  requireActiveLicense,
  async (req, res) => {
    const body = req.body || {};
    const endpoint = typeof body.endpoint === "string" ? body.endpoint.trim() : "";
    const id = typeof body.id === "string" ? body.id.trim() : `sub-${Date.now()}`;
    if (!endpoint && !id) {
      return res.status(400).json({ error: "invalid_subscription", message: "endpoint or id required" });
    }
    try {
      const saved = await platformStore.upsertPushSubscription(req.organizationId, {
        id,
        endpoint: endpoint || id,
        keys: body.keys,
        personId: body.personId || req.user?.id,
        personName: body.personName || req.user?.name,
        userAgent: body.userAgent,
        subscribedAt: (/* @__PURE__ */ new Date()).toISOString()
      });
      return res.status(200).json({
        success: true,
        subscription: saved.subscription,
        totalSubscribers: saved.totalSubscribers
      });
    } catch (err) {
      return res.status(err?.status || 500).json({
        error: err?.code || "notification_subscribe_failed",
        message: err?.message || "Failed to subscribe for notifications."
      });
    }
  }
);
app.get(
  ["/api/notifications/subscriptions"],
  requireAuthRole("admin", "pastor", "super_admin", "creator"),
  requireActiveLicense,
  async (req, res) => {
    try {
      const subscriptions = await platformStore.getPushSubscriptions(req.organizationId);
      return res.status(200).json({
        subscribersCount: subscriptions.length,
        subscriptions
      });
    } catch (err) {
      return res.status(err?.status || 500).json({
        error: err?.code || "notification_list_failed",
        message: err?.message || "Failed to load notification subscriptions."
      });
    }
  }
);
app.post(
  ["/api/notifications/send"],
  requireAuthRole("admin", "pastor", "super_admin", "creator"),
  requireActiveLicense,
  async (req, res) => {
    const { title, body, personId, topic } = req.body || {};
    if (!title || !body) {
      return res.status(400).json({ error: "invalid_notification", message: "title and body are required" });
    }
    try {
      const subscriptions = await platformStore.getPushSubscriptions(req.organizationId);
      const targets = personId ? subscriptions.filter((s) => s.personId === personId) : subscriptions;
      const count = targets.length > 0 ? targets.length : 1;
      return res.status(200).json({
        success: true,
        title,
        body,
        dispatchedTo: count,
        topic: topic || "general",
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      });
    } catch (err) {
      return res.status(err?.status || 500).json({
        error: err?.code || "notification_send_failed",
        message: err?.message || "Failed to send push notification."
      });
    }
  }
);
app.post(
  ["/api/notifications/test-push"],
  requireAuthRole("admin", "pastor", "usher", "member", "super_admin", "creator"),
  requireActiveLicense,
  async (req, res) => {
    const orgId = req.organizationId;
    try {
      const [premiseData, eventsList, subscriptions] = await Promise.all([
        platformStore.getPremiseSettings(orgId),
        platformStore.getEvents(orgId),
        platformStore.getPushSubscriptions(orgId)
      ]);
      const memberName = req.body?.personName || req.user?.name || "Church Member";
      const campus = premiseData.premiseSettings?.campusName || "Sanctuary Campus";
      const service = eventsList[0]?.name || "Sunday Service";
      const testPayload = {
        title: `Welcome, ${memberName}!`,
        body: `You are checked in for ${service} at ${campus}. Sanctuary presence confirmed.`,
        icon: "/icon.svg",
        tag: "test-arrival",
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      };
      return res.status(200).json({
        success: true,
        message: "Test push payload generated and validated",
        payload: testPayload,
        activeSubscribers: subscriptions.length
      });
    } catch (err) {
      return res.status(err?.status || 500).json({
        error: err?.code || "notification_test_failed",
        message: err?.message || "Failed to generate test push notification."
      });
    }
  }
);
app.get("/api/auth/me", requireUser, enforceOrganizationScope, async (req, res) => {
  try {
    const [credStatus, memberProfile, org] = await Promise.all([
      platformStore.getCredentialStatus(req.user.id, req.user.email),
      req.organizationId ? platformStore.getMemberProfileForSession(req.organizationId, req.user.id, req.user.email) : Promise.resolve(null),
      req.organizationId ? platformStore.getOrganisationById(req.organizationId) : Promise.resolve(null)
    ]);
    const sessionTimeoutMinutes = await platformStore.getOrganizationSessionTimeoutMinutes(
      req.organizationId
    );
    const resolvedDesignation = req.user.designation || (memberProfile?.designation || memberProfile?.officerName ? String(memberProfile.designation || memberProfile.officerName).trim() : void 0) || (req.organizationId ? await platformStore.resolveUserDesignation(req.organizationId, req.user.id, req.user.email) : void 0);
    return res.status(200).json({
      user: {
        ...req.user,
        ...resolvedDesignation ? { designation: resolvedDesignation } : {},
        organizationName: org?.name || void 0,
        avatar: memberProfile?.imageUrl || void 0,
        mustChangePassword: credStatus.mustChangePassword
      },
      memberProfile,
      organizationId: req.organizationId,
      organizationName: org?.name || void 0,
      organization: org ? {
        id: org.id,
        name: org.name,
        slug: org.slug,
        city: org.city
      } : null,
      isCreator: isCreatorClaim(req.user),
      mustChangePassword: credStatus.mustChangePassword,
      hasPasswordCredential: credStatus.hasPasswordCredential,
      idleTimeoutMinutes: req.user.idle_timeout_minutes ?? sessionTimeoutMinutes,
      authenticated: true
    });
  } catch (err) {
    return res.status(err?.status || 500).json({
      error: err?.code || "auth_me_failed",
      message: err?.message || "Failed to resolve authenticated session."
    });
  }
});
app.get("/api/license/status", requireUser, enforceOrganizationScope, async (req, res) => {
  try {
    const evaluation = await platformStore.evaluateOrganizationLicense(req.organizationId);
    return res.status(evaluation.httpStatus).json({
      ...evaluation,
      tenantId: evaluation.organizationId
    });
  } catch (err) {
    return res.status(err?.status || 500).json({
      error: err?.code || "license_status_failed",
      message: err?.message || "Failed to evaluate organisation license status."
    });
  }
});
app.post(
  "/api/admin/system-check",
  requireUser,
  requireRoles("super_admin", "creator"),
  (req, res) => {
    return res.status(200).json({
      success: true,
      message: "Authorized super admin action executed successfully",
      callerRole: req.user?.role
    });
  }
);
var createDonationSchema = import_zod2.z.object({
  amountGhs: import_zod2.z.number().positive().max(1e6).optional(),
  amountMinor: import_zod2.z.number().int().positive().max(1e8).optional(),
  fundName: import_zod2.z.string().trim().min(1).max(100),
  fundId: import_zod2.z.string().trim().max(100).optional(),
  provider: import_zod2.z.enum(["MTN MoMo", "Telecel Cash", "Card", "Cash"]).optional().default("MTN MoMo"),
  method: import_zod2.z.enum(["momo", "card", "cash", "bank"]).optional()
});
app.get(
  "/api/donations",
  requireUser,
  enforceOrganizationScope,
  requireActiveLicense,
  async (req, res) => {
    try {
      const callerRole = req.user.role;
      const canViewOrgLedger = ["admin", "pastor", "finance", "super_admin", "creator"].includes(
        callerRole
      );
      let filterPersonId;
      if (!canViewOrgLedger) {
        const profile = await platformStore.getMemberProfileForSession(
          req.organizationId,
          req.user.id,
          req.user.email
        );
        filterPersonId = profile?.id ? String(profile.id) : req.user.id;
      }
      const donations = await platformStore.listDonations(
        req.organizationId,
        filterPersonId ? { personId: filterPersonId } : void 0
      );
      return res.status(200).json({ donations });
    } catch (err) {
      return res.status(err?.status || 500).json({
        error: err?.code || "donations_fetch_failed",
        message: err?.message || "Failed to load donations."
      });
    }
  }
);
app.post(
  "/api/donations",
  requireUser,
  enforceOrganizationScope,
  requireActiveLicense,
  async (req, res) => {
    const parsed = createDonationSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        error: "validation_error",
        message: parsed.error.issues[0]?.message || "Invalid donation payload."
      });
    }
    const computedAmountMinor = parsed.data.amountMinor ?? (parsed.data.amountGhs ? Math.round(parsed.data.amountGhs * 100) : 0);
    if (!computedAmountMinor || computedAmountMinor <= 0) {
      return res.status(400).json({
        error: "validation_error",
        message: "Donation amount must be greater than zero."
      });
    }
    const derivedMethod = parsed.data.method || (parsed.data.provider === "Card" ? "card" : parsed.data.provider === "Cash" ? "cash" : "momo");
    try {
      const profile = await platformStore.getMemberProfileForSession(
        req.organizationId,
        req.user.id,
        req.user.email
      );
      const personId = profile?.id ? String(profile.id) : req.user.id;
      const personName = profile ? `${profile.firstName || ""} ${profile.lastName || ""}`.trim() : req.user.name || req.user.email || "Member";
      const donation = await platformStore.createDonation(req.organizationId, {
        personId,
        personName,
        fundName: parsed.data.fundName,
        fundId: parsed.data.fundId,
        amountMinor: computedAmountMinor,
        method: derivedMethod,
        provider: parsed.data.provider,
        status: "paid"
      });
      return res.status(201).json({ donation });
    } catch (err) {
      return res.status(err?.status || 500).json({
        error: err?.code || "donation_create_failed",
        message: err?.message || "Failed to record donation."
      });
    }
  }
);
var PaystackInitializeSchema = import_zod2.z.object({
  amountGhs: import_zod2.z.number().positive("Amount must be greater than zero."),
  fundName: import_zod2.z.string().trim().min(1).max(120).default("Tithe"),
  fundId: import_zod2.z.string().trim().max(120).optional(),
  provider: import_zod2.z.enum(["MTN MoMo", "Telecel Cash", "Card"]).default("MTN MoMo"),
  email: import_zod2.z.string().trim().email().optional(),
  callbackUrl: import_zod2.z.string().trim().url().optional()
});
var PaystackVerifySchema = import_zod2.z.object({
  reference: import_zod2.z.string().trim().min(3, "Transaction reference is required.").max(140)
});
app.get(
  "/api/giving/paystack/config",
  requireUser,
  enforceOrganizationScope,
  requireActiveLicense,
  async (req, res) => {
    try {
      const [summary, settingsRes] = await Promise.all([
        platformStore.getTenantGatewayConfigSummary(req.organizationId),
        platformStore.getSystemSettings(req.organizationId).catch(() => null)
      ]);
      const currencyRaw = settingsRes?.settings?.currency || "GHS";
      const currencyCode = currencyRaw.split(" ")[0].toUpperCase() || "GHS";
      return res.status(200).json({
        success: true,
        configured: summary.paystackConfigured,
        publicKey: summary.paystackPublicKey,
        mode: summary.paystackMode,
        source: summary.paystackSource,
        currency: currencyCode
      });
    } catch (err) {
      return res.status(err?.status || 500).json({
        error: err?.code || "paystack_config_failed",
        message: err?.message || "Could not load Paystack giving config."
      });
    }
  }
);
app.post(
  "/api/giving/paystack/initialize",
  requireUser,
  enforceOrganizationScope,
  requireActiveLicense,
  async (req, res) => {
    const parsed = PaystackInitializeSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        error: "validation_error",
        message: parsed.error.issues[0]?.message || "Invalid Paystack initialization payload."
      });
    }
    try {
      const orgId = req.organizationId;
      const [resolvedKeys, profile, settingsRes] = await Promise.all([
        platformStore.getResolvedPaystackKeys(orgId),
        platformStore.getMemberProfileForSession(orgId, req.user.id, req.user.email),
        platformStore.getSystemSettings(orgId).catch(() => null)
      ]);
      const amountMinor = Math.max(100, Math.round(parsed.data.amountGhs * 100));
      const currencyRaw = settingsRes?.settings?.currency || "GHS";
      const currencyCode = currencyRaw.split(" ")[0].toUpperCase() || "GHS";
      const reference = `EKK-${orgId.slice(0, 6).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
      const payerEmail = parsed.data.email || profile?.email || req.user?.email || `giving+${reference.toLowerCase()}@ekklesphere.church`;
      const personId = profile?.id ? String(profile.id) : req.user.id;
      const personName = profile ? `${profile.firstName || ""} ${profile.lastName || ""}`.trim() : req.user.name || req.user.email || "Member";
      const initRes = await initializePaystackTransaction({
        secretKey: resolvedKeys.secretKey,
        publicKey: resolvedKeys.publicKey,
        email: payerEmail,
        amountMinor,
        currency: currencyCode,
        reference,
        callbackUrl: parsed.data.callbackUrl,
        channels: parsed.data.provider === "Card" ? ["card"] : ["mobile_money", "card"],
        metadata: {
          organizationId: orgId,
          personId,
          personName,
          fundName: parsed.data.fundName,
          provider: parsed.data.provider
        }
      });
      if (!initRes.ok) {
        return res.status(initRes.configured ? 502 : 400).json({
          success: false,
          configured: initRes.configured,
          error: initRes.error || "paystack_init_failed",
          message: initRes.message
        });
      }
      const donation = await platformStore.createDonation(orgId, {
        personId,
        personName,
        fundName: parsed.data.fundName,
        fundId: parsed.data.fundId,
        amountMinor,
        method: parsed.data.provider === "Card" ? "card" : "momo",
        provider: parsed.data.provider,
        status: "pending",
        reference: initRes.reference,
        gatewayProvider: "paystack"
      });
      return res.status(200).json({
        success: true,
        configured: true,
        mode: initRes.mode,
        publicKey: resolvedKeys.publicKey,
        authorizationUrl: initRes.authorizationUrl,
        accessCode: initRes.accessCode,
        reference: initRes.reference,
        donation
      });
    } catch (err) {
      return res.status(err?.status || 500).json({
        error: err?.code || "paystack_initialize_error",
        message: err?.message || "Failed to initialize Paystack giving checkout."
      });
    }
  }
);
app.post(
  "/api/giving/paystack/verify",
  requireUser,
  enforceOrganizationScope,
  requireActiveLicense,
  async (req, res) => {
    const parsed = PaystackVerifySchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        error: "validation_error",
        message: parsed.error.issues[0]?.message || "Paystack transaction reference is required."
      });
    }
    try {
      const orgId = req.organizationId;
      const resolvedKeys = await platformStore.getResolvedPaystackKeys(orgId);
      const verifyRes = await verifyPaystackTransaction({
        secretKey: resolvedKeys.secretKey,
        reference: parsed.data.reference
      });
      if (!verifyRes.ok) {
        return res.status(verifyRes.error === "PAYSTACK_NOT_CONFIGURED" ? 400 : 502).json({
          success: false,
          verified: false,
          error: verifyRes.error || "paystack_verify_failed",
          message: verifyRes.message
        });
      }
      const donation = await platformStore.updateDonationStatusByReference(
        orgId,
        verifyRes.reference,
        verifyRes.status,
        {
          paidAt: verifyRes.paidAt || (/* @__PURE__ */ new Date()).toISOString(),
          gatewayMetadata: {
            channel: verifyRes.channel,
            gatewayResponse: verifyRes.gatewayResponse,
            amountMinor: verifyRes.amountMinor
          }
        }
      );
      return res.status(200).json({
        success: true,
        verified: verifyRes.verified,
        status: verifyRes.status,
        reference: verifyRes.reference,
        donation,
        message: verifyRes.message
      });
    } catch (err) {
      return res.status(err?.status || 500).json({
        error: err?.code || "paystack_verify_error",
        message: err?.message || "Failed to verify Paystack transaction."
      });
    }
  }
);
app.post(
  "/api/giving/webhooks/paystack/:organizationId?",
  async (req, res) => {
    try {
      const paramOrg = req.params.organizationId?.trim().toLowerCase();
      const bodyOrg = typeof req.body?.data?.metadata?.organizationId === "string" ? req.body.data.metadata.organizationId.trim().toLowerCase() : "";
      const orgId = paramOrg || bodyOrg;
      if (!orgId) {
        return res.status(400).json({
          error: "organization_required",
          message: "Organization ID is required on webhook path or transaction metadata."
        });
      }
      const resolvedKeys = await platformStore.getResolvedPaystackKeys(orgId);
      const signature = req.headers["x-paystack-signature"];
      const rawBody = req.rawBody || JSON.stringify(req.body || {});
      const sigHeader = Array.isArray(signature) ? signature[0] : signature;
      if (!resolvedKeys.secretKey || !verifyPaystackWebhookSignature({
        secretKey: resolvedKeys.secretKey,
        rawBody,
        signature: sigHeader
      })) {
        return res.status(401).json({
          error: "invalid_webhook_signature",
          message: "Invalid Paystack webhook signature."
        });
      }
      const eventType = String(req.body?.event || "").toLowerCase();
      const reference = String(req.body?.data?.reference || "").trim();
      if (reference && (eventType === "charge.success" || eventType === "charge.failed")) {
        const nextStatus = eventType === "charge.success" ? "paid" : "failed";
        await platformStore.updateDonationStatusByReference(orgId, reference, nextStatus, {
          paidAt: req.body?.data?.paid_at || (/* @__PURE__ */ new Date()).toISOString(),
          gatewayMetadata: {
            webhookEvent: eventType,
            channel: req.body?.data?.channel
          }
        });
      }
      return res.status(200).json({ received: true });
    } catch (err) {
      return res.status(500).json({
        error: "webhook_processing_error",
        message: err?.message || "Error processing Paystack webhook."
      });
    }
  }
);
var createFollowupSchema = import_zod2.z.object({
  personId: import_zod2.z.string().trim().min(1, "Member ID is required"),
  personName: import_zod2.z.string().trim().max(150).optional(),
  personPhone: import_zod2.z.string().trim().max(40).optional(),
  personEmail: import_zod2.z.string().trim().max(160).optional(),
  groupName: import_zod2.z.string().trim().max(150).optional(),
  reason: import_zod2.z.enum(["absent_2", "absent_3", "first_timer", "manual"]).default("manual"),
  assignedToName: import_zod2.z.string().trim().max(150).optional(),
  assignedToMemberId: import_zod2.z.string().trim().max(120).optional(),
  assignedToRole: import_zod2.z.string().trim().max(120).optional(),
  assignedToPhone: import_zod2.z.string().trim().max(40).optional(),
  assignedToEmail: import_zod2.z.string().trim().max(160).optional(),
  autoAssigned: import_zod2.z.boolean().optional(),
  serviceEventId: import_zod2.z.string().trim().max(120).optional(),
  serviceName: import_zod2.z.string().trim().max(200).optional(),
  dueOn: import_zod2.z.string().trim().max(100).optional(),
  notes: import_zod2.z.string().trim().max(1e3).optional()
});
var autoAssignAbsenteesSchema = import_zod2.z.object({
  unarrivedMemberIds: import_zod2.z.array(import_zod2.z.string().trim().min(1)).max(500).optional()
});
var updateFollowupSchema = import_zod2.z.object({
  status: import_zod2.z.enum(["open", "contacted", "resolved", "dismissed"]).optional(),
  outcome: import_zod2.z.string().trim().max(500).optional(),
  assignedToName: import_zod2.z.string().trim().max(150).optional(),
  notes: import_zod2.z.string().trim().max(1e3).optional()
});
var runAbsenceSweepSchema = import_zod2.z.object({
  eventId: import_zod2.z.string().trim().max(120).optional(),
  force: import_zod2.z.boolean().optional()
});
var sendLeaderRemindersSchema = import_zod2.z.object({
  taskId: import_zod2.z.string().trim().max(120).optional(),
  leaderName: import_zod2.z.string().trim().max(160).optional()
});
app.get(
  "/api/followup-tasks",
  requireFollowupAccess,
  requireActiveLicense,
  async (req, res) => {
    try {
      const tasks = await platformStore.listFollowupTasks(req.organizationId);
      return res.status(200).json({ tasks });
    } catch (err) {
      return res.status(err?.status || 500).json({
        error: err?.code || "followup_fetch_failed",
        message: err?.message || "Failed to load follow-up tasks."
      });
    }
  }
);
app.post(
  "/api/followup-tasks",
  requireFollowupAccess,
  requireActiveLicense,
  async (req, res) => {
    const parsed = createFollowupSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        error: "validation_error",
        message: parsed.error.issues[0]?.message || "Invalid follow-up task payload."
      });
    }
    try {
      let task = await platformStore.createFollowupTask(req.organizationId, parsed.data);
      let reminderDispatches = 0;
      try {
        const settingsRes = await platformStore.getSystemSettings(req.organizationId);
        if (settingsRes.settings.autoSendLeaderCareReminders !== false) {
          const remRes = await platformStore.sendPendingLeaderCareReminders(req.organizationId, {
            taskId: task.id,
            actorName: req.user?.name
          });
          reminderDispatches = remRes.sentCount;
          const updatedTask = remRes.allTasks.find((t) => t.id === task.id);
          if (updatedTask) task = updatedTask;
        }
      } catch (remErr) {
        console.warn("[Ekklesphere Pastoral Care] Leader reminder dispatch warning:", remErr?.message || remErr);
      }
      return res.status(201).json({ task, reminderSent: reminderDispatches > 0 });
    } catch (err) {
      return res.status(err?.status || 500).json({
        error: err?.code || "followup_create_failed",
        message: err?.message || "Failed to create follow-up task."
      });
    }
  }
);
app.post(
  "/api/followup-tasks/auto-assign-absentees",
  requireFollowupAccess,
  requireActiveLicense,
  async (req, res) => {
    const parsed = autoAssignAbsenteesSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        error: "validation_error",
        message: parsed.error.issues[0]?.message || "Invalid auto-assign payload."
      });
    }
    try {
      const result = await platformStore.autoAssignAbsenteeFollowupTasks(req.organizationId, {
        unarrivedMemberIds: parsed.data.unarrivedMemberIds,
        fallbackActorName: req.user?.name
      });
      if (result.assignedCount > 0) {
        await platformStore.appendAuditLog({
          organizationId: req.organizationId,
          actorId: req.user?.id || null,
          actorEmail: req.user?.email || "admin@ekklesphere.church",
          actorRole: req.user?.role || "admin",
          action: "followup.auto_assigned_absentees",
          targetType: "followup_tasks",
          targetId: req.organizationId,
          metadata: {
            assignedCount: result.assignedCount,
            skippedExistingCount: result.skippedExistingCount
          },
          ipAddress: getClientIpKey(req)
        });
      }
      return res.status(200).json({
        success: true,
        ...result
      });
    } catch (err) {
      return res.status(err?.status || 500).json({
        error: err?.code || "followup_auto_assign_failed",
        message: err?.message || "Failed to auto-assign absentee follow-up tasks."
      });
    }
  }
);
app.patch(
  "/api/followup-tasks/:id",
  requireFollowupAccess,
  requireActiveLicense,
  async (req, res) => {
    const parsed = updateFollowupSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        error: "validation_error",
        message: parsed.error.issues[0]?.message || "Invalid follow-up task update."
      });
    }
    try {
      const task = await platformStore.updateFollowupTask(
        req.organizationId,
        req.params.id,
        parsed.data
      );
      return res.status(200).json({ task });
    } catch (err) {
      return res.status(err?.status || 500).json({
        error: err?.code || "followup_update_failed",
        message: err?.message || "Failed to update follow-up task."
      });
    }
  }
);
app.post(
  "/api/followup-tasks/:id/acknowledge",
  requireUser,
  enforceOrganizationScope,
  requireActiveLicense,
  async (req, res) => {
    try {
      const hasOversight = await resolveRequestOversightAccess(req);
      const isLeaderOrUsher = ["group_leader", "usher"].includes(req.user.role);
      if (!hasOversight && !isLeaderOrUsher) {
        const myReminders = await platformStore.listLeaderAssignedReminders(req.organizationId, {
          userId: req.user.id,
          name: req.user.name,
          email: req.user.email
        });
        const ownsTask = myReminders.tasks.some((t) => t.id === req.params.id);
        if (!ownsTask) {
          return res.status(403).json({
            error: "forbidden",
            message: "Access denied. Only the assigned leader or pastoral oversight may acknowledge this care task."
          });
        }
      }
      const task = await platformStore.acknowledgeLeaderCareTask(req.organizationId, req.params.id, {
        name: req.user?.name,
        role: req.user?.role
      });
      return res.status(200).json({ success: true, task });
    } catch (err) {
      return res.status(err?.status || 500).json({
        error: err?.code || "followup_acknowledge_failed",
        message: err?.message || "Failed to acknowledge pastoral care reminder."
      });
    }
  }
);
app.delete(
  "/api/followup-tasks/:id",
  requirePastoralOversight,
  requireActiveLicense,
  async (req, res) => {
    try {
      await platformStore.deleteFollowupTask(req.organizationId, req.params.id);
      return res.status(200).json({ success: true });
    } catch (err) {
      return res.status(err?.status || 500).json({
        error: err?.code || "followup_delete_failed",
        message: err?.message || "Failed to delete follow-up task."
      });
    }
  }
);
app.get(
  "/api/pastoral-care/monitor",
  requirePastoralOversight,
  requireActiveLicense,
  async (req, res) => {
    try {
      const monitor = await platformStore.getPastoralCareMonitorSummary(req.organizationId);
      return res.status(200).json({ success: true, monitor });
    } catch (err) {
      return res.status(err?.status || 500).json({
        error: err?.code || "pastoral_monitor_failed",
        message: err?.message || "Failed to load pastoral care monitor."
      });
    }
  }
);
app.post(
  "/api/pastoral-care/run-absence-sweep",
  requirePastoralOversight,
  requireActiveLicense,
  async (req, res) => {
    const parsed = runAbsenceSweepSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        error: "validation_error",
        message: parsed.error.issues[0]?.message || "Invalid absence sweep parameters."
      });
    }
    try {
      const result = await platformStore.processServiceAbsenceSweep(req.organizationId, {
        eventId: parsed.data.eventId || void 0,
        force: Boolean(parsed.data.force),
        triggerSource: "manual_monitor_sweep",
        actorName: req.user?.name
      });
      await platformStore.appendAuditLog({
        organizationId: req.organizationId,
        actorId: req.user?.id || null,
        actorEmail: req.user?.email || "pastor@ekklesphere.church",
        actorRole: req.user?.role || "pastor",
        action: "pastoral_care.absence_sweep",
        targetType: "events",
        targetId: result.eventId || req.organizationId,
        metadata: {
          eventName: result.eventName,
          absentMembersCount: result.absentMembersCount,
          memberMessagesSent: result.memberMessagesSent,
          tasksCreatedCount: result.tasksCreatedCount,
          leaderRemindersSent: result.leaderRemindersSent,
          alreadyProcessed: Boolean(result.alreadyProcessed)
        },
        ipAddress: getClientIpKey(req)
      });
      return res.status(200).json(result);
    } catch (err) {
      return res.status(err?.status || 500).json({
        error: err?.code || "absence_sweep_failed",
        message: err?.message || "Failed to run absence sweep."
      });
    }
  }
);
app.post(
  "/api/pastoral-care/send-leader-reminders",
  requirePastoralOversight,
  requireActiveLicense,
  async (req, res) => {
    const parsed = sendLeaderRemindersSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        error: "validation_error",
        message: parsed.error.issues[0]?.message || "Invalid reminder dispatch payload."
      });
    }
    try {
      const result = await platformStore.sendPendingLeaderCareReminders(req.organizationId, {
        taskId: parsed.data.taskId || void 0,
        leaderName: parsed.data.leaderName || void 0,
        actorName: req.user?.name
      });
      await platformStore.appendAuditLog({
        organizationId: req.organizationId,
        actorId: req.user?.id || null,
        actorEmail: req.user?.email || "pastor@ekklesphere.church",
        actorRole: req.user?.role || "pastor",
        action: "pastoral_care.leader_reminders_sent",
        targetType: "followup_tasks",
        targetId: parsed.data.taskId || req.organizationId,
        metadata: {
          sentCount: result.sentCount,
          attemptedCount: result.attemptedCount,
          leaderName: parsed.data.leaderName || null
        },
        ipAddress: getClientIpKey(req)
      });
      return res.status(200).json({
        success: true,
        ...result
      });
    } catch (err) {
      return res.status(err?.status || 500).json({
        error: err?.code || "leader_reminders_failed",
        message: err?.message || "Failed to send pastoral care reminders."
      });
    }
  }
);
app.get(
  "/api/pastoral-care/my-reminders",
  requireUser,
  enforceOrganizationScope,
  requireActiveLicense,
  async (req, res) => {
    try {
      const reminders = await platformStore.listLeaderAssignedReminders(req.organizationId, {
        userId: req.user.id,
        name: req.user.name,
        email: req.user.email
      });
      return res.status(200).json({
        success: true,
        ...reminders
      });
    } catch (err) {
      return res.status(err?.status || 500).json({
        error: err?.code || "my_reminders_failed",
        message: err?.message || "Failed to load leader pastoral reminders."
      });
    }
  }
);
var updateConsentsSchema = import_zod2.z.object({
  autoCheckin: import_zod2.z.boolean(),
  push: import_zod2.z.boolean(),
  sms: import_zod2.z.boolean(),
  email: import_zod2.z.boolean()
});
app.get(
  "/api/consents/me",
  requireUser,
  enforceOrganizationScope,
  async (req, res) => {
    try {
      const consents = await platformStore.getMemberConsents(
        req.organizationId,
        req.user.id,
        req.user.email
      );
      return res.status(200).json({ consents });
    } catch (err) {
      return res.status(err?.status || 500).json({
        error: err?.code || "consents_fetch_failed",
        message: err?.message || "Failed to load consent settings."
      });
    }
  }
);
app.put(
  "/api/consents/me",
  requireUser,
  enforceOrganizationScope,
  requireActiveLicense,
  async (req, res) => {
    const parsed = updateConsentsSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        error: "validation_error",
        message: parsed.error.issues[0]?.message || "Invalid consent settings payload."
      });
    }
    try {
      const consents = await platformStore.upsertMemberConsents(
        req.organizationId,
        req.user.id,
        req.user.email,
        parsed.data,
        req.user.name
      );
      return res.status(200).json({ consents });
    } catch (err) {
      return res.status(err?.status || 500).json({
        error: err?.code || "consents_update_failed",
        message: err?.message || "Failed to save consent settings."
      });
    }
  }
);
var updateRsvpSchema = import_zod2.z.object({
  eventTitle: import_zod2.z.string().trim().min(1, "Event title is required").max(200),
  eventId: import_zod2.z.string().trim().max(120).optional(),
  attending: import_zod2.z.boolean()
});
app.get(
  "/api/rsvps/me",
  requireUser,
  enforceOrganizationScope,
  async (req, res) => {
    try {
      const rsvps = await platformStore.listEventRsvps(req.organizationId, req.user.id);
      return res.status(200).json({ rsvps });
    } catch (err) {
      return res.status(err?.status || 500).json({
        error: err?.code || "rsvps_fetch_failed",
        message: err?.message || "Failed to load event RSVPs."
      });
    }
  }
);
app.put(
  "/api/rsvps/me",
  requireUser,
  enforceOrganizationScope,
  requireActiveLicense,
  async (req, res) => {
    const parsed = updateRsvpSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        error: "validation_error",
        message: parsed.error.issues[0]?.message || "Invalid RSVP payload."
      });
    }
    try {
      const result = await platformStore.upsertEventRsvp(
        req.organizationId,
        req.user.id,
        req.user.email,
        parsed.data
      );
      return res.status(200).json(result);
    } catch (err) {
      return res.status(err?.status || 500).json({
        error: err?.code || "rsvp_update_failed",
        message: err?.message || "Failed to update event RSVP."
      });
    }
  }
);
var memberDataRequestSchema = import_zod2.z.object({
  requestType: import_zod2.z.enum(["export", "deletion"]),
  reason: import_zod2.z.string().trim().max(500).optional()
});
app.post(
  "/api/data-requests/me",
  requireUser,
  enforceOrganizationScope,
  async (req, res) => {
    const parsed = memberDataRequestSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        error: "validation_error",
        message: parsed.error.issues[0]?.message || "Invalid data privacy request payload."
      });
    }
    try {
      const requestedByEmail = req.user?.email || `${(req.user?.name || "member").toLowerCase().replace(/[^a-z0-9]+/g, ".")}@member.local`;
      const dataRequest = await platformStore.createDataRequest({
        organizationId: req.organizationId,
        requestType: parsed.data.requestType,
        requestedByEmail,
        reason: parsed.data.reason || (parsed.data.requestType === "deletion" ? "Member self-service deletion request (Ghana Act 843)" : "Member self-service data export")
      });
      return res.status(201).json({ dataRequest });
    } catch (err) {
      return res.status(err?.status || 500).json({
        error: err?.code || "data_request_failed",
        message: err?.message || "Failed to submit data privacy request."
      });
    }
  }
);
var createStaffSchema = import_zod2.z.object({
  fullName: import_zod2.z.string().trim().min(2, "Full name is required").max(150),
  email: import_zod2.z.string().trim().email("Valid email address is required"),
  phone: import_zod2.z.string().trim().max(40).optional(),
  role: import_zod2.z.enum(["admin", "pastor", "usher", "group_leader", "finance", "super_admin"]),
  designation: import_zod2.z.string().trim().max(120).optional(),
  password: import_zod2.z.string().min(8, "Password must be at least 8 characters").optional()
});
app.get(
  "/api/staff",
  requireAuthRole("admin", "pastor", "super_admin", "creator"),
  async (req, res) => {
    try {
      const staff = await platformStore.listOrganizationStaff(req.organizationId);
      return res.status(200).json({ staff });
    } catch (err) {
      return res.status(err?.status || 500).json({
        error: err?.code || "staff_fetch_failed",
        message: err?.message || "Failed to load organisation staff."
      });
    }
  }
);
app.post(
  "/api/staff",
  requireAuthRole("admin", "super_admin", "creator"),
  requireActiveLicense,
  async (req, res) => {
    const parsed = createStaffSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        error: "validation_error",
        message: parsed.error.issues[0]?.message || "Invalid staff provisioning payload."
      });
    }
    const callerIsCreator = req.user?.role === "creator" || req.user?.role === "super_admin" || Boolean(req.user?.is_creator);
    if (parsed.data.role === "super_admin" && !callerIsCreator) {
      return res.status(403).json({
        error: "forbidden",
        message: "Only platform creators or super admins may provision a Platform Super Admin."
      });
    }
    try {
      const result = await platformStore.provisionOrganizationStaff({
        organizationId: req.organizationId,
        fullName: parsed.data.fullName,
        email: parsed.data.email,
        phone: parsed.data.phone,
        role: parsed.data.role,
        designation: parsed.data.designation,
        password: parsed.data.password,
        ipAddress: req.ip
      });
      return res.status(201).json(result);
    } catch (err) {
      return res.status(err?.status || 400).json({
        error: err?.code || "staff_provision_failed",
        message: err?.message || "Failed to provision staff account."
      });
    }
  }
);
var optionalTrimmedText = (maxLen) => import_zod2.z.preprocess(
  (val) => typeof val === "string" && val.trim() === "" ? void 0 : val,
  import_zod2.z.string().trim().max(maxLen).optional()
);
var optionalEmailField = import_zod2.z.preprocess(
  (val) => typeof val === "string" && val.trim() === "" ? void 0 : val,
  import_zod2.z.string().trim().email("Valid email address is required").optional()
);
var optionalPasswordField = import_zod2.z.preprocess(
  (val) => typeof val === "string" && val.trim() === "" ? void 0 : val,
  import_zod2.z.string().min(8, "Password must be at least 8 characters").optional()
);
var USER_ROLES_ENUM = [
  "member",
  "usher",
  "group_leader",
  "pastor",
  "finance",
  "admin",
  "super_admin"
];
var optionalClearableEmailField = import_zod2.z.preprocess(
  (val) => typeof val === "string" ? val.trim() : val,
  import_zod2.z.union([import_zod2.z.literal(""), import_zod2.z.string().email("Valid email address is required")]).optional()
);
var manageUserCredentialsSchema = import_zod2.z.object({
  credentialId: optionalTrimmedText(120),
  memberId: optionalTrimmedText(120),
  fullName: optionalTrimmedText(150),
  email: optionalEmailField,
  phone: optionalTrimmedText(40),
  role: import_zod2.z.enum(USER_ROLES_ENUM).default("member"),
  designation: optionalTrimmedText(120),
  password: optionalPasswordField,
  requirePasswordChange: import_zod2.z.boolean().optional()
}).refine((data) => Boolean(data.credentialId || data.memberId || data.email || data.phone), {
  message: "Select an enrolled member/user or provide an email address or phone number."
});
var updateUserAccountSchema = import_zod2.z.object({
  fullName: optionalTrimmedText(150),
  email: optionalClearableEmailField,
  phone: import_zod2.z.string().trim().max(40).optional(),
  role: import_zod2.z.enum(USER_ROLES_ENUM).optional(),
  status: import_zod2.z.enum(["active", "suspended"]).optional(),
  designation: optionalTrimmedText(120)
}).refine(
  (data) => Boolean(
    data.fullName !== void 0 || data.email !== void 0 || data.phone !== void 0 || data.role || data.status || data.designation !== void 0
  ),
  {
    message: "Provide at least a name, email, phone, role, portfolio/designation, or status update."
  }
);
app.get(
  "/api/users",
  requireAuthRole("admin", "pastor", "super_admin", "creator"),
  async (req, res) => {
    try {
      const includeTemporaryPasswords = req.user?.role === "admin" || req.user?.role === "super_admin" || req.user?.role === "creator" || Boolean(req.user?.is_creator);
      const users = await platformStore.listOrganizationUsers(req.organizationId, {
        includeTemporaryPasswords
      });
      return res.status(200).json({ users });
    } catch (err) {
      return res.status(err?.status || 500).json({
        error: err?.code || "users_fetch_failed",
        message: err?.message || "Failed to load organisation user and member accounts."
      });
    }
  }
);
app.post(
  "/api/users/credentials",
  requireAuthRole("admin", "super_admin", "creator"),
  requireActiveLicense,
  async (req, res) => {
    const parsed = manageUserCredentialsSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        error: "validation_error",
        message: parsed.error.issues[0]?.message || "Invalid user credentials payload."
      });
    }
    const callerIsCreator = req.user?.role === "creator" || req.user?.role === "super_admin" || Boolean(req.user?.is_creator);
    if (parsed.data.role === "super_admin" && !callerIsCreator) {
      return res.status(403).json({
        error: "forbidden",
        message: "Only platform creators or super admins may assign Platform Super Admin privileges."
      });
    }
    try {
      const result = await platformStore.provisionOrganizationMemberCredentials({
        organizationId: req.organizationId,
        credentialId: parsed.data.credentialId,
        memberId: parsed.data.memberId,
        fullName: parsed.data.fullName,
        email: parsed.data.email,
        phone: parsed.data.phone,
        role: parsed.data.role,
        designation: parsed.data.designation,
        password: parsed.data.password,
        requirePasswordChange: parsed.data.requirePasswordChange,
        actorId: req.user?.id || null,
        actorEmail: req.user?.email || null,
        ipAddress: req.ip
      });
      return res.status(201).json(result);
    } catch (err) {
      return res.status(err?.status || 400).json({
        error: err?.code || "user_credential_provision_failed",
        message: err?.message || "Failed to save user login credentials."
      });
    }
  }
);
app.patch(
  "/api/users/:id",
  requireAuthRole("admin", "super_admin", "creator"),
  requireActiveLicense,
  async (req, res) => {
    const parsed = updateUserAccountSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        error: "validation_error",
        message: parsed.error.issues[0]?.message || "Invalid user account update payload."
      });
    }
    const callerIsCreator = req.user?.role === "creator" || req.user?.role === "super_admin" || Boolean(req.user?.is_creator);
    try {
      const user = await platformStore.updateOrganizationUserAccount({
        organizationId: req.organizationId,
        targetId: String(req.params.id || ""),
        fullName: parsed.data.fullName,
        email: parsed.data.email,
        phone: parsed.data.phone,
        role: parsed.data.role,
        status: parsed.data.status,
        designation: parsed.data.designation,
        actorUserId: req.user?.id || null,
        actorEmail: req.user?.email || null,
        callerIsCreator,
        ipAddress: req.ip
      });
      return res.status(200).json({ user });
    } catch (err) {
      return res.status(err?.status || 400).json({
        error: err?.code || "user_account_update_failed",
        message: err?.message || "Failed to update user account."
      });
    }
  }
);
app.delete(
  "/api/users/:id",
  requireAuthRole("admin", "super_admin", "creator"),
  requireActiveLicense,
  async (req, res) => {
    const callerIsCreator = req.user?.role === "creator" || req.user?.role === "super_admin" || Boolean(req.user?.is_creator);
    try {
      const deleted = await platformStore.deleteOrganizationUserAccount({
        organizationId: req.organizationId,
        targetId: String(req.params.id || ""),
        actorUserId: req.user?.id || null,
        actorEmail: req.user?.email || null,
        callerIsCreator,
        ipAddress: req.ip
      });
      return res.status(200).json({ success: true, ...deleted });
    } catch (err) {
      return res.status(err?.status || 400).json({
        error: err?.code || "user_account_delete_failed",
        message: err?.message || "Failed to delete user account."
      });
    }
  }
);
var mediaProxyLimiter = (0, import_express_rate_limit2.default)({
  windowMs: 60 * 1e3,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  passOnStoreError: true,
  keyGenerator: (req) => `media:${getClientIpKey(req)}`,
  validate: false,
  message: { error: "rate_limit_exceeded", message: "Too many image proxy requests. Please wait a moment." }
});
app.get("/api/media/proxy", mediaProxyLimiter, async (req, res) => {
  const rawUrl = typeof req.query.url === "string" ? req.query.url : "";
  const parsedWidth = Number(req.query.w);
  const parsedQuality = Number(req.query.q);
  const width = Number.isFinite(parsedWidth) && parsedWidth > 0 ? parsedWidth : void 0;
  const quality = Number.isFinite(parsedQuality) && parsedQuality > 0 ? parsedQuality : void 0;
  const acceptHeader = typeof req.headers.accept === "string" ? req.headers.accept : void 0;
  try {
    const { buffer, contentType, etag } = await proxyExternalImage(rawUrl, {
      width,
      quality,
      acceptHeader
    });
    res.setHeader("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
    res.setHeader("ETag", etag);
    res.setHeader("Vary", "Accept");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
    const ifNoneMatch = req.headers["if-none-match"];
    if (typeof ifNoneMatch === "string" && ifNoneMatch.trim() === etag) {
      return res.status(304).end();
    }
    res.setHeader("Content-Type", contentType);
    return res.status(200).send(buffer);
  } catch (err) {
    if (err instanceof MediaProxyError) {
      return res.status(err.status).json({
        error: err.code,
        message: err.message
      });
    }
    return res.status(502).json({
      error: "media_proxy_failed",
      message: "Could not retrieve the external image URL."
    });
  }
});
app.get(["/api/health", "/api/db/status"], (_req, res) => {
  return res.status(200).json({
    status: "healthy",
    app: "Ekklesphere Church Management",
    storageBackend: platformStore.storageBackend,
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  });
});
app.all("/api/*", (req, res) => {
  return res.status(404).json({
    error: "not_found",
    message: `API endpoint not found: ${req.method} ${req.path}`
  });
});
app.use((err, _req, res, _next) => {
  const status = typeof err?.status === "number" ? err.status : 500;
  return res.status(status).json({
    error: err?.code || "internal_server_error",
    message: err?.message || "Unexpected server error."
  });
});
async function startServer() {
  const isProduction = process.env.NODE_ENV === "production";
  const httpServer = (0, import_http.createServer)(app);
  if (!isProduction && !process.env.VERCEL) {
    const vitePkg = "vite";
    const { createServer: createViteServer } = await import(
      /* @vite-ignore */
      vitePkg
    );
    const hmrDisabled = process.env.DISABLE_HMR === "true";
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: hmrDisabled ? false : { server: httpServer }
      },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    app.use(import_express2.default.static(import_path.default.join(__dirname, "dist")));
    app.get("*", (_req, res) => {
      res.sendFile(import_path.default.join(__dirname, "dist", "index.html"));
    });
  }
  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`[Ekklesphere] Server running at http://0.0.0.0:${PORT} (${platformStore.storageBackend})`);
  });
}
if (process.env.NODE_ENV !== "test" && !process.env.VITEST && !process.env.VERCEL) {
  startServer().catch((err) => {
    console.error("[Ekklesphere] Failed to start server:", err);
    process.exit(1);
  });
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  app,
  getClientIpKey,
  requireAuthRole,
  requireFollowupAccess,
  requirePastoralOversight
});
