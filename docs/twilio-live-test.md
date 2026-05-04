# Twilio Live Test Checklist

Use this when a real Twilio number and public tunnel are available.

## Setup

1. Start the app locally:

```bash
pnpm dev
```

2. Start a public tunnel to the app port:

```bash
ngrok http 3000
```

3. Set environment variables and restart the app:

```bash
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
WEBHOOK_BASE_URL=https://your-ngrok-domain.ngrok-free.app
ANTHROPIC_API_KEY=...
SMS_BATCH_WINDOW_MS=5000
```

4. In the dashboard, open `Settings` and set the account Twilio phone number in E.164 format.

5. In Twilio Console, configure the number's incoming message webhook:

```text
POST https://your-ngrok-domain.ngrok-free.app/api/webhook/twilio
```

## Inbound SMS Flow

1. Send a text from a personal phone to the Twilio number.
2. Send two more short texts within 5 seconds.
3. Confirm the app creates or updates one conversation in `Conversations`.
4. Confirm the inbound user message is visible in conversation detail as one combined batch.
5. Confirm the assistant response is visible in the message thread.
6. Confirm one reply SMS arrives on the personal phone.

## Lead And Notification Flow

1. Send enough details to qualify a lead: name, service, preferred date/time, and contact method.
2. Confirm the conversation status becomes `qualified`.
3. Confirm a lead appears in `Leads`.
4. Confirm the notification bell shows a new unread notification.

## Billing Gate Flow

1. Put the account on `trial`.
2. Seed or create enough new monthly conversations to reach the trial limit.
3. Send an SMS from a new phone number.
4. Confirm the app does not create a new conversation.
5. Confirm a system notification records that the conversation limit was reached.

## Pass Criteria

- Twilio signature validation accepts the real webhook and rejects forged requests.
- Incoming SMS routes to the correct account by Twilio number.
- Rapid-fire texts are batched into one AI turn.
- AI replies are persisted and sent by Twilio REST.
- Lead and handoff state transitions create notifications.
- Usage gating pauses new conversations after the monthly limit.
