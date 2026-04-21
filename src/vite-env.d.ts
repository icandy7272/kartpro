/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AMAP_JSAPI_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
