import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://camrmyhxvocewfqxmevr.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNhbXJteWh4dm9jZXdmcXhtZXZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwMDUzMDQsImV4cCI6MjA4ODU4MTMwNH0.WxjPl7yHSwF3DFHDdUoLTFkVQpqdeZ6fwT2HI0v-mzk'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
