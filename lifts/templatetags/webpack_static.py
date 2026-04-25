import json
from pathlib import Path
from typing import Any

from django import template
from django.conf import settings
from django.templatetags.static import static
from django.utils.html import format_html_join

register = template.Library()


def _manifest_path() -> Path:
    configured_path = getattr(
        settings,
        "WEBPACK_MANIFEST_PATH",
        Path(settings.BASE_DIR) / "frontend" / "static" / "manifest.json",
    )
    return Path(configured_path)


def _load_manifest() -> dict[str, Any]:
    manifest_path = _manifest_path()
    if not manifest_path.exists():
        return {}

    with manifest_path.open(encoding="utf-8") as manifest_file:
        return json.load(manifest_file)


def _to_asset_url(asset_path: str) -> str:
    if asset_path.startswith(("http://", "https://", "//", "/")):
        return asset_path
    return static(asset_path.lstrip("./"))


def _entry_assets(entrypoint: str, asset_type: str) -> list[str]:
    manifest = _load_manifest()
    entrypoints = manifest.get("entrypoints", {})
    entrypoint_data = entrypoints.get(entrypoint, {})
    assets = entrypoint_data.get("assets", {})
    return assets.get(asset_type, [])


@register.simple_tag
def webpack_static(asset_name: str, fallback: str = "") -> str:
    manifest = _load_manifest()
    files = manifest.get("files", {})
    resolved_path = files.get(asset_name)

    if resolved_path:
        return _to_asset_url(resolved_path)
    if fallback:
        return static(fallback)
    return ""


@register.simple_tag
def webpack_styles(entrypoint: str = "page1", fallback: str = "frontend/main.css") -> str:
    css_assets = [_to_asset_url(asset) for asset in _entry_assets(entrypoint, "css")]
    if not css_assets and fallback:
        css_assets = [static(fallback)]

    return format_html_join(
        "\n",
        '<link rel="stylesheet" href="{}" />',
        ((asset_url,) for asset_url in css_assets),
    )


@register.simple_tag
def webpack_scripts(entrypoint: str = "page1", fallback: str = "frontend/main.js") -> str:
    js_assets = [_to_asset_url(asset) for asset in _entry_assets(entrypoint, "js")]
    if not js_assets and fallback:
        js_assets = [static(fallback)]

    return format_html_join(
        "\n",
        '<script src="{}" defer></script>',
        ((asset_url,) for asset_url in js_assets),
    )
