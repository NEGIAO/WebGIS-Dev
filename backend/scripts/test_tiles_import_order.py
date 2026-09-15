import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core.net_guard import is_disallowed_host
from core.http_headers import BROWSER_USER_AGENT

print("core-first OK", is_disallowed_host("localhost"), BROWSER_USER_AGENT[:12])

from domains.tiles import tiles_router, build_http_client

print("tiles_router", len(tiles_router.routes))

from domains.tiles.infra import is_disallowed_host as g2

print("infra OK", g2("10.0.0.1"))
print("PASS")
