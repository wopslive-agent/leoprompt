# Leoprompt Concierge — Development TODO

## Database & Schema

- [x] Define accounts table (business_name, services, pricing, availability, ai_persona, stripe_customer_id, plan, active)
- [x] Define conversations table (account_id, customer_phone, status, current_state, risk_flags, last_message_at)
- [x] Define messages table (conversation_id, role, body, extracted_fields, confidence, next_action)
- [x] Define leads_log table (account_id, conversation_id, status, booking_details, handoff_reason)
- [x] Define notifications table (account_id, user_id, type, title, content, read_at, created_at)
- [x] Run Drizzle migrations and apply to database
- [x] Migration 0003: add `twilioPhoneNumber` (varchar 20) and `onboardingComplete` (boolean) to accounts table

## Authentication & Core Infrastructure

- [x] Replace Manus OAuth with email/password authentication
- [x] Implement bcrypt password hashing
- [x] Create JWT-based session tokens
- [x] Build signup and signin endpoints
- [x] Create SignIn and SignUp pages
- [x] Update useAuth hook for new auth system
- [x] Remove all Manus OAuth dependencies
- [x] Implement role-based access control (operator vs admin)
- [x] Create protected procedures for operator and admin routes

## Onboarding Wizard

- [x] Build Step 1: Business name input
- [x] Build Step 2: Services offered (multi-select or text input)
- [x] Build Step 3: Pricing configuration
- [x] Build Step 4: Availability settings (hours, days)
- [x] Build Step 5: Custom AI persona / instructions
- [x] Create wizard state management and completion flow
- [x] Redirect to dashboard after completion

## AI Engine & SMS Integration

- [x] Create Twilio webhook endpoint (`POST /api/webhook/twilio`) — registered in `server/_core/index.ts`
- [x] Implement Twilio HMAC-SHA1 signature validation — `server/_core/twilio.ts`
- [x] Build conversation routing by account_id + customer_phone — `getAccountByTwilioPhone` in `server/db.ts`
- [x] Implement Claude API integration with tool-use (`record_intent`) — `server/_core/ai.ts`
- [x] Build state machine logic (pure functions, no side effects) — `server/_core/stateMachine.ts`
- [x] Implement schema validation for AI responses (Zod + tool_choice forced)
- [x] Add fallback handling for parse errors (static fallback reply, `AIParseError` class)
- [x] Implement SMS reply sending via Twilio REST API — `sendSms()` in `server/_core/twilio.ts`
- [x] Create conversation state transitions and persistence — full pipeline in `server/_core/handlers/twilioWebhook.ts`
- [x] Trigger lead log + in-app notification on `qualified` and `handoff_needed` transitions
- [x] Batch rapid-fire inbound SMS messages before calling AI (tutorial-style temporary holding queue)

## Operator Dashboard

- [x] Build dashboard overview page (stats: total conversations, qualified leads, pending handoffs)
- [x] Build conversations list page with filtering and sorting
- [x] Build conversation detail page with full message thread
- [x] Build leads/bookings log page with export to CSV
- [x] Implement mobile-responsive design for all dashboard pages
- [x] Add phone number masking in UI (except detail view)

## Account Settings & Management

- [x] Build settings page layout
- [x] Implement business profile editor (name, services, pricing, availability)
- [x] Implement AI persona editor (custom instructions)
- [x] Implement notification preferences editor
- [x] Add Twilio phone number field to Settings page (routes inbound SMS to this account)
- [x] Add webhook URL display and copy functionality
- [x] Implement account deletion (danger zone)

## In-App Notifications System

- [x] `createNotification` called from webhook handler on qualified lead and handoff events
- [x] Create notification fetching procedure (backend tRPC route)
- [x] Create notification marking as read procedure (backend tRPC route)
- [x] Build notification bell UI component in dashboard header
- [x] Display unread count badge on bell icon
- [x] Show notification list on click (dropdown or sidebar)

## Stripe Billing Integration

- [x] Define plan tiers: Starter ($49), Pro ($99), Agency ($249)
- [x] Create Stripe checkout flow
- [x] Implement Stripe webhook handlers (subscription.created, subscription.updated, subscription.deleted)
- [x] Build usage gating logic (check conversation count before processing webhook)
- [x] Create billing management page
- [x] Implement plan downgrade/upgrade flows

## Marketing Landing Page

- [x] Design and build hero section
- [x] Build features overview section (3+ feature blocks)
- [x] Build pricing table (Starter, Pro, Agency)
- [x] Build call-to-action button (Sign Up)
- [x] Implement elegant, polished aesthetic with refined typography
- [x] Ensure mobile responsiveness

