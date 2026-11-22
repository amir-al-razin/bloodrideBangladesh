import type { NextConfig } from "next";

// The browser only talks to this Next.js server; /api/* is forwarded to FastAPI.
// That way a phone on the same Wi-Fi needs one address (http://<pc-ip>:3000) and there is no CORS.
const API_ORIGIN = process.env.API_ORIGIN ?? "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_ORIGIN}/api/:path*` }];
  },
  // let phones on the local network open the dev server, e.g. ALLOWED_DEV_ORIGINS=192.168.0.105
  allowedDevOrigins: (process.env.ALLOWED_DEV_ORIGINS ?? "").split(",").filter(Boolean),
};

export default nextConfig;
