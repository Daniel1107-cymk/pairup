import postgres from "postgres";

// Local Postgres, Neon, or Vercel Postgres — all via DATABASE_URL.
export const sql = postgres(process.env.DATABASE_URL!);
