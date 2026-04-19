import type { TLAssetContext, TLAssetId, TLAssetStore } from "tldraw"

// Custom TLAssetStore that holds the raw Blob bytes instead of a ~30%-larger
// base64 data URL string. Each asset's src is rewritten to `asset:<id>`,
// which is an allowed protocol per tldraw's imageAssetValidator. The actual
// object URL is minted lazily in resolve() and cached per-asset.
//
// Why: the default in-memory TLAssetStore calls FileHelpers.blobToDataUrl
// which stores the data URL string on asset.props.src for the asset's
// lifetime. JS strings are UTF-16, so a 5 MB PNG becomes ~13 MB in memory.
// Keeping the Blob backing and resolving to a blob: URL on demand cuts that
// ~60% for raster-heavy workloads (like our PDF page cache).

const ASSET_PREFIX = "asset:"

const blobs = new Map<TLAssetId, Blob>()
const urlCache = new Map<TLAssetId, string>()

function release(id: TLAssetId) {
  const url = urlCache.get(id)
  if (url) URL.revokeObjectURL(url)
  urlCache.delete(id)
  blobs.delete(id)
}

export const blobAssetStore: TLAssetStore = {
  async upload(asset, file) {
    blobs.set(asset.id, file)
    return { src: `${ASSET_PREFIX}${asset.id}` }
  },

  resolve(asset, _ctx: TLAssetContext) {
    const src = asset.props.src
    if (typeof src !== "string" || !src.startsWith(ASSET_PREFIX)) {
      return src ?? null
    }
    const id = src.slice(ASSET_PREFIX.length) as TLAssetId
    const cached = urlCache.get(id)
    if (cached) return cached
    const blob = blobs.get(id)
    if (!blob) return null
    const url = URL.createObjectURL(blob)
    urlCache.set(id, url)
    return url
  },

  async remove(assetIds) {
    for (const id of assetIds) release(id)
  },
}

// Exported for Canvas to call on unmount (e.g. a component mounting a
// fresh PDF). tldraw's built-in GC already fires remove() for orphaned
// records; this is the belt-and-suspenders path for a hard teardown.
export function disposeBlobAssets() {
  for (const url of urlCache.values()) URL.revokeObjectURL(url)
  urlCache.clear()
  blobs.clear()
}
