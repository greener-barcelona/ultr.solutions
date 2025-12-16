import { createClient } from "@supabase/supabase-js";


const SUPABASE_URL = "https://qzhzudiqjfjhocsisguo.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF6aHp1ZGlxamZqaG9jc2lzZ3VvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQyMzcxNDcsImV4cCI6MjA3OTgxMzE0N30.ZUo0XWKdjdoB6mjy0LBULIJ-X3SlHP9kVT_XWGTfl-g";


export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
