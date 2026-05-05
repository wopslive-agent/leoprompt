# Leoprompt Concierge

Leoprompt Concierge is an SMS intake and lead qualification dashboard for service businesses. Operators configure their business profile, connect a Twilio number, let the AI collect customer details, and review qualified leads, handoffs, conversations, notifications, and billing from the dashboard.

## Quick Start

```bash
pnpm install
cp .env.example .env
pnpm dev
```

Open `http://localhost:3000`.

If `DATABASE_URL` is not configured, the app runs in local demo mode with in-memory data. Use:

```text
Email: demo@leoprompt.local
Password: password123
```

## Environment

Required for production:

```bash
DATABASE_URL=mysql://user:password@host:3306/leoprompt
JWT_SECRET=replace-with-a-long-random-secret
APP_BASE_URL=https://yourapp.com
WEBHOOK_BASE_URL=https://yourapp.com
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
ANTHROPIC_API_KEY=...
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_STARTER_PRICE_ID=price_...
STRIPE_PRO_PRICE_ID=price_...
STRIPE_AGENCY_PRICE_ID=price_...
```

`APP_BASE_URL` is used for Stripe checkout and billing portal return URLs. `WEBHOOK_BASE_URL` must match the public URL configured in Twilio for signature validation.

## Scripts

```bash
pnpm dev       # Run Express + Vite in development
pnpm check     # TypeScript checks
pnpm test      # Vitest suite
pnpm build     # Production client and server bundle
pnpm start     # Run the built server
pnpm db:push   # Generate and run Drizzle migrations
```

## Onboarding

1. Sign up with name, email, and password.
2. Complete the onboarding wizard with business name, services, pricing, availability, and AI persona.
3. Add a Twilio phone number in `Settings`.
4. Configure that Twilio number's incoming message webhook to:

```text
POST https://yourapp.com/api/webhook/twilio
```

5. Pick or manage a plan in `Billing`.

## API Surface

Browser API calls go through tRPC at:

```text
/api/trpc
```

Main routers:

- `auth.me`, `auth.logout`
- `accounts.getOrCreate`, `accounts.update`, `accounts.completeOnboarding`, `accounts.deleteCurrent`
- `conversations.list`, `conversations.getDetail`, `conversations.updateStatus`, `conversations.addNote`
- `leads.list`
- `notifications.list`, `notifications.unreadCount`, `notifications.markAsRead`, `notifications.markAllAsRead`
- `billing.plans`, `billing.current`, `billing.createCheckoutSession`, `billing.changePlan`, `billing.createPortalSession`
- `aiTraining.personaVersions`, `aiTraining.restorePersonaVersion`, `aiTraining.getConversationReview`, `aiTraining.saveFeedback`, `aiTraining.setTags`, `aiTraining.analytics`, `aiTraining.promptSandbox`, `aiTraining.comparePrompts`, `aiTraining.exportConversation`

Webhook endpoints:

```text
POST /api/webhook/twilio
POST /api/webhook/stripe
```

## Webhooks

### Twilio

Twilio sends `application/x-www-form-urlencoded` fields including `From`, `To`, `Body`, and `MessageSid`. The server validates `X-Twilio-Signature`, routes the message by the operator account's configured Twilio or WhatsApp number, checks billing usage before creating a new conversation, runs the AI intake flow, persists messages, and sends the reply through Twilio REST.

### Stripe

Stripe sends `application/json` with a `Stripe-Signature` header. The server uses the raw request body and `STRIPE_WEBHOOK_SECRET` to verify events, then syncs account billing state for:

- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`

## Billing Plans

| Plan    | Price   | Monthly new SMS conversations |
| ------- | ------- | ----------------------------- |
| Starter | $49/mo  | 100                           |
| Pro     | $99/mo  | 500                           |
| Agency  | $249/mo | 2,500                         |

Local demo mode activates plan changes immediately when Stripe keys or price IDs are not configured. Production mode uses Stripe Checkout for new subscriptions and Stripe subscription updates for plan changes.

## AI Training

The dashboard includes an `AI Training` area for reviewing response quality and testing prompt changes:

- Persona edits are versioned and can be restored from `Settings`.
- Conversation detail pages support feedback ratings, review comments, tags, and clipboard export.
- The AI Training dashboard summarizes feedback, tags, parse errors, and low-confidence responses.
- Prompt sandbox and A/B testing can replay recent conversation context against proposed persona instructions.

## Deployment Checklist

- Provision MySQL and set `DATABASE_URL`.
- Run `pnpm db:push` against the production database.
- Set `JWT_SECRET` to a strong random value.
- Set Anthropic, Twilio, and Stripe environment variables.
- Configure Twilio incoming SMS webhook as `POST /api/webhook/twilio`.
- Configure Stripe webhook as `POST /api/webhook/stripe`.
- Verify `APP_BASE_URL` and `WEBHOOK_BASE_URL` use the exact public origin.
- Run `pnpm check`, `pnpm test`, and `pnpm build`.
- Smoke test signup, onboarding, dashboard access, Stripe checkout, Twilio inbound SMS, and lead notification creation.

For the real SMS verification pass, use [docs/twilio-live-test.md](docs/twilio-live-test.md).
