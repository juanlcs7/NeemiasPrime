import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // O projeto continua validado por `npm run typecheck`. Na Vercel, evitamos
  // que a etapa interna duplicada do Next seja encerrada sem emitir diagnóstico.
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
