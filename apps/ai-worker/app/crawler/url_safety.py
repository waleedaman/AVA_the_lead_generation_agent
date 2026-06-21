import ipaddress
import socket
from urllib.parse import urlparse


class UnsafeUrlError(ValueError):
    pass


BLOCKED_HOSTS = {
    "localhost",
    "metadata.google.internal",
}

BLOCKED_IPS = {
    ipaddress.ip_address("169.254.169.254"),
}


def validate_public_http_url(url: str) -> str:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        raise UnsafeUrlError("Only http and https URLs are allowed")
    if not parsed.hostname:
        raise UnsafeUrlError("URL must include a hostname")

    hostname = parsed.hostname.strip().lower().rstrip(".")
    if hostname in BLOCKED_HOSTS:
        raise UnsafeUrlError("Blocked localhost or metadata hostname")

    try:
        ip = ipaddress.ip_address(hostname)
        _raise_if_blocked_ip(ip)
        return url
    except ValueError:
        pass

    for ip in _resolve_host(hostname):
        _raise_if_blocked_ip(ip)
    return url


def is_public_http_url(url: str) -> bool:
    try:
        validate_public_http_url(url)
        return True
    except UnsafeUrlError:
        return False


def _resolve_host(hostname: str) -> list[ipaddress._BaseAddress]:
    try:
        addrinfo = socket.getaddrinfo(hostname, None)
    except socket.gaierror as exc:
        raise UnsafeUrlError(f"Could not resolve hostname: {hostname}") from exc
    addresses = []
    for item in addrinfo:
        raw_ip = item[4][0]
        try:
            addresses.append(ipaddress.ip_address(raw_ip))
        except ValueError:
            continue
    if not addresses:
        raise UnsafeUrlError(f"No IP addresses resolved for hostname: {hostname}")
    return addresses


def _raise_if_blocked_ip(ip: ipaddress._BaseAddress) -> None:
    if ip in BLOCKED_IPS:
        raise UnsafeUrlError("Blocked cloud metadata IP")
    if (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_reserved
        or ip.is_unspecified
    ):
        raise UnsafeUrlError(f"Blocked non-public IP address: {ip}")
