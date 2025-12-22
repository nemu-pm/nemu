#!/usr/bin/env bun
/**
 * Detailed OkHttp usage analysis for Tachiyomi extensions
 */

import { readdir, readFile } from "fs/promises";
import { join, relative } from "path";

const EXTENSIONS_ROOT = "vendor/keiyoushi/extensions-source";

async function* walkKotlinFiles(dir: string): AsyncGenerator<string> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "build" || entry.name === ".gradle") continue;
      yield* walkKotlinFiles(fullPath);
    } else if (entry.name.endsWith(".kt")) {
      yield fullPath;
    }
  }
}

interface OkHttpUsage {
  // Request building
  requestBuilder: number;
  getRequests: number;
  postRequests: number;
  putRequests: number;
  deleteRequests: number;
  headRequests: number;

  // URL handling
  toHttpUrl: number;
  httpUrlBuilder: number;
  addQueryParameter: number;
  addPathSegment: number;
  addEncodedQueryParameter: number;

  // Headers
  headersBuilder: number;
  addHeader: number;
  header: number;
  removeHeader: number;

  // Body
  formBodyBuilder: number;
  multipartBodyBuilder: number;
  toRequestBody: number;
  requestBodyCreate: number;
  toMediaType: number;

  // Client & execution
  newCall: number;
  execute: number;
  enqueue: number;
  newBuilder: number;

  // Response handling
  responseBody: number;
  responseCode: number;
  responseHeaders: number;
  responseIsSuccessful: number;
  bodyString: number;
  bodyBytes: number;
  bodyByteStream: number;
  bodySource: number;
  bodyClose: number;

  // Interceptors
  interceptorUsage: number;
  rateLimitInterceptor: number;
  customInterceptors: string[];

  // Cache
  cacheControl: number;
  noCache: number;
  noStore: number;

  // Advanced
  cookieJar: number;
  dns: number;
  proxy: number;
  sslSocketFactory: number;
  hostnameVerifier: number;
  connectionPool: number;
  dispatcher: number;
  followRedirects: number;
  followSslRedirects: number;
  retryOnConnectionFailure: number;
  callTimeout: number;
  connectTimeout: number;
  readTimeout: number;
  writeTimeout: number;

  // WebSocket
  webSocket: number;

  // Files with patterns
  filesUsingInterceptors: Set<string>;
  filesUsingFormBody: Set<string>;
  filesUsingMultipart: Set<string>;
  filesUsingWebSocket: Set<string>;
}

function createEmptyUsage(): OkHttpUsage {
  return {
    requestBuilder: 0,
    getRequests: 0,
    postRequests: 0,
    putRequests: 0,
    deleteRequests: 0,
    headRequests: 0,
    toHttpUrl: 0,
    httpUrlBuilder: 0,
    addQueryParameter: 0,
    addPathSegment: 0,
    addEncodedQueryParameter: 0,
    headersBuilder: 0,
    addHeader: 0,
    header: 0,
    removeHeader: 0,
    formBodyBuilder: 0,
    multipartBodyBuilder: 0,
    toRequestBody: 0,
    requestBodyCreate: 0,
    toMediaType: 0,
    newCall: 0,
    execute: 0,
    enqueue: 0,
    newBuilder: 0,
    responseBody: 0,
    responseCode: 0,
    responseHeaders: 0,
    responseIsSuccessful: 0,
    bodyString: 0,
    bodyBytes: 0,
    bodyByteStream: 0,
    bodySource: 0,
    bodyClose: 0,
    interceptorUsage: 0,
    rateLimitInterceptor: 0,
    customInterceptors: [],
    cacheControl: 0,
    noCache: 0,
    noStore: 0,
    cookieJar: 0,
    dns: 0,
    proxy: 0,
    sslSocketFactory: 0,
    hostnameVerifier: 0,
    connectionPool: 0,
    dispatcher: 0,
    followRedirects: 0,
    followSslRedirects: 0,
    retryOnConnectionFailure: 0,
    callTimeout: 0,
    connectTimeout: 0,
    readTimeout: 0,
    writeTimeout: 0,
    webSocket: 0,
    filesUsingInterceptors: new Set(),
    filesUsingFormBody: new Set(),
    filesUsingMultipart: new Set(),
    filesUsingWebSocket: new Set(),
  };
}

function countPattern(content: string, pattern: RegExp): number {
  return (content.match(pattern) || []).length;
}

