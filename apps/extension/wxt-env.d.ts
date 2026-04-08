/// <reference path="./.wxt/wxt.d.ts" />

interface ImportMetaEnv {
  readonly WXT_PUBLIC_WEB_APP_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
