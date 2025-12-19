const isDev = import.meta.env.DEV;

export const SERVICE_URL = isDev ? "" : "https://service.nemu.pm";

export const proxyUrl = (url: string) =>
  `${SERVICE_URL}/proxy?url=${encodeURIComponent(url)}`;

