// Discord highlights: LAN OS reads the latest messages of one channel, the host picks a few,
// and the wall shows them. The bot only reads; it never posts.

const API = 'https://discord.com/api/v10';

export interface DiscordMessage { id: string; author: string; text: string }

export async function fetchChannelMessages(token: string, channelId: string, fetchImpl: typeof fetch = fetch): Promise<DiscordMessage[]> {
  const response = await fetchImpl(`${API}/channels/${channelId}/messages?limit=30`, {
    headers: { Authorization: `Bot ${token}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (response.status === 401) throw new Error('Discord refused the bot token. Check it on the admin page.');
  if (response.status === 403) throw new Error('The bot cannot read that channel. Give it "View Channel" and "Read Message History".');
  if (response.status === 404) throw new Error('Discord cannot find that channel ID.');
  if (!response.ok) throw new Error(`Discord answered with HTTP ${response.status}`);
  const list = await response.json() as Array<{ id: string; content: string; author: { username: string; global_name?: string | null } }>;
  return list
    .filter(m => m.content.trim())
    .map(m => ({ id: m.id, author: m.author.global_name ?? m.author.username, text: m.content.trim().slice(0, 200) }));
}
