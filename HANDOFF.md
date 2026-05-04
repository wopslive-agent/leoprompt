# Leoprompt Concierge Handoff

Date: 2026-05-03
Workspace: `/Users/bobby/Documents/Codex/2026-05-03/files-mentioned-by-the-user-leoprompt/leoprompt-clean`
Stack: Express, tRPC, Drizzle ORM, MySQL, React 19, Wouter, TanStack Query, Tailwind v4, Anthropic, Twilio, Stripe.

## Current Verification

- `pnpm exec tsc --noEmit` passes.
- `pnpm exec vitest run` passes: 13 test files, 110 tests.
- `pnpm build` passes.
- Dev server was verified at `http://localhost:3001/` because port 3000 was busy.
- Build warnings still exist for missing analytics placeholders in `client/index.html`: `VITE_ANALYTICS_ENDPOINT` and `VITE_ANALYTICS_WEBSITE_ID`.

## Already Built

### Auth and Core App

- Email/password auth with bcrypt and JWT session cookies.
- tRPC API with protected procedures.
- Drizzle schema plus in-memory fallback for local no-DB development.
- Dashboard pages for Settings, Conversations, Conversation Detail, Leads, Billing, and AI Training.

### Twilio and Messaging

- Twilio HMAC-SHA1 webhook validation in `server/_core/twilio.ts`.
- SMS sending through Twilio REST.
- WhatsApp multi-channel support:
  - `extractChannel()`
  - `normalizePhone()`
  - `sendMessage()`
  - route by `whatsappPhoneNumber`
  - conversation `channel` persisted.
- `server/_core/handlers/twilioWebhook.test.ts` now tests the current channel helpers.
- `server/_core/handlers/twilioWebhook.pipeline.test.ts` covers billing gate, safety short-circuiting, and field-conflict behavior in the real webhook pipeline.

### AI Intake and V3 Safety

- Claude intake engine in `server/_core/ai.ts`.
- Forced `record_intent` tool call with canonical V3 structured output.
- V3-ish system prompt with operating lane, rejection rules, handoff rules, and exact handoff line.
- Pure state machine in `server/_core/stateMachine.ts`.
- Deterministic SMS safety layer in `server/_core/smsSafety.ts`:
  - prompt-injection detection
  - explicit/coded/illegal/ambiguous classifier
  - pre-LLM human handoff result builder
  - field conflict detector
  - field conflict patching for `IntakeResult`.
- Webhook integration:
  - prompt injection/coded/illegal content short-circuits before the LLM.
  - field conflicts add `field_conflict`, ask for reconfirmation, and preserve prior field values until confirmed.

### Billing and Tenant Gating

- Stripe plan tiers and billing UI.
- Plan limits are pinned in `server/_core/billing.ts`:
  - trial: 25 conversations/month
  - starter: 100 conversations/month
  - pro: 500 conversations/month
  - agency: 2500 conversations/month
- Webhook-level billing gate exists before user-message persistence and before AI calls.
- New conversation creation is serialized in `getOrCreateConversationForInboundWebhook()` via an account row lock when using MySQL.
- Existing conversations can continue after the monthly limit; inactive accounts are blocked first.

### Calendar and Follow-ups

- Calendly URL support:
  - `appendBookingLink()` appends booking link when a lead qualifies.
- Google Calendar event creation:
  - REST API event insert.
  - access-token refresh on 401.
  - refreshed token persistence.
- Google Calendar OAuth2 connect flow is built:
  - `server/routers/calendar.ts`
  - protected `status`, `startOAuth`, `completeOAuth`, and `disconnect`
  - signed state and state-cookie validation
  - user/account binding
  - encrypted token storage with AES-GCM
  - Settings UI connect/reconnect/disconnect/status.
- Follow-up scheduler in `server/_core/followUp.ts`:
  - no-reply 2h
  - no-reply 24h
  - appointment reminder 24h
  - appointment reminder 1h
  - jobs cancelled when customer replies.

## Environment Variables

Already represented in `.env.example`:

```env
DATABASE_URL=
JWT_SECRET=
NODE_ENV=
PORT=
APP_BASE_URL=
SMS_BATCH_WINDOW_MS=

TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
WEBHOOK_BASE_URL=

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALENDAR_REDIRECT_URI=
GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY=
GOOGLE_OAUTH_STATE_SECRET=

ANTHROPIC_API_KEY=

STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_STARTER_PRICE_ID=
STRIPE_PRO_PRICE_ID=
STRIPE_AGENCY_PRICE_ID=
```

Production note: `GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY` should be a strong random secret. `GOOGLE_OAUTH_STATE_SECRET` is optional and falls back to `JWT_SECRET`.

## Highest Priority Remaining Work

### 1. Owner Email Notifications

Status: Not built. `server/_core/notification.ts` is still a stub.

