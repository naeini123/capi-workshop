# CAPI Workshop

A Meta Pixel demo e-commerce site with a Node.js/Express server — ready for server-side Conversions API (CAPI) integration.

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Fill in your values in `.env`. The `PORT` variable is optional and defaults to `3000`.

### 3. Start the server

```bash
# Production
npm start

# Development (auto-restarts on file changes)
npm run dev
```

The site will be available at `http://localhost:3000`.

## Pixel Events Tracked

| Event | Trigger |
| :--- | :--- |
| `PageView` | Every page load |
| `ViewContent` | User clicks on a product |
| `AddToCart` | User adds a product to cart |
| `InitiateCheckout` | User clicks checkout button |
| `Purchase` | User completes purchase |

**Pixel ID:** `935724062207149`

## Adding CAPI

The server is structured to make CAPI integration straightforward:

1. Add your `META_PIXEL_ID`, `META_ACCESS_TOKEN`, and optionally `META_TEST_EVENT_CODE` to `.env`
2. Create a `capi.js` module in the project root with your server-side event sending logic
3. Add API routes in `server.js` to receive event data from the browser and forward to Meta
