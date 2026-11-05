# IP Please

Extension for Brave / Chrome / Edge (Manifest V3) that checks your public IP at a set interval, detects its country and blocks the domains you choose whenever your IP isn't from an allowed country. It keeps you from opening sites that penalize VPNs, such as Facebook, while your VPN is on.

## Installation (developer mode)

Works in Brave, Chrome and Edge, version 120 or later (the `minimum_chrome_version` in `manifest.json`). It is not packaged for Firefox or Safari.

1. Get the code: `git clone https://github.com/hallo-w3lt/ip-please-extension.git`, or download the repository as a ZIP from GitHub and unzip it.
2. Open `brave://extensions`, `chrome://extensions` or `edge://extensions`.
3. Turn on **Developer mode**.
4. Click **Load unpacked** and select the folder you just got (the one that contains `manifest.json`).
5. Pin the icon to the toolbar. The badge shows the current country code:
   green = nothing blocked, red = some sites are blocked, gray = no country: `NoN` means there is no
   connection, `Err` means the check failed (the services answered with an error) and `?` means it hasn't been checked yet.

## Usage

1. Click the icon, then **⚙ Rules**, or right-click the icon and choose *Options*.
2. In **+ Add rule…**, pick a preset (Facebook, Instagram, ChatGPT, Steam…) or a blank rule.
3. Enter the domains, one per line. `facebook.com` also covers `www.facebook.com`, `m.facebook.com`, and so on.
4. Choose the condition:
   - **Allow only if my IP is from…**: an allowlist of countries (the usual choice).
   - **Block if my IP is from…**: a blocklist of countries.
5. Add the countries. The **+ My current country** button adds the country detected at that moment.

Changes are saved automatically.

**Language**: English and Spanish. Under *General → Language* you can choose *Automatic* (the default: Spanish if the browser is in Spanish, English otherwise), *English* or *Español*. The UI strings live in `i18n.js`; `_locales/` only translates the manifest's name and description.

## How blocking works

- **IP and country**: queries `cloudflare.com/cdn-cgi/trace` and, if that fails, `api.country.is`, `ipinfo.io` and `ipwho.is`. No API keys needed.
- **Saved IP**: the IP is checked every time, but the country is only re-resolved when the IP changes (or after 30 min, or when you press *Check now*). When it changes, the other services are asked about the same IP one at a time, and the country that two of them agree on wins (they stop being asked as soon as two agree, or after 5 seconds, in which case the first answer stands). That way one service with an outdated database can't leave you with a stale country.
- **Blocking**: uses `declarativeNetRequest`. The main page is redirected to a block page, and every other request (scripts, images, XHR, iframes) is blocked, even when another site makes it.
- **Open tabs**: if the country changes and a site becomes blocked, tabs that already have it open are sent to the block page.
- **Automatic unblock**: the block page waits and opens the site on its own as soon as your IP meets the rule again.
- **Check the IP on every visit** (on by default): when you open a protected site in a tab, it first goes through the check page, which verifies your IP at that moment. That way, a VPN you just turned on can't slip through between two periodic checks.
- **Block if the country can't be determined** (on by default): if there's no connection or the services fail, protected sites stay blocked.
- **On browser start**: the last known country is discarded and checked again.

## Privacy and permissions

Everything stays in your browser. There is no account, no analytics and no server of ours.

- **What is stored**: your rules and options, and the result of the last check (IP, country, which service answered, when). It lives in the extension's local storage (`chrome.storage.local`) on your machine and is not synced.
- **What is sent**: only the IP lookups. They go to Cloudflare, `api.country.is`, `ipinfo.io` and `ipwho.is`, which see your IP because that is what they geolocate. The services are tried in order and the first one that answers is used, so normally only Cloudflare is contacted. When your IP changes (or every 30 minutes, or when you press *Check now*), the next service is also asked about that same IP to confirm the country, and one more if the first two disagree, so usually two services are contacted. The requests carry no cookies and are never cached. The addresses of the sites you visit are never sent anywhere.
- **No page access**: the extension has no content scripts and does not read or change the pages you visit. It only redirects or blocks requests for the domains in your rules.

Why each permission is requested:

| Permission | Why |
| --- | --- |
| `storage` | Keep your rules, options and the last check. |
| `alarms` | Run the periodic check, because the background service worker can be put to sleep by the browser. |
| `declarativeNetRequest` | Block the domains in your rules, and send the main page to the block page, in the browser's network layer. |
| `notifications` | Tell you when sites become blocked or unblocked. You can turn it off under *General*. |
| Access to all sites (`<all_urls>`) | You choose the domains, so the extension cannot know them in advance. The browser requires site access to redirect a request, and to see the address of tabs that are already open so they can be sent to the block page. |

The block page (`gate.html`) has to be reachable from web pages for the redirect to work, so a website could in principle detect that the extension is installed.

## Limitations

- It runs in Chromium-based browsers only (see *Installation*).
- The country comes from geolocation databases. Sometimes it doesn't match what the site sees, especially with mobile IPs or "residential" VPN IPs.
- If your network has both IPv4 and IPv6, the site might see a different IP from the one that was checked.
- Mobile and desktop apps (for example, Messenger for desktop) don't go through the browser, so they aren't blocked.
- An already-authorized tab that stays open relies on the periodic check. At 30 s or 1 min, the window is small.

## Development

There is no build step and no dependencies: the extension is plain JavaScript modules. Edit a file, then press the reload button on the extension card in `brave://extensions` (or the equivalent page) to try it.

- `background.js`: the service worker. IP lookup, blocking rules, tab handling.
- `gate.html` / `gate.js`: the page that blocked and protected sites go through.
- `popup.*` and `options.*`: the toolbar popup and the settings page.
- `common.js`: shared helpers, the country list and the site presets.
- `i18n.js`: all UI strings, English and Spanish.

## Related

[my-country](https://github.com/hallo-w3lt/claude-plus-plus) is a Claude Code plugin that shows the country of your IP under the prompt, using the same lookup services.

## License

MIT. See [LICENSE](LICENSE).