Why it matters: Leads and handoffs create in-app notifications, but `notificationEmail` is not used for real outbound email alerts.

Suggested implementation:

- Pick provider, preferably Resend for a small app.
- Add env:
  - `RESEND_API_KEY`
  - optionally `OWNER_ALERT_FROM_EMAIL`
- Replace or extend `server/_core/notification.ts` with `sendOwnerAlert()`.
- In `server/_core/handlers/twilioWebhook.ts`, after qualified and handoff lead creation, send email to `account.notificationEmail`.
- Mark `ownerAlertSent=true` only after successful delivery.
- Add retry or durable failure logging. The V3 spec says owner alert failure should not be silently treated as success.
- Add tests for successful alert, missing email, provider failure, and `ownerAlertSent`.

Primary files:

- `server/_core/notification.ts`
- `server/_core/handlers/twilioWebhook.ts`
- `server/db.ts`
- `server/_core/env.ts`
- `.env.example`

### 2. Manager Takeover UI and Router Actions

Status: Partially supported by schema/statuses, not exposed as a real workflow.

Existing pieces:

- `awaiting_manager` status exists.
- `leadsLog.managerAssigned` and `leadsLog.managerTakeoverAt` exist.
- `conversations.updateStatus` can set raw status.
- Conversation Detail shows thread/history, but not a proper takeover workflow.

Needed:

- Add explicit conversation mutations:
  - `takeOver(conversationId)`
  - `close(conversationId)`
  - `reject(conversationId, reason?)`
  - optional `releaseToBot(conversationId)` if desired.
- On takeover:
  - set conversation status to `awaiting_manager`
  - stamp `managerAssigned` and `managerTakeoverAt` on latest related lead log.
- While `awaiting_manager`, bot is already locked by state machine, but webhook behavior should be reviewed so it does not send confusing autonomous replies.
- Add UI affordances in `Conversations.tsx` and `ConversationDetail.tsx`.
- Add tests for authorization and status transitions.

Primary files:

- `server/routers/conversations.ts`
- `client/src/pages/Conversations.tsx`
- `client/src/pages/ConversationDetail.tsx`
- `server/db.ts`

### 3. Schema Output Validation Before Side Effects

Status: Not built as a separate guard. Anthropic tool schema constrains output, and parse failures are handled, but there is no local validator before side effects.

Needed:

- Create `server/_core/validateOutput.ts`.
- Export `validateIntakeResult(result: IntakeResult)`.
- Validate:
  - enum values
  - `confidence.overall` between 0 and 1
  - `riskFlags` shape
  - `missingFields` shape
  - `confirm_details` only when required fields are complete
  - `shouldReject` aligns with `reject_request`
  - `shouldHandoff` aligns with handoff reasons when appropriate.
- In `twilioWebhook.ts`, run validation before transition, lead creation, calendar creation, and reply sending.
- If invalid:
  - `parseError=true`
  - `schemaValid=false`
  - safe fallback reply
  - log validation errors in `notesForManager` or a structured log.

Primary files:

- `server/_core/validateOutput.ts`
- `server/_core/handlers/twilioWebhook.ts`
- `server/_core/ai.test.ts`

### 4. Deterministic Out-of-Area Detection

Status: Not implemented. The `out_of_area` risk flag and `out_of_area_review` handoff reason exist.

Needed:

- Build deterministic area checker, for example `server/_core/areaCheck.ts`.
- Start simple:
  - configured account service area text
  - GTA city/neighborhood allowlist
  - postal-code prefix checks
  - clear outside-area keywords/cities.
- If address/neighborhood is outside service area:
  - add `out_of_area`
  - set `handoffReason="out_of_area_review"`
  - set `shouldHandoff=true`
  - avoid continuing normal collection.
- Add tests for in-area, out-of-area, unknown, and ambiguous cases.

Primary files:

- `server/_core/areaCheck.ts`
- `server/_core/handlers/twilioWebhook.ts`
- `server/_core/ai.ts`

## Medium Priority Remaining Work

### 5. Repeated Missing Info Detection

Status: Not implemented. Risk flag exists.

Needed:

- Compare current `missingFields` to prior assistant messages or prior conversation state.
- If the same required field is asked for repeatedly and user still does not provide it, add `repeated_missing_info`.
- Consider a threshold of two consecutive no-progress turns.
- Decide whether to keep collecting, handoff, or reject based on severity.

Primary files:

- `server/_core/handlers/twilioWebhook.ts`
- possible new `server/_core/conversationRisk.ts`

### 6. SMS Batching Integration

Status: DB helpers and README text exist, but the current Twilio webhook does not use the batching table.

Existing helpers in `server/db.ts`:

- `createSmsMessageBatch`
- `getPendingSmsMessageBatches`
- `updateSmsMessageBatchStatus`

Needed:

