# CSP Test Website

Minimal **Node.js + Express** app that serves a realistic marketing site with configurable **Content-Security-Policy** response headers. Built for QA of page analyzers that detect CSP policies (especially `worker-src`) and for verifying **VWO SmartCode** on the same origin.

## Installation

```bash
cd csp-test
npm install
```

## Running the server

```bash
npm start
```

Server listens on **http://localhost:3000** (override with `PORT`).

`/` redirects to `/block-worker`.

**Site-wide rule:** every HTML route includes `worker-src 'none'`. CSP shapes can differ per page; Workers are always blocked.

## Available routes

| Route | Header | Policy focus |
| --- | --- | --- |
| `/block-worker` | `Content-Security-Policy` | Full VWO CSP + **`worker-src 'none'`**. |
| `/allow-worker` | `Content-Security-Policy` | Alternate VWO CSP shape — still **`worker-src 'none'`**. |
| `/report-only` | `Content-Security-Policy-Report-Only` | Same as block-worker, report-only + **`worker-src 'none'`**. |
| `/no-csp` | `Content-Security-Policy` | Minimal: **only** `worker-src 'none'`. |
| `/strict/block-worker` | `Content-Security-Policy` | `default-src 'self'; worker-src 'none'` (blocks VWO). |
| `/strict/allow-worker` | `Content-Security-Policy` | Same as strict/block — workers always blocked. |

Also:

- `GET /api/data` — sample JSON
- `GET /api/products` — product list
- `POST /api/contact` — contact form handler
- `GET /api/csp-routes` — machine-readable route map

## Expected CSP headers

### `/block-worker`

VWO SmartCode **allowed**; Workers **blocked** (`worker-src 'none'`).

Policy shape (nonce is generated per request):

```
script-src 'self' 'nonce-…' 'unsafe-inline' 'unsafe-eval' *.vwo.com *.visualwebsiteoptimizer.com *.wingify.com *.wingify.net …
style-src 'self' 'nonce-…' *.vwo.com *.visualwebsiteoptimizer.com *.wingify.net
img-src 'self' data: *.vwo.com *.visualwebsiteoptimizer.com *.vwo.io *.wingify.net
font-src 'self' data: *.vwo.io *.wingify.net
worker-src 'none'
```

Expected console violations (when VWO applies campaign changes):

- Inline `style` / `element.style` blocked (no `unsafe-inline` in `style-src`)
- `*.wingified.com` CSS / fonts / images blocked (host not allowlisted)

### `/allow-worker`

Alternate VWO host list — still **`worker-src 'none'`**.

### `/report-only`

```
Content-Security-Policy-Report-Only: (same policy as /block-worker, including worker-src 'none')
```

### `/no-csp`

```
Content-Security-Policy: worker-src 'none'
```

### Strict variants

Both use:

```
Content-Security-Policy: default-src 'self'; worker-src 'none'
```
## Verify headers with curl

```bash
curl -I http://localhost:3000/block-worker
curl -I http://localhost:3000/allow-worker
curl -I http://localhost:3000/report-only
curl -I http://localhost:3000/no-csp
curl -I http://localhost:3000/strict/block-worker
```

Look for `content-security-policy` or `content-security-policy-report-only` in the response.

## Worker check

On page load, `main.js` runs:

```js
new Worker('/worker.js');
```

- Success → console `[nimbus] Worker created successfully` and QA panel shows heartbeats.
- Failure / CSP → console warning plus `securitypolicyviolation` details when the browser reports them.

## VWO SmartCode

The page includes the same async VWO SmartCode pattern used elsewhere in this repo.

| Query | Effect |
| --- | --- |
| _(default)_ | Account `814397` via async SmartCode |
| `?id=ACCOUNT` | Override VWO account ID |
| `?sync` | Load sync library script |
| `?wingify` | Load Wingify edge SmartCode |
| `?wingify&prod` | Production edge tags URL |

Example:

```
http://localhost:3000/block-worker?id=814397
```

All HTML routes declare `worker-src 'none'`. VWO-allowing routes still permit SmartCode; Workers never run.

## Expose publicly with ngrok

```bash
ngrok http 3000
```

Point VWO / your analyzer at the HTTPS forwarding URL (register that host in VWO if needed).

## Project structure

```
csp-test/
├── package.json
├── server.js
├── README.md
└── public/
    ├── index.html
    ├── style.css
    ├── main.js
    ├── worker.js
    ├── logo.svg
    ├── favicon.ico
    └── assets/
        └── product-1.svg … product-6.svg
```

## Adding new CSP routes

Edit the `CSP_ROUTES` map in `server.js`, then restart:

```js
'/my-route': {
  header: 'Content-Security-Policy',
  value: "default-src 'self'; worker-src blob:;",
  description: 'Allow blob workers only',
},
```

## Notes

- CSP is set via **HTTP response headers only** (no `<meta http-equiv>`).
- Static assets (`/main.js`, `/worker.js`, images) are served without CSP so Workers and scripts can load when the HTML response policy permits them.
- The HTML page is intentionally dense (header, nav, hero, products, pricing, FAQ, contact, newsletter, cookie banner, footer, QA panel) for realistic DOM analysis.
