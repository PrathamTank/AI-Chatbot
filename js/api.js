import { getSession } from "../lib/supabase.js";

export async function apiFetch(url, options = {}) {

    const session = await getSession();

    const headers = new Headers(options.headers || {});

    if (session?.access_token) {
        headers.set("Authorization", `Bearer ${session.access_token}`);
    }

    return fetch(url, {
        ...options,
        headers
    });
}