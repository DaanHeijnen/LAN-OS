// Sample content for the panels that arrive in later milestones (LAN Radio in M2,
// polls and activities in M3, Shared Game Finder in M5). Until then they render this,
// and using their actions shows a "coming soon" note.

export const DEMO_RADIO = {
  now: { title: 'Take On Me', artist: 'a-ha', requester: 'Nick', position: 134, length: 221 },
  queue: [
    { title: 'Mr. Brightside', artist: 'The Killers', requester: 'Mara' },
    { title: 'Africa', artist: 'Toto', requester: 'Alex' },
    { title: 'Blinding Lights', artist: 'The Weeknd', requester: 'Sam' },
    { title: 'Take Five', artist: 'Dave Brubeck', requester: 'Lisa' },
  ],
};

export const DEMO_POLL = {
  question: 'Next break?',
  startedBy: 'Alex',
  options: [{ label: 'Pizza', count: 3 }, { label: 'Walk outside', count: 2 }, { label: 'Keep playing', count: 1 }],
};

export const DEMO_ACTIVITY = { title: 'Pizza break', kind: 'Food break', startsInMinutes: 18, joined: 5, organizer: 'Alex' };

export const DEMO_SHARED_GAMES = [
  { name: 'Deep Rock Galactic', owners: 5 },
  { name: 'Valheim', owners: 4 },
  { name: 'Rocket League', owners: 3 },
];
