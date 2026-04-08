import type { BackgroundResponse } from '../../src/messages';

import '../../src/ui.css';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Callback root element was not found.');
}

const appRoot = app;

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function sendFinishPairingMessage(input: {
  deviceTokenId: string;
  spaceId: string;
  state: string;
  token: string;
}) {
  return new Promise<BackgroundResponse>((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        ...input,
        type: 'finish-pairing' as const,
      },
      (response: BackgroundResponse) => {
        const runtimeError = chrome.runtime.lastError;

        if (runtimeError) {
          reject(new Error(runtimeError.message));
          return;
        }

        resolve(response);
      },
    );
  });
}

async function main() {
  const hash = new URLSearchParams(window.location.hash.slice(1));
  const deviceTokenId = hash.get('deviceTokenId');
  const spaceId = hash.get('spaceId');
  const state = hash.get('state');
  const token = hash.get('token');

  if (!deviceTokenId || !spaceId || !state || !token) {
    renderError(
      'The pairing callback was missing the token details from Memory Vault.',
    );
    return;
  }

  try {
    const response = await sendFinishPairingMessage({
      deviceTokenId,
      spaceId,
      state,
      token,
    });

    if (!response.ok) {
      renderError(response.message);
      return;
    }

    renderSuccess();
    window.setTimeout(() => {
      window.close();
    }, 1000);
  } catch (error) {
    renderError(
      error instanceof Error
        ? error.message
        : 'The extension could not finish pairing.',
    );
  }
}

function renderError(message: string) {
  appRoot.innerHTML = `
    <div class="shell">
      <div class="card stack">
        <span class="eyebrow">Pairing failed</span>
        <div>
          <h1 class="title">Connection could not be completed</h1>
          <p class="body">${escapeHtml(message)}</p>
        </div>
        <div class="actions">
          <button class="button secondary" id="close">Close</button>
        </div>
      </div>
    </div>
  `;

  document
    .querySelector<HTMLButtonElement>('#close')
    ?.addEventListener('click', () => window.close());
}

function renderSuccess() {
  appRoot.innerHTML = `
    <div class="shell">
      <div class="card stack">
        <span class="eyebrow">Pairing complete</span>
        <div>
          <h1 class="title">Extension connected</h1>
          <p class="body">
            You can go back to the popup and start saving notes, pages, and highlighted text.
          </p>
        </div>
        <div class="actions">
          <button class="button secondary" id="close">Close</button>
        </div>
      </div>
    </div>
  `;

  document
    .querySelector<HTMLButtonElement>('#close')
    ?.addEventListener('click', () => window.close());
}

void main();
