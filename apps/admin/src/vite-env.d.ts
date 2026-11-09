/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** `test` on the free test deployment (banner). Set at build time. */
  readonly VITE_DEPLOYMENT_ENVIRONMENT?: 'local' | 'test' | 'production';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
