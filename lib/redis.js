import { Redis } from '@upstash/redis';
import dotenv from 'dotenv';

dotenv.config();

const memoryStore = new Map();

const isConfigured = Boolean(
    process.env.UPSTASH_REDIS_REST_URL &&
    !process.env.UPSTASH_REDIS_REST_URL.includes('your-db') &&
    process.env.UPSTASH_REDIS_REST_TOKEN &&
    !process.env.UPSTASH_REDIS_REST_TOKEN.includes('your_upstash')
);

let realRedis = null;
if (isConfigured) {
    try {
        realRedis = new Redis({
            url: process.env.UPSTASH_REDIS_REST_URL,
            token: process.env.UPSTASH_REDIS_REST_TOKEN,
        });
    } catch (e) {
        console.warn("Upstash Redis initialization failed, using in-memory fallback:", e.message);
    }
} else {
    console.log("ℹ️ Upstash Redis credentials not configured. Operating in in-memory fallback mode.");
}

const db = {
    async hset(key, dataOrField, value) {
        if (realRedis) {
            try {
                return await realRedis.hset(key, dataOrField, value);
            } catch (err) {
                console.warn("Redis hset failed, using in-memory store:", err.message);
            }
        }
        if (!memoryStore.has(key)) memoryStore.set(key, {});
        const bucket = memoryStore.get(key);
        if (typeof dataOrField === 'object' && dataOrField !== null) {
            Object.assign(bucket, dataOrField);
        } else {
            bucket[dataOrField] = value;
        }
        return 1;
    },

    async hget(key, field) {
        if (realRedis) {
            try {
                return await realRedis.hget(key, field);
            } catch (err) {
                console.warn("Redis hget failed, using in-memory store:", err.message);
            }
        }
        const bucket = memoryStore.get(key);
        return bucket ? bucket[field] || null : null;
    },

    async hgetall(key) {
        if (realRedis) {
            try {
                const res = await realRedis.hgetall(key);
                if (res && Object.keys(res).length > 0) return res;
            } catch (err) {
                console.warn("Redis hgetall failed, using in-memory store:", err.message);
            }
        }
        const bucket = memoryStore.get(key);
        return bucket ? { ...bucket } : null;
    },

    async hdel(key, field) {
        if (realRedis) {
            try {
                return await realRedis.hdel(key, field);
            } catch (err) {
                console.warn("Redis hdel failed, using in-memory store:", err.message);
            }
        }
        const bucket = memoryStore.get(key);
        if (bucket && field in bucket) {
            delete bucket[field];
            return 1;
        }
        return 0;
    },

    async hlen(key) {
        if (realRedis) {
            try {
                const len = await realRedis.hlen(key);
                return typeof len === 'number' ? len : 0;
            } catch (err) {
                console.warn("Redis hlen failed, falling back to hgetall:", err.message);
                const all = await realRedis.hgetall(key);
                return all ? Object.keys(all).length : 0;
            }
        }
        const bucket = memoryStore.get(key);
        return bucket ? Object.keys(bucket).length : 0;
    }
};

export default db;
