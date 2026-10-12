// Announces "lan-os.local" on the network (multicast DNS), so other PCs can open
// http://lan-os.local:8080 instead of an IP address. Windows 10/11, macOS and Linux understand it.
// It only answers questions for that one name and changes no settings on this PC.
import dgram from 'node:dgram';
import { log } from './logging.ts';

const MDNS_ADDRESS = '224.0.0.251';
const MDNS_PORT = 5353;
const TYPE_A = 1;
const TYPE_ANY = 255;
const TTL_SECONDS = 120;

/** Reads the question names from a DNS query packet. */
export function parseQuestions(packet: Buffer): Array<{ name: string; type: number }> {
  if (packet.length < 12 || (packet.readUInt16BE(2) & 0x8000) !== 0) return [];
  const count = packet.readUInt16BE(4);
  const questions: Array<{ name: string; type: number }> = [];
  let offset = 12;
  for (let q = 0; q < count && offset < packet.length; q++) {
    const labels: string[] = [];
    while (offset < packet.length) {
      const length = packet[offset]!;
      if (length === 0) { offset++; break; }
      if ((length & 0xc0) === 0xc0) { offset += 2; break; } // compressed names aren't used in questions we answer
      labels.push(packet.subarray(offset + 1, offset + 1 + length).toString('utf8'));
      offset += length + 1;
    }
    if (offset + 4 > packet.length) break;
    questions.push({ name: labels.join('.').toLowerCase(), type: packet.readUInt16BE(offset) });
    offset += 4;
  }
  return questions;
}

/** A DNS answer packet with one A record. */
export function answerPacket(name: string, ipv4: string): Buffer {
  const nameBytes = Buffer.concat([...name.split('.').map(l => Buffer.concat([Buffer.from([l.length]), Buffer.from(l)])), Buffer.from([0])]);
  const header = Buffer.alloc(12);
  header.writeUInt16BE(0x8400, 2); // response, authoritative
  header.writeUInt16BE(1, 6);      // one answer
  const record = Buffer.alloc(10);
  record.writeUInt16BE(TYPE_A, 0);
  record.writeUInt16BE(0x8001, 2); // class IN, cache-flush
  record.writeUInt32BE(TTL_SECONDS, 4);
  record.writeUInt16BE(4, 8);
  return Buffer.concat([header, nameBytes, record, Buffer.from(ipv4.split('.').map(Number))]);
}

export function announceHostname(hostname: string, ipv4: () => string | null): () => void {
  const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  const name = hostname.toLowerCase();
  socket.on('error', error => {
    log.warn(`Could not announce ${hostname} on the network (${error.message}). Use the IP address instead.`);
    socket.close();
  });
  socket.on('message', packet => {
    const wanted = parseQuestions(packet).some(q => q.name === name && (q.type === TYPE_A || q.type === TYPE_ANY));
    const ip = ipv4();
    if (wanted && ip) socket.send(answerPacket(name, ip), MDNS_PORT, MDNS_ADDRESS);
  });
  socket.bind(MDNS_PORT, () => {
    try {
      socket.addMembership(MDNS_ADDRESS);
      socket.setMulticastTTL(255);
    } catch (error) {
      log.warn(`Could not join the network name service (${error instanceof Error ? error.message : String(error)}).`);
    }
  });
  return () => { try { socket.close(); } catch { /* already closed */ } };
}