async function analyzeFile(
  filePath: string,
  content: string,
  usage: OkHttpUsage
) {
  const relPath = relative(EXTENSIONS_ROOT, filePath);

  // Request building
  usage.requestBuilder += countPattern(content, /Request\.Builder\s*\(/g);
  usage.getRequests += countPattern(content, /\.get\s*\(\s*\)/g);
  usage.postRequests += countPattern(content, /\.post\s*\(/g);
  usage.putRequests += countPattern(content, /\.put\s*\(/g);
  usage.deleteRequests += countPattern(content, /\.delete\s*\(/g);
  usage.headRequests += countPattern(content, /\.head\s*\(\s*\)/g);

  // Also count GET/POST helper functions
  usage.getRequests += countPattern(content, /\bGET\s*\(/g);
  usage.postRequests += countPattern(content, /\bPOST\s*\(/g);

  // URL handling
  usage.toHttpUrl += countPattern(content, /\.toHttpUrl\s*\(/g);
  usage.httpUrlBuilder += countPattern(content, /HttpUrl\.Builder\s*\(/g);
  usage.addQueryParameter += countPattern(content, /\.addQueryParameter\s*\(/g);
  usage.addPathSegment += countPattern(content, /\.addPathSegment\s*\(/g);
  usage.addEncodedQueryParameter += countPattern(
    content,
    /\.addEncodedQueryParameter\s*\(/g
  );

  // Headers
  usage.headersBuilder += countPattern(content, /Headers\.Builder\s*\(/g);
  usage.addHeader += countPattern(content, /\.addHeader\s*\(/g);
  usage.header += countPattern(content, /\.header\s*\(/g);
  usage.removeHeader += countPattern(content, /\.removeHeader\s*\(/g);

  // Body
  const formBodyCount = countPattern(content, /FormBody\.Builder\s*\(/g);
  usage.formBodyBuilder += formBodyCount;
  if (formBodyCount > 0) usage.filesUsingFormBody.add(relPath);

  const multipartCount = countPattern(content, /MultipartBody\.Builder\s*\(/g);
  usage.multipartBodyBuilder += multipartCount;
  if (multipartCount > 0) usage.filesUsingMultipart.add(relPath);

  usage.toRequestBody += countPattern(content, /\.toRequestBody\s*\(/g);
  usage.requestBodyCreate += countPattern(content, /RequestBody\.create\s*\(/g);
  usage.toMediaType += countPattern(content, /\.toMediaType\s*\(/g);

  // Client & execution
  usage.newCall += countPattern(content, /\.newCall\s*\(/g);
  usage.execute += countPattern(content, /\.execute\s*\(/g);
  usage.enqueue += countPattern(content, /\.enqueue\s*\(/g);
  usage.newBuilder += countPattern(content, /client\.newBuilder\s*\(/g);

  // Response handling
  usage.responseBody += countPattern(content, /response\.body/g);
  usage.responseCode += countPattern(content, /response\.code/g);
  usage.responseHeaders += countPattern(content, /response\.headers/g);
  usage.responseIsSuccessful += countPattern(content, /response\.isSuccessful/g);
  usage.bodyString += countPattern(content, /\.body\??\.string\s*\(/g);
  usage.bodyBytes += countPattern(content, /\.body\??\.bytes\s*\(/g);
  usage.bodyByteStream += countPattern(content, /\.body\??\.byteStream\s*\(/g);
  usage.bodySource += countPattern(content, /\.body\??\.source\s*\(/g);
  usage.bodyClose += countPattern(content, /\.body\??\.close\s*\(/g);

  // Interceptors
  const interceptorCount = countPattern(content, /Interceptor/g);
  usage.interceptorUsage += interceptorCount;
  if (interceptorCount > 0) usage.filesUsingInterceptors.add(relPath);

  usage.rateLimitInterceptor += countPattern(content, /rateLimit\s*\(/g);

  // Find custom interceptor implementations
  const interceptorMatches = content.matchAll(
    /class\s+(\w+)\s*(?:\([^)]*\))?\s*:\s*Interceptor/g
  );
  for (const match of interceptorMatches) {
    if (!usage.customInterceptors.includes(match[1])) {
      usage.customInterceptors.push(match[1]);
    }
  }

  // Cache
  usage.cacheControl += countPattern(content, /CacheControl/g);
  usage.noCache += countPattern(content, /\.noCache\s*\(/g);
  usage.noStore += countPattern(content, /\.noStore\s*\(/g);

  // Advanced client options
  usage.cookieJar += countPattern(content, /\.cookieJar\s*\(/g);
  usage.dns += countPattern(content, /\.dns\s*\(/g);
  usage.proxy += countPattern(content, /\.proxy\s*\(/g);
  usage.sslSocketFactory += countPattern(content, /\.sslSocketFactory\s*\(/g);
  usage.hostnameVerifier += countPattern(content, /\.hostnameVerifier\s*\(/g);
  usage.connectionPool += countPattern(content, /\.connectionPool\s*\(/g);
  usage.dispatcher += countPattern(content, /\.dispatcher\s*\(/g);
  usage.followRedirects += countPattern(content, /\.followRedirects\s*\(/g);
  usage.followSslRedirects += countPattern(
    content,
    /\.followSslRedirects\s*\(/g
  );
  usage.retryOnConnectionFailure += countPattern(
    content,
    /\.retryOnConnectionFailure\s*\(/g
  );
  usage.callTimeout += countPattern(content, /\.callTimeout\s*\(/g);
  usage.connectTimeout += countPattern(content, /\.connectTimeout\s*\(/g);
  usage.readTimeout += countPattern(content, /\.readTimeout\s*\(/g);
  usage.writeTimeout += countPattern(content, /\.writeTimeout\s*\(/g);

  // WebSocket
  const wsCount = countPattern(content, /WebSocket|newWebSocket/g);
  usage.webSocket += wsCount;
  if (wsCount > 0) usage.filesUsingWebSocket.add(relPath);
}

async function main() {
  console.log("Analyzing OkHttp usage patterns...\n");

  const usage = createEmptyUsage();
  let fileCount = 0;

  // Analyze src directory
  for await (const file of walkKotlinFiles(join(EXTENSIONS_ROOT, "src"))) {
    const content = await readFile(file, "utf-8");
    if (content.includes("okhttp3") || content.includes("OkHttpClient")) {
      await analyzeFile(file, content, usage);
      fileCount++;
    }
  }

  // Also check lib directory
  for await (const file of walkKotlinFiles(join(EXTENSIONS_ROOT, "lib"))) {
    const content = await readFile(file, "utf-8");
    if (content.includes("okhttp3") || content.includes("OkHttpClient")) {
      await analyzeFile(file, content, usage);
      fileCount++;
    }
  }

  console.log(`Files using OkHttp: ${fileCount}\n`);

  console.log("=== REQUEST BUILDING ===\n");
  console.log(`   Request.Builder(): ${usage.requestBuilder}`);
  console.log(`   GET requests: ${usage.getRequests}`);
  console.log(`   POST requests: ${usage.postRequests}`);
  console.log(`   PUT requests: ${usage.putRequests}`);
  console.log(`   DELETE requests: ${usage.deleteRequests}`);
  console.log(`   HEAD requests: ${usage.headRequests}`);

  console.log("\n=== URL BUILDING ===\n");
  console.log(`   .toHttpUrl(): ${usage.toHttpUrl}`);
  console.log(`   HttpUrl.Builder(): ${usage.httpUrlBuilder}`);
  console.log(`   .addQueryParameter(): ${usage.addQueryParameter}`);
  console.log(`   .addEncodedQueryParameter(): ${usage.addEncodedQueryParameter}`);
  console.log(`   .addPathSegment(): ${usage.addPathSegment}`);

  console.log("\n=== HEADERS ===\n");
  console.log(`   Headers.Builder(): ${usage.headersBuilder}`);
  console.log(`   .addHeader(): ${usage.addHeader}`);
  console.log(`   .header(): ${usage.header}`);
  console.log(`   .removeHeader(): ${usage.removeHeader}`);

  console.log("\n=== REQUEST BODY ===\n");
  console.log(`   FormBody.Builder(): ${usage.formBodyBuilder} (${usage.filesUsingFormBody.size} files)`);
  console.log(`   MultipartBody.Builder(): ${usage.multipartBodyBuilder} (${usage.filesUsingMultipart.size} files)`);
  console.log(`   .toRequestBody(): ${usage.toRequestBody}`);
  console.log(`   RequestBody.create(): ${usage.requestBodyCreate}`);
  console.log(`   .toMediaType(): ${usage.toMediaType}`);

  console.log("\n=== CLIENT & EXECUTION ===\n");
  console.log(`   .newCall(): ${usage.newCall}`);
  console.log(`   .execute(): ${usage.execute}`);
  console.log(`   .enqueue(): ${usage.enqueue} (async callbacks)`);
  console.log(`   client.newBuilder(): ${usage.newBuilder}`);

  console.log("\n=== RESPONSE HANDLING ===\n");
  console.log(`   response.body: ${usage.responseBody}`);
  console.log(`   response.code: ${usage.responseCode}`);
  console.log(`   response.headers: ${usage.responseHeaders}`);
  console.log(`   response.isSuccessful: ${usage.responseIsSuccessful}`);
  console.log(`   .body?.string(): ${usage.bodyString}`);
  console.log(`   .body?.bytes(): ${usage.bodyBytes}`);
  console.log(`   .body?.byteStream(): ${usage.bodyByteStream}`);
  console.log(`   .body?.source(): ${usage.bodySource}`);
  console.log(`   .body?.close(): ${usage.bodyClose}`);

  console.log("\n=== INTERCEPTORS ===\n");
  console.log(`   Interceptor usage: ${usage.interceptorUsage} (${usage.filesUsingInterceptors.size} files)`);
  console.log(`   rateLimit(): ${usage.rateLimitInterceptor}`);
  console.log(`   Custom interceptors found: ${usage.customInterceptors.length}`);
  if (usage.customInterceptors.length > 0) {
    console.log(`   Classes: ${usage.customInterceptors.slice(0, 20).join(", ")}${usage.customInterceptors.length > 20 ? "..." : ""}`);
  }

  console.log("\n=== CACHE CONTROL ===\n");
  console.log(`   CacheControl: ${usage.cacheControl}`);
  console.log(`   .noCache(): ${usage.noCache}`);
  console.log(`   .noStore(): ${usage.noStore}`);

  console.log("\n=== CLIENT CONFIGURATION ===\n");
  console.log(`   .cookieJar(): ${usage.cookieJar}`);
  console.log(`   .dns(): ${usage.dns}`);
  console.log(`   .proxy(): ${usage.proxy}`);
  console.log(`   .sslSocketFactory(): ${usage.sslSocketFactory}`);
  console.log(`   .hostnameVerifier(): ${usage.hostnameVerifier}`);
  console.log(`   .connectionPool(): ${usage.connectionPool}`);
  console.log(`   .dispatcher(): ${usage.dispatcher}`);
  console.log(`   .followRedirects(): ${usage.followRedirects}`);
  console.log(`   .followSslRedirects(): ${usage.followSslRedirects}`);
  console.log(`   .retryOnConnectionFailure(): ${usage.retryOnConnectionFailure}`);

  console.log("\n=== TIMEOUTS ===\n");
  console.log(`   .callTimeout(): ${usage.callTimeout}`);
  console.log(`   .connectTimeout(): ${usage.connectTimeout}`);
  console.log(`   .readTimeout(): ${usage.readTimeout}`);
  console.log(`   .writeTimeout(): ${usage.writeTimeout}`);

  console.log("\n=== WEBSOCKET ===\n");
  console.log(`   WebSocket usage: ${usage.webSocket} (${usage.filesUsingWebSocket.size} files)`);
  if (usage.filesUsingWebSocket.size > 0) {
    console.log(`   Files: ${[...usage.filesUsingWebSocket].join(", ")}`);
  }

  // Summary
  console.log("\n=== SUMMARY: WHAT SHIM NEEDS TO SUPPORT ===\n");

  console.log("MUST HAVE (high usage):");
  console.log("  ✓ Request/Response basics (build, execute, read body)");
  console.log("  ✓ GET/POST with headers");
  console.log("  ✓ URL building with query params");
  console.log("  ✓ FormBody for POST forms");
  console.log("  ✓ Interceptor chain (rate limiting, headers)");
  console.log("  ✓ response.body.string() / bytes()");

  console.log("\nNICE TO HAVE (moderate usage):");
  if (usage.multipartBodyBuilder > 0)
    console.log(`  - MultipartBody (${usage.multipartBodyBuilder} usages)`);
  if (usage.bodyByteStream > 0)
    console.log(`  - body.byteStream() (${usage.bodyByteStream} usages)`);
  if (usage.bodySource > 0)
    console.log(`  - body.source() / okio (${usage.bodySource} usages)`);

  console.log("\nRARELY USED (can stub/ignore):");
  if (usage.enqueue > 0)
    console.log(`  - enqueue() async (${usage.enqueue} usages) - extensions mostly sync`);
  if (usage.webSocket > 0)
    console.log(`  - WebSocket (${usage.webSocket} usages in ${usage.filesUsingWebSocket.size} files)`);
  if (usage.cookieJar > 0) console.log(`  - cookieJar (${usage.cookieJar})`);
  if (usage.dns > 0) console.log(`  - dns (${usage.dns})`);
  if (usage.proxy > 0) console.log(`  - proxy (${usage.proxy})`);
  if (usage.sslSocketFactory > 0)
    console.log(`  - sslSocketFactory (${usage.sslSocketFactory})`);
}

main().catch(console.error);