- Decide whether SMS batching is still desired.
- If yes, wire Twilio webhook to hold rapid-fire texts for `SMS_BATCH_WINDOW_MS`, combine them, process once, and mark rows processed.
- If no, remove or update stale README claims and unused DB helpers/migration references.

Primary files:

- `server/_core/handlers/twilioWebhook.ts`
- `server/db.ts`
- `README.md`

### 7. Twilio Webhook Deduplication

Status: Not implemented.

Problem: Twilio retries can create duplicate user messages and duplicate replies if processing exceeds the retry window.

Needed:

- Add `messageSid` column to `messages`, or a separate inbound webhook receipts table with unique `(accountId, messageSid)`.
- Before processing a webhook, check whether `MessageSid` was already processed.
- If seen, return 200 TwiML without sending another reply.
- Add race-safe unique constraint at DB level.

Primary files:

- `drizzle/schema.ts`
- new migration
- `server/db.ts`
- `server/_core/handlers/twilioWebhook.ts`

### 8. Conversation Reopen Logic

Status: Not implemented.

Current behavior: `qualified`, `rejected`, `closed`, and `awaiting_manager` are locked by the state machine. New customer messages in these states do not cleanly start a new review event.

Needed:

- Define desired product behavior:
  - create a fresh conversation record, or
  - create a human review event against the old thread.
- Avoid silently resuming old collection after rejected/closed.
- Add tests for inbound messages after `rejected`, `closed`, and `qualified`.

Primary files:

- `server/_core/stateMachine.ts`
- `server/_core/handlers/twilioWebhook.ts`
- `server/db.ts`

### 9. Stale Conversation Closing

Status: Not implemented.

Needed:

- Add scheduler logic to close or flag conversations stuck in `new` or `collecting_details` after a configured number of days.
- Consider env var such as `STALE_CONVERSATION_DAYS`.
- Add notification or lead log entry if needed.

Primary files:

- `server/_core/followUp.ts`
- `server/db.ts`
- `server/_core/env.ts`

## Lower Priority Cleanup

### 10. README and TODO Refresh

Status: Stale in a few spots.

Needed:

- Update README to reflect:
  - Google Calendar OAuth UI is now built.
  - SMS batching is not currently wired despite README text.
  - tests are now 110, not 78.
- Update TODO list so the next AI does not chase completed tasks.

### 11. Production Build Warnings

Status: Build passes with warnings.

Needed:

- Define `VITE_ANALYTICS_ENDPOINT` and `VITE_ANALYTICS_WEBSITE_ID`, or remove/guard the analytics script in `client/index.html`.
- Consider route-level code splitting. Current main JS chunk is above 500 kB after minification.

## Key File Map

```text
server/_core/ai.ts
  IntakeResult types, canonical tool schema, system prompt, Anthropic call.

server/_core/smsSafety.ts
  Prompt-injection classifier, coded/ambiguous classifier, field conflict helper.

server/_core/stateMachine.ts
  Pure state transition logic and locked states.

server/_core/handlers/twilioWebhook.ts
  Main inbound pipeline: signature -> account -> billing gate -> safety -> AI -> conflict check -> state -> side effects -> reply.

server/_core/twilio.ts
  Signature validation, channel detection, phone normalization, SMS/WhatsApp sending.

server/_core/billing.ts
  Plan limits and inbound webhook billing gate.

server/_core/calendar.ts
  Calendly append, Google OAuth helpers, token encryption/decryption, event creation.

server/routers/calendar.ts
  Protected Google Calendar OAuth status/start/complete/disconnect router.

server/_core/followUp.ts
  In-process follow-up scheduler.

server/db.ts
  DB access layer and in-memory fallback. Also contains serialized inbound conversation creation.

drizzle/schema.ts
  Schema source of truth.

client/src/pages/Settings.tsx
  Business settings, Twilio, Google Calendar, Calendly, WhatsApp, follow-up controls.

client/src/pages/ConversationDetail.tsx
  Thread detail UI. Good starting point for manager takeover controls.

server/_core/handlers/twilioWebhook.pipeline.test.ts
  Best reference for expected webhook safeguard behavior.
```

## How To Run

```bash
pnpm install
pnpm exec tsc --noEmit
pnpm exec vitest run
pnpm dev
```

Local no-DB mode works through the in-memory fallback. With a real database, run migrations and provide `DATABASE_URL`.

## Suggested Next AI Prompt

```text
You are taking over Leoprompt Concierge. Read HANDOFF.md first, then inspect the files named there before editing.

Do not reimplement Google Calendar OAuth, SMS safety, field conflict detection, or webhook billing gates. Those are already present and tested.

Pick the next task from "Highest Priority Remaining Work", preferably Owner Email Notifications or Manager Takeover UI. Keep edits scoped, add tests, run `pnpm exec tsc --noEmit` and `pnpm exec vitest run`, and update HANDOFF.md if the task changes project status.
```
