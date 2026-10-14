# Twistwell

Twistwell writes stories and novels built around a strong hook, clear character dynamics, chapter cliffhangers and a fair twist. Every chapter has a number and a title, and the result is laid out like a real book with a cover. You can export it to Word or paste it into Google Docs with the layout intact.

## How it works

- `public/` holds the website: `index.html` is the app and `shim.js` connects it to the server.
- `netlify/edge-functions/write.js` sends writing requests to the Anthropic API and streams the text back. The API key stays on Netlify and never reaches the browser.
- History is saved in each visitor's own browser.

## Settings (Netlify → Site configuration → Environment variables)

| Variable | Required | What it does |
|---|---|---|
| `ANTHROPIC_API_KEY` | yes | Your key from console.anthropic.com |
| `ACCESS_CODE` | no | If set, visitors must enter this code before writing |
| `RATE_LIMIT_PER_HOUR` | no | Requests allowed per visitor per hour (default 120) |
| `MODEL_QUICK`, `MODEL_DEFAULT`, `MODEL_COMPLEX` | no | Override the Claude models used |

After you change a variable, redeploy (Deploys → Trigger deploy) so the change takes effect.

**Set a monthly spending limit** in the Anthropic console (Settings → Limits). That is the real protection against unexpected costs on a public site.
