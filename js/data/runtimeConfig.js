/**
 * Peculiar Cherubs — Runtime Data Provider Configuration
 *
 * This is deployment configuration, not an interactive browser switch.
 *
 * Migration state:
 *   publicProvider = "supabase-legacy"
 *
 * Cloudflare cutover:
 *   publicProvider = "cloudflare"
 *
 * Supabase anon credentials are intentionally public and temporary here.
 * Never place privileged credentials in this file.
 */
(function (global) {
  'use strict';

  global.PeculiarRuntimeConfig = Object.freeze({
    publicProvider: 'supabase-legacy',

    cloudflare: Object.freeze({
      publicApiBase: '/api/public'
    }),

    supabaseLegacy: Object.freeze({
      url: 'https://iyihwxtkgawphsnrxvop.supabase.co',
      anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml5aWh3eHRrZ2F3cGhzbnJ4dm9wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg0MjA3NjIsImV4cCI6MjEwMzk5Njc2Mn0.61qJQ8ev9LFap1bu4A1Lr7Wy8JVvczZVb_KmhlalSQ8',
      tableName: 'site_content'
    }),

    fetchTimeoutMs: 4000,
    circuitBreakerMs: 60000
  });
})(typeof window !== 'undefined' ? window : globalThis);
