const isDev = import.meta.env.DEV;

export const SERVICE_URL = isDev ? "https://service.nemu.pm" : "https://service.nemu.pm";

// Cloudflare Workers proxy (fast, but some APIs block CF IPs)
export const proxyUrl = (url: string) =>
  `${SERVICE_URL}/proxy?url=${encodeURIComponent(url)}`;

// Convex HTTP proxy (slower, but not blocked by APIs that block CF)
// HTTP actions are at .convex.site, not .convex.cloud
export const CONVEX_URL = import.meta.env.VITE_CONVEX_URL as string;
export const convexProxyUrl = (url: string) => {
  // Convert https://xxx.convex.cloud to https://xxx.convex.site
  const siteUrl = CONVEX_URL.replace(".convex.cloud", ".convex.site");
  return `${siteUrl}/proxy?url=${encodeURIComponent(url)}`;
};

// Bypass page base URL
export const BYPASS_BASE = isDev ? "http://localhost:5662" : "https://nemu.pm";
