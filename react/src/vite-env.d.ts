/// <reference types="vite/client" />

/** Typed access to the build-time environment (see .env.example). */
interface ImportMetaEnv {
  /** Base URL of the wallet API, e.g. http://localhost:4000/api/v1 */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
