import { connection } from "next/server";

export async function GET() {
  // Opt out of prerendering: this must report the live server, not build time.
  await connection();
  return Response.json(
    {
      status: "ok",
      time: new Date().toISOString(),
      region: process.env.VERCEL_REGION ?? "local",
      environment: process.env.VERCEL_ENV ?? "development",
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
