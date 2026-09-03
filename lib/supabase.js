import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const supabaseUrl = "https://muceuqzbxdmfmxukdjxl.supabase.co";
const supabaseAnonKey = "sb_publishable_3AQNNF2PVc9YzalGKNuBjA_MZI7ZTw8";

export const supabase = createClient(
    supabaseUrl,
    supabaseAnonKey
);

// Helper: returns the current session
export async function getSession() {

    const { data, error } = await supabase.auth.getSession();

    if (error) {
        console.error("Auth session error:", error.message);
        return null;
    }

    return data.session;
}