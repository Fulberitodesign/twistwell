# Twistwell

Twistwell writes stories and novels built around a strong hook, clear character dynamics, chapter cliffhangers and a fair twist. Every chapter has a number and a title, and the result is laid out like a real book with a cover. You can export it to Word or paste it into Google Docs with the layout intact.

## How it works

- It's a static site: everything is in `public/` (`index.html` is the app, `shim.js` connects it to the writing service).
- Writing runs through [Puter.js](https://docs.puter.com). Each visitor signs in to their own Puter account and their use goes on that account. The site needs no API key and costs its owner nothing.
- History is saved in each visitor's own browser.

## Deploy

On Netlify, import this repository. There is no build command; the publish folder is `public` (already set in `netlify.toml`).
