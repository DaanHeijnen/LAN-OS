// Optional AI wording for wall announcements. LAN OS always has a template line ready;
// the AI only rewrites it, and any problem falls back to the template.
import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-opus-5-5';

const SYSTEM = `You write one-line announcements for a projector at a LAN party among close friends.
Rewrite the given line in the requested tone. Keep every fact (names, games, numbers) exactly as given and add none.
One sentence, at most 14 words. No hashtags, no emoji, no quotes around the answer, no persona or "announcer" voice.
Friendly teasing between friends is fine. Reply with the line only.`;

export class AiWriter {
  private readonly client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey, timeout: 20_000, maxRetries: 1 });
  }

  /** Returns the rewritten line, or null when the AI declined or something went wrong. */
  async rewrite(line: string, tone: 'factual' | 'funny' | 'night'): Promise<string | null> {
    const toneText = tone === 'night' ? 'playful drinking-game tone (it is night mode)' : tone === 'funny' ? 'dry, lightly funny' : 'plain and factual';
    try {
      const response = await this.client.beta.messages.create({
        model: MODEL,
        max_tokens: 1000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'low' },
        system: SYSTEM,
        messages: [{ role: 'user', content: `Tone: ${toneText}\nLine: ${line}` }],
      });
      if (response.stop_reason === 'refusal') return null;
      const text = response.content.flatMap(b => (b.type === 'text' ? [b.text] : [])).join(' ').trim().replace(/^["']|["']$/g, '');
      return text && text.length <= 160 && !text.includes('\n') ? text : null;
    } catch {
      return null;
    }
  }
}