## Testing & Quality

- [x] Write vitest tests for Twilio signature validation (`server/_core/twilio.test.ts`, 7 tests)
- [x] Write vitest tests for state machine (`server/_core/stateMachine.test.ts`, 37 table-driven tests)
- [x] Write vitest tests for AI engine (stub Anthropic client)
- [x] Write vitest tests for conversation routing
- [x] Write vitest tests for notification system
- [x] Write vitest tests for billing/usage gating
- [ ] Test Twilio webhook integration end-to-end (ngrok + real Twilio number)
- [ ] Test SMS sending and receiving flows

## Documentation & Deployment

- [x] Write comprehensive README with setup instructions
- [x] Create/update .env.example with all required variables (DATABASE_URL, JWT_SECRET, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, ANTHROPIC_API_KEY, WEBHOOK_BASE_URL, STRIPE_*)
- [x] Document API endpoints and webhook specifications
- [x] Document onboarding flow for new operators
- [x] Prepare deployment checklist

## Environment Variables Required

The following env vars must be set for the app to function:

```
DATABASE_URL=
JWT_SECRET=
TWILIO_ACCOUNT_SID=       # Platform Twilio account SID
TWILIO_AUTH_TOKEN=        # Platform Twilio auth token (used for sig validation + sending)
ANTHROPIC_API_KEY=        # Claude API key
WEBHOOK_BASE_URL=         # Public URL of this server, e.g. https://yourapp.com (no trailing slash)
                          # Must match the URL configured in the Twilio console exactly
APP_BASE_URL=             # Public app URL for Stripe checkout and billing portal returns
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_STARTER_PRICE_ID=
STRIPE_PRO_PRICE_ID=
STRIPE_AGENCY_PRICE_ID=
```

## New Files Added in Phase 1

| File                                     | Purpose                                                                             |
| ---------------------------------------- | ----------------------------------------------------------------------------------- |
| `drizzle/0003_twilio_fields.sql`         | Migration: adds twilioPhoneNumber + onboardingComplete to accounts                  |
| `server/_core/env.ts`                    | Updated: added TWILIO\_\* and ANTHROPIC_API_KEY vars                                |
| `server/_core/twilio.ts`                 | Twilio signature validation + sendSms()                                             |
| `server/_core/ai.ts`                     | Anthropic claude-haiku wrapper, record_intent tool, IntakeResult type, AIParseError |
| `server/_core/stateMachine.ts`           | Pure state transition function + isNewlyQualified/isNewlyHandoff helpers            |
| `server/_core/handlers/twilioWebhook.ts` | Main webhook handler (full pipeline)                                                |
| `server/_core/twilio.test.ts`            | Signature validation tests                                                          |
| `server/_core/stateMachine.test.ts`      | 37 table-driven state transition tests                                              |

## Modified Files in Phase 1

| File                            | Change                                                                    |
| ------------------------------- | ------------------------------------------------------------------------- |
| `drizzle/schema.ts`             | Added twilioPhoneNumber + onboardingComplete columns to accounts          |
| `drizzle/meta/_journal.json`    | Added 0003 migration entry                                                |
| `server/_core/index.ts`         | Mounted POST /api/webhook/twilio before tRPC                              |
| `server/db.ts`                  | Added getAccountByTwilioPhone(); added replyText param to createLeadLog() |
| `server/routers/accounts.ts`    | Added twilioPhoneNumber to update() input schema                          |
| `client/src/pages/Settings.tsx` | Added Twilio phone number input field + updated webhook card              |
| `package.json`                  | Added @anthropic-ai/sdk dependency                                        |

## Remaining Bugs / Known Issues

- [x] `accounts.test.ts` 3 tests fail because they hit a real DB — resolved with DB mocking
- [x] Phone number masking on non-detail screens not yet implemented
- [x] React navigation-in-render warnings in dashboard (navigate called during render)

## AI Training & Customization (Future)

- [x] Add AI persona version history and rollback capability
- [x] Build conversation feedback/rating system for training
- [x] Create conversation analysis dashboard for debugging AI responses
- [x] Add A/B testing framework for persona instructions
- [x] Implement real-time prompt editing without code changes
- [x] Build conversation replay tool to test AI fixes
- [x] Add conversation tagging system (works_well, needs_improvement, bug)
- [x] Create AI response quality metrics dashboard
- [x] Build prompt testing sandbox before deploying to production
- [x] Add conversation export for manual review and training
