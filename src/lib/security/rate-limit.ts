interface Bucket {
  timestamps: number[];
}

const buckets = new Map<string, Bucket>();
let lastSweepAt = 0;

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

/**
 * Limitador de taxa por janela deslizante em memória para proteger
 * rotas de identificação por CPF e login administrativo.
 */
export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number,
  nowMs: number = Date.now()
): RateLimitResult {
  if (nowMs - lastSweepAt > 60_000) {
    for (const [k, b] of buckets.entries()) {
      const recent = b.timestamps.filter((ts) => nowMs - ts < windowMs);
      if (recent.length === 0) {
        buckets.delete(k);
      } else {
        b.timestamps = recent;
      }
    }
    lastSweepAt = nowMs;
  }

  const bucket = buckets.get(key) ?? { timestamps: [] };
  const valid = bucket.timestamps.filter((ts) => nowMs - ts < windowMs);

  if (valid.length >= maxRequests) {
    const oldest = valid[0] ?? nowMs;
    const retryAfterMs = Math.max(1000, windowMs - (nowMs - oldest));
    bucket.timestamps = valid;
    buckets.set(key, bucket);
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
    };
  }

  valid.push(nowMs);
  bucket.timestamps = valid;
  buckets.set(key, bucket);
  return { allowed: true, retryAfterSeconds: 0 };
}

export function extractClientIp(headers: Headers): string {
  const cf = headers.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const realIp = headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "unknown";
}
