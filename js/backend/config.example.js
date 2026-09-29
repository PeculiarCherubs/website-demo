/**
 * config.example.js
 * Template for local developer configuration overrides.
 *
 * To use:
 * 1. Copy this file to `config.local.js` (which is ignored by Git).
 * 2. Fill in your local PocketBase or Supabase instance details.
 * 3. The website and Admin portal will automatically load your overrides.
 */

window.CMS_LOCAL_CONFIG = {
  // Set default active provider for your local environment ('supabase' | 'pocketbase')
  activeProvider: 'supabase',

  providers: {
    supabase: {
      name: 'Supabase',
      url: 'https://iyihwxtkgawphsnrxvop.supabase.co',
      anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml5aWh3eHRrZ2F3cGhzbnJ4dm9wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg0MjA3NjIsImV4cCI6MjEwMzk5Njc2Mn0.61qJQ8ev9LFap1bu4A1Lr7Wy8JVvczZVb_KmhlalSQ8',
      tableName: 'site_content',
      fetchTimeoutMs: 4000
    },
    pocketbase: {
      name: 'PocketBase',
      url: 'http://127.0.0.1:8090',
      contentCollection: 'site_content',
      usersCollection: 'users',
      fetchTimeoutMs: 4000
    }
  }
};
