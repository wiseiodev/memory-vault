# Chrome Extension Setup

This walkthrough covers how to load the Memory Vault Chrome extension in your
browser and connect it to the local web app.

The extension lives in `apps/extension` and builds to
`apps/extension/dist/chrome-mv3`.

## Quick local setup

Use this path if you just want the extension running against your local web
app.

### 1. Start the web app

From the repo root:

```bash
pnpm --filter web dev
```

By default, the extension expects the web app at `http://localhost:3000`.
If `BETTER_AUTH_URL` is set when you build, that value is used instead.

### 2. Build the extension

From the repo root:

```bash
pnpm --filter extension build
```

This produces an unpacked Chrome extension in:

```text
apps/extension/dist/chrome-mv3
```

### 3. Load the unpacked extension in Chrome

1. Open `chrome://extensions`
2. Turn on `Developer mode`
3. Click `Load unpacked`
4. Select:

```text
/Users/wise/dev/memories/apps/extension/dist/chrome-mv3
```

Once Chrome loads it, copy the generated extension ID from the extension card.

### 4. Allowlist that extension ID in the web app

The web app only accepts pairing requests from allowlisted extension IDs.

Add this to your web app environment, usually `apps/web/.env.local`:

```bash
CHROME_EXTENSION_IDS=your_extension_id_here
```

If you already have other IDs in the allowlist, use a comma-separated list:

```bash
CHROME_EXTENSION_IDS=id_one,id_two,id_three
```

Then restart the web app so Next picks up the new env var.

### 5. Connect the extension

1. Open the extension popup
2. Click `Connect extension`
3. Chrome opens the Memory Vault pairing page
4. Sign in if needed
5. Click `Connect extension` on the confirmation screen
6. The callback page closes the loop and stores the device token in the
   extension

After that, the popup should show the extension as connected.

### 6. Verify the capture flows

Once connected, test the three supported actions:

1. `Save note`
2. `Save page`
3. `Save selection`

For `Save selection`, highlight text on the active page before clicking the
button.

## When you need custom web origins

If the web app is not running on `http://localhost:3000`, set
`BETTER_AUTH_URL` before building the extension:

```bash
BETTER_AUTH_URL=https://your-web-origin.example pnpm --filter extension build
```

The extension reads that value at build time, not at runtime.

If you change it, rebuild the extension and reload it in `chrome://extensions`.

## Stable ID setup

For a more stable dev or shared setup, you can pin the extension ID by building
with a Chrome extension key:

```bash
CHROME_EXTENSION_KEY=your_stable_extension_key pnpm --filter extension build
```

When you do that:

1. Build the extension with the key
2. Load the unpacked build in Chrome
3. Copy the resulting extension ID once
4. Add that ID to `CHROME_EXTENSION_IDS` on the web app
5. Keep using the same `CHROME_EXTENSION_KEY` for future builds

If you skip `CHROME_EXTENSION_KEY`, Chrome will still load the unpacked
extension, but the ID is not something you should treat as portable across
other environments.

## S3 upload permissions

Page and selection capture upload HTML snapshots directly to S3.

The extension build will work with the default wildcard Amazon host permission,
but if you want the build to use the exact bucket endpoints, export these before
building:

```bash
AWS_REGION=us-west-2
MEMORY_VAULT_BLOB_BUCKET=your_bucket_name
```

The server side also needs the deployed bucket CORS config from `stacks/bucket-stack.ts`
so Chrome can upload snapshots successfully.

## Reloading after changes

If you make extension code changes:

1. Rebuild:

```bash
pnpm --filter extension build
```

2. Go back to `chrome://extensions`
3. Click the reload button on the Memory Vault extension card

## Troubleshooting

### "This Chrome extension is not allowlisted."

The browser extension ID is missing from `CHROME_EXTENSION_IDS`, or the web app
was not restarted after you changed that env var.

### The popup opens the wrong web app origin

Rebuild with:

```bash
BETTER_AUTH_URL=https://your-web-origin.example pnpm --filter extension build
```

Then reload the unpacked extension.

### Pairing succeeds but page saves fail

Check these first:

1. The web app has working blob storage env vars
2. The bucket stack with extension CORS has been deployed
3. The active tab is a normal `http` or `https` page

Unsupported pages such as `chrome://...`, the Chrome Web Store, and PDF tabs
will fail by design in this first version.

### Save selection says nothing is selected

Highlight text in the active page first, then reopen the popup or click
`Save selection` again.
