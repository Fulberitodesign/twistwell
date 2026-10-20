# Twistwell

Twistwell writes stories and novels told in the first person ("I"), built around a strong hook, clear character dynamics, chapter cliffhangers and a fair twist. Every chapter has a number and a title, and the result is laid out like a real book with a cover. You can export it to Word or paste it into Google Docs with the layout intact.

## Languages

English, Français, Español, Deutsch, Italiano, Português, Nederlands, Polski, Русский, Türkçe, Kiswahili, Bahasa Indonesia, हिन्दी, 中文 (简体), 中文 (繁體), 日本語, 한국어. The writer works natively in each language (dialogue punctuation, gender agreement, chapter headings, "The End" / "To be continued"); Chinese and Japanese lengths are counted in characters.

## Story craft

Every plan and chapter follows eight rules: a strong opening, clear storytelling, real characters, conflict and tension, emotions and reactions, progression, pacing, and a strong ending. You choose the pace (fast, balanced, slow burn) and the ending (cliffhanger by default, or closed). "Check the story" scores a finished story on those eight points, with one concrete fix for each.

## How it works

- `public/` holds the website: `index.html` is the app and `shim.js` connects it to the server.
- `netlify/edge-functions/write.js` sends writing requests to the Anthropic API and streams the text back. The API key stays on Netlify and never reaches the browser.
- "Make it mine": paste or import a story (.txt, .md, .docx) and it is rewritten as the narrator's own first-person story, with every pronoun and verb fixed.
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
