# WhatsApp Worker

This worker connects the Ayurveda Knowledge Library to WhatsApp Cloud API.

It receives WhatsApp questions, retrieves matching entries from the existing JSON knowledge base, applies the same safety posture as the web app, and then answers with either:

- OpenRouter, using a configured model such as a Hermes model
- A direct Hermes/OpenAI-compatible endpoint
- A rule-based fallback when no AI provider is configured

It is purpose-built educational support, not a general-purpose chatbot.

## Files

```text
whatsapp-worker/
├── package.json
├── wrangler.toml.example
├── src/
│   └── worker.js
└── test/
    └── answer.test.mjs
```

## Setup

1. Create a Cloudflare account.
2. Install dependencies:

```bash
npm install
```

3. Copy the example config:

```bash
cp wrangler.toml.example wrangler.toml
```

4. Set WhatsApp secrets:

```bash
npx wrangler secret put WHATSAPP_VERIFY_TOKEN
npx wrangler secret put WHATSAPP_ACCESS_TOKEN
npx wrangler secret put WHATSAPP_PHONE_NUMBER_ID
```

5. Set OpenRouter if using OpenRouter:

```bash
npx wrangler secret put OPENROUTER_API_KEY
```

In `wrangler.toml`, set:

```toml
AI_PROVIDER = "openrouter"
OPENROUTER_MODEL = "nousresearch/hermes-3-llama-3.1-405b"
```

Use the exact model id shown in your OpenRouter dashboard if different.

6. Or set direct Hermes if you have an OpenAI-compatible Hermes endpoint:

```bash
npx wrangler secret put HERMES_BASE_URL
npx wrangler secret put HERMES_API_KEY
```

In `wrangler.toml`, set:

```toml
AI_PROVIDER = "hermes"
HERMES_MODEL = "your-hermes-model"
```

7. Test locally:

```bash
npm test
npx wrangler dev
```

8. Deploy:

```bash
npx wrangler deploy
```

9. In Meta Developer Dashboard, set the WhatsApp webhook callback URL:

```text
https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev/webhook
```

Use the same verify token that you stored in `WHATSAPP_VERIFY_TOKEN`.

## Local Ask Test

After `wrangler dev`, test the answer engine without WhatsApp:

```bash
curl -X POST http://localhost:8787/ask \
  -H "Content-Type: application/json" \
  -d '{"message":"I have bloating after meals and no allergies"}'
```

## Safety Behavior

- Red flags return “seek medical care promptly” and suppress herb/formulation options.
- Pregnancy, children, liver disease, and kidney disease are hard-stop contexts.
- Medicine and allergy contexts show caution notes but can still return conservative educational options.
- The AI prompt is grounded only in retrieved internal library entries.
- The worker does not provide diagnosis, prescription, emergency treatment, bhasma/rasaushadhi suggestions, or dosages.
