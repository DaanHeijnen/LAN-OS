// Secrets from the .env file in the main folder. Nothing else reads process.env.
import fs from 'node:fs';
import path from 'node:path';

export interface Secrets {
  steamApiKey: string | null;
  adminPassword: string | null;
}

export function loadSecrets(rootDir: string): Secrets {
  const file = path.join(rootDir, '.env');
  if (fs.existsSync(file)) process.loadEnvFile(file);
  const value = (name: string) => process.env[name]?.trim() || null;
  return {
    steamApiKey: value('STEAM_API_KEY'),
    adminPassword: value('ADMIN_PASSWORD'),
  };
}
