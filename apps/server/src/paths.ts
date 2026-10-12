import path from 'node:path';

/** The repository root: the folder with config/, data/ and docs/. */
export const ROOT_DIR = path.resolve(import.meta.dirname, '../../..');
export const CONFIG_DIR = path.join(ROOT_DIR, 'config');
export const DATA_DIR = path.join(ROOT_DIR, 'data');
export const DEFAULTS_DIR = path.join(import.meta.dirname, 'config/defaults');
