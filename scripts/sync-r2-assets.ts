import { HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import crypto from 'crypto'
import { mkdir, readdir, readFile, stat } from 'fs/promises'
import mime from 'mime-types'
import path from 'path'

const ASSET_ROOT = path.resolve(process.cwd(), 'r2-assets')

interface AssetFile {
  absPath: string
  key: string
}

async function getFiles(dir: string, prefix = ''): Promise<AssetFile[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const files: AssetFile[] = []
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    const absPath = path.join(dir, entry.name)
    const relKey = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      files.push(...(await getFiles(absPath, relKey)))
    } else {
      files.push({ absPath, key: relKey.replace(/\\/g, '/') })
    }
  }
  return files
}

function requiredEnv(varName: string) {
  const value = process.env[varName]
  if (!value) throw new Error(`Missing required environment variable: ${varName}`)
  return value
}

async function ensureAssetRootExists() {
  try {
    await mkdir(ASSET_ROOT, { recursive: true })
  } catch (err) {
    console.error('Failed to prepare asset directory', err)
    process.exitCode = 0
    return false
  }
  return true
}

async function main() {
  if (!(await ensureAssetRootExists())) return
  let stats
  try {
    stats = await stat(ASSET_ROOT)
  } catch (err) {
    console.warn(`[r2-sync] No r2-assets directory found at ${ASSET_ROOT}. Skipping sync.`)
    return
  }
  if (!stats.isDirectory()) {
    console.warn(`[r2-sync] Expected ${ASSET_ROOT} to be a directory. Skipping sync.`)
    return
  }

  const files = await getFiles(ASSET_ROOT)
  if (files.length === 0) {
    console.log('[r2-sync] No assets to sync. Skipping R2 upload.')
    return
  }

  const bucket = process.env.R2_BUCKET
  const accountId = process.env.R2_ACCOUNT_ID
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  const prefix = (process.env.R2_ASSET_PREFIX || '').replace(/^\/+|\/+$/g, '')

  if (!bucket || !accountId || !accessKeyId || !secretAccessKey) {
    console.warn('[r2-sync] R2 credentials not fully configured. Skipping upload.')
    return
  }

  const endpoint = process.env.R2_ENDPOINT || `https://${accountId}.r2.cloudflarestorage.com`
  const client = new S3Client({
    region: 'auto',
    endpoint,
    credentials: {
      accessKeyId: requiredEnv('R2_ACCESS_KEY_ID'),
      secretAccessKey: requiredEnv('R2_SECRET_ACCESS_KEY'),
    },
  })

  console.log(`[r2-sync] Uploading ${files.length} assets to bucket ${bucket}${prefix ? ` with prefix ${prefix}` : ''}`)
  for (const file of files) {
    const body = await readFile(file.absPath)
    const hash = crypto.createHash('sha256').update(body).digest('hex')
    const key = prefix ? `${prefix}/${file.key}` : file.key

    let needsUpload = true
    try {
      const head = await client.send(
        new HeadObjectCommand({
          Bucket: bucket,
          Key: key,
        })
      )
      const remoteHash = head.Metadata?.sha256 || head.Metadata?.SHA256
      if (remoteHash === hash) {
        needsUpload = false
        console.log(`[r2-sync] ✓ ${key} is up to date (sha256=${hash.slice(0, 8)}…)`)
      }
    } catch (err: any) {
      if (err?.$metadata?.httpStatusCode !== 404) {
        console.warn(`[r2-sync] Could not check existing object ${key}:`, err?.message || err)
      }
    }

    if (!needsUpload) continue

    const contentType = mime.lookup(file.absPath) || 'application/octet-stream'
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        Metadata: { sha256: hash },
      })
    )
    console.log(
      `[r2-sync] ↑ Uploaded ${key} (${(body.byteLength / 1024 / 1024).toFixed(2)} MiB) with sha256=${hash.slice(0, 8)}…`
    )
  }
}

main().catch((err) => {
  console.error('[r2-sync] Failed to sync assets to R2:', err)
  process.exit(1)
})
