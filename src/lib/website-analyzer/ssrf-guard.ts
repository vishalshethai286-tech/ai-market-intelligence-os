import "server-only";
import { isIPv4, isIPv6 } from "node:net";
import { lookup } from "node:dns/promises";
import { ALLOWED_PORTS } from "./constants";

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0;
}

function inIpv4Range(ip: string, base: string, maskBits: number): boolean {
  const ipInt = ipv4ToInt(ip);
  const baseInt = ipv4ToInt(base);
  const mask = maskBits === 0 ? 0 : (~0 << (32 - maskBits)) >>> 0;
  return (ipInt & mask) === (baseInt & mask);
}

// RFC 1918/5735/6598/3927 etc. — loopback, private, link-local (includes cloud
// metadata at 169.254.169.254), CGNAT, and the various reserved/test ranges.
const PRIVATE_IPV4_RANGES: Array<[string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
  ["255.255.255.255", 32],
];

function isPrivateIpv4(ip: string): boolean {
  return PRIVATE_IPV4_RANGES.some(([base, bits]) => inIpv4Range(ip, base, bits));
}

function isPrivateIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase();

  if (normalized === "::1" || normalized === "::") return true;
  if (normalized.startsWith("fe8") || normalized.startsWith("fe9")) return true; // fe80::/10 (approx)
  if (normalized.startsWith("fea") || normalized.startsWith("feb")) return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true; // fc00::/7 unique local
  if (normalized.startsWith("ff")) return true; // multicast

  // IPv4-mapped (::ffff:a.b.c.d) — unwrap and check the embedded IPv4.
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIpv4(mapped[1]);

  return false;
}

function isPrivateOrReservedIp(ip: string): boolean {
  if (isIPv4(ip)) return isPrivateIpv4(ip);
  if (isIPv6(ip)) return isPrivateIpv6(ip);
  return true; // unrecognized format — fail closed
}

const BLOCKED_HOSTNAME_SUFFIXES = [".local", ".internal", ".localhost"];

/**
 * Validates that `rawUrl` is a public http(s) URL safe to fetch server-side.
 * Blocks non-http(s) protocols, non-standard ports, obviously-internal
 * hostnames, and hostnames that resolve to private/reserved IP ranges
 * (including the cloud metadata address 169.254.169.254).
 *
 * Known limitation: this checks DNS *before* fetching. It does not pin the
 * validated IP for the actual request, so a DNS-rebinding attacker who
 * controls their own DNS server could in theory swap the answer between the
 * check and the fetch. Mitigating that fully requires a custom fetch
 * dispatcher that connects to the pinned IP — worth adding before this
 * service is exposed to less-trusted input than "a company's own website".
 */
export async function assertSafeHttpUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new UnsafeUrlError("That doesn't look like a valid URL.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnsafeUrlError("Only http and https URLs are supported.");
  }

  if (!ALLOWED_PORTS.has(url.port)) {
    throw new UnsafeUrlError("Only standard web ports (80/443) are supported.");
  }

  const hostname = url.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    BLOCKED_HOSTNAME_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
  ) {
    throw new UnsafeUrlError("That host isn't allowed.");
  }

  // A bare IP literal in the URL — validate it directly, no DNS involved.
  if (isIPv4(hostname) || isIPv6(hostname)) {
    if (isPrivateOrReservedIp(hostname)) {
      throw new UnsafeUrlError("That host isn't allowed.");
    }
    return url;
  }

  let addresses: { address: string }[];
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new UnsafeUrlError("Couldn't resolve that hostname.");
  }

  if (addresses.length === 0 || addresses.some((a) => isPrivateOrReservedIp(a.address))) {
    throw new UnsafeUrlError("That host isn't allowed.");
  }

  return url;
}
