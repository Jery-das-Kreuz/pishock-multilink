import { isIP } from "node:net";

function normalizeIpCandidate(value: string | null | undefined): string | null {
  if (!value) return null;

  let candidate = value.trim().replace(/^"|"$/g, "");

  if (!candidate || candidate.toLowerCase() === "unknown") {
    return null;
  }

  // Bracketed IPv6 may include a port: [2001:db8::1]:443
  if (candidate.startsWith("[")) {
    const closingBracket = candidate.indexOf("]");

    if (closingBracket > 0) {
      candidate = candidate.slice(1, closingBracket);
    }
  } else {
    // IPv4 may include a port: 203.0.113.10:54321
    const ipv4WithPort = candidate.match(/^((?:\d{1,3}\.){3}\d{1,3}):\d+$/);

    if (ipv4WithPort) {
      candidate = ipv4WithPort[1];
    }
  }

  // Store IPv4-mapped IPv6 addresses in their shorter IPv4 form.
  if (candidate.toLowerCase().startsWith("::ffff:")) {
    const mappedIpv4 = candidate.slice(7);

    if (isIP(mappedIpv4) === 4) {
      candidate = mappedIpv4;
    }
  }

  return isIP(candidate) ? candidate.slice(0, 64) : null;
}

export function getClientIp(request: Request): string | null {
  const directHeaders = [
    request.headers.get("x-real-ip"),
    request.headers.get("cf-connecting-ip"),
  ];

  for (const value of directHeaders) {
    const ip = normalizeIpCandidate(value);
    if (ip) return ip;
  }

  const forwardedFor = request.headers.get("x-forwarded-for");

  if (forwardedFor) {
    for (const value of forwardedFor.split(",")) {
      const ip = normalizeIpCandidate(value);
      if (ip) return ip;
    }
  }

  return null;
}
