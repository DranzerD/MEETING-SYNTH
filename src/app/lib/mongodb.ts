// lib/mongodb.ts
import mongoose from "mongoose";

type MongooseCache = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

declare global {
  var mongooseCache: MongooseCache | undefined;
}

const globalWithCache = globalThis as typeof globalThis & {
  mongooseCache?: MongooseCache;
};

const cached =
  globalWithCache.mongooseCache ??
  (globalWithCache.mongooseCache = { conn: null, promise: null });

// The MONGODB_URI check is deliberately deferred to call time, not module
// load time: this module is imported by API routes at the top level, and
// Next.js's build step evaluates route modules to collect page data --
// throwing here would fail `next build` itself for anyone without a live
// MONGODB_URI configured, even though auth is the only thing that
// actually needs Mongo (meetings are file-backed, not stored in Mongo).
async function dbConnect() {
  if (cached.conn) return cached.conn;
  if (!cached.promise) {
    const MONGODB_URI = process.env.MONGODB_URI;
    if (!MONGODB_URI) {
      throw new Error(
        "MONGODB_URI is not set. Copy .env.example to .env.local and set it (needed for register/login)."
      );
    }
    cached.promise = mongoose.connect(MONGODB_URI).then((mongoose) => mongoose);
  }
  cached.conn = await cached.promise;
  return cached.conn;
}

export default dbConnect;
