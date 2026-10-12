// Roster changes from the admin page and the player dashboard, written back to players.yaml.
import { isSeq, type Document } from 'yaml';
import type { PlayerConfig } from '@lan-os/shared';
import { ConfigError, type ConfigStore } from './store.ts';

type EditableField = Exclude<keyof PlayerConfig, 'id'>;

function indexOfPlayer(document: Document, id: string): number {
  const list = document.get('players');
  if (!isSeq(list)) throw new ConfigError(['config/players.yaml → players must be a list of players']);
  const index = list.items.findIndex(item => (item as { get?: (k: string) => unknown }).get?.('id') === id);
  if (index === -1) throw new ConfigError([`config/players.yaml → there is no player with id "${id}"`]);
  return index;
}

export function updatePlayer(store: ConfigStore, id: string, changes: Partial<Pick<PlayerConfig, EditableField>>) {
  return store.update('players', document => {
    const index = indexOfPlayer(document, id);
    for (const [key, value] of Object.entries(changes)) {
      if (value !== undefined) document.setIn(['players', index, key], value);
    }
  });
}

export function addPlayer(store: ConfigStore, player: PlayerConfig) {
  return store.update('players', document => {
    document.addIn(['players'], document.createNode({ ...player }));
  });
}

export function removePlayer(store: ConfigStore, id: string) {
  return store.update('players', document => {
    document.deleteIn(['players', indexOfPlayer(document, id)]);
  });
}
