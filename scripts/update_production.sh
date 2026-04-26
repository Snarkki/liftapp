#!/usr/bin/env bash
set -Eeuo pipefail

APP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$APP_ROOT/.env}"
FRONTEND_DIR="${FRONTEND_DIR:-$APP_ROOT/frontend}"
PYTHON_BIN="${PYTHON_BIN:-$APP_ROOT/.venv/bin/python}"
PIP_BIN="${PIP_BIN:-$APP_ROOT/.venv/bin/pip}"
NPM_BIN="${NPM_BIN:-npm}"

SERVICE_NAME="${SERVICE_NAME:-liftapp}"
NGINX_SITE_NAME="${NGINX_SITE_NAME:-liftapp}"
SYSTEMD_SOURCE="${SYSTEMD_SOURCE:-$APP_ROOT/deploy/systemd/${SERVICE_NAME}.service}"
NGINX_SOURCE="${NGINX_SOURCE:-$APP_ROOT/deploy/nginx/${NGINX_SITE_NAME}.conf}"

SKIP_PIP_INSTALL="${SKIP_PIP_INSTALL:-0}"
SKIP_NPM_INSTALL="${SKIP_NPM_INSTALL:-0}"
SKIP_CONFIG_SYNC="${SKIP_CONFIG_SYNC:-0}"
SKIP_NGINX_RELOAD="${SKIP_NGINX_RELOAD:-0}"

log() {
    printf '\n[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

die() {
    printf 'Error: %s\n' "$*" >&2
    exit 1
}

run_as_root() {
    if [[ "${EUID}" -eq 0 ]]; then
        "$@"
    else
        sudo "$@"
    fi
}

require_file() {
    local path="$1"
    [[ -f "$path" ]] || die "Missing required file: $path"
}

require_executable() {
    local path="$1"
    [[ -x "$path" ]] || die "Missing required executable: $path"
}

require_command() {
    local name="$1"
    command -v "$name" >/dev/null 2>&1 || die "Required command not found: $name"
}

require_file "$APP_ROOT/manage.py"
require_file "$APP_ROOT/requirements.txt"
require_file "$FRONTEND_DIR/package.json"
require_executable "$PYTHON_BIN"
require_executable "$PIP_BIN"
require_command "$NPM_BIN"

if [[ -f "$ENV_FILE" ]]; then
    log "Loading environment from $ENV_FILE"
    set -a
    # shellcheck disable=SC1090
    . "$ENV_FILE"
    set +a
fi

STATIC_ROOT="${STATIC_ROOT:-$APP_ROOT/staticfiles}"
STATIC_OWNER="${STATIC_OWNER:-$(id -un)}"
STATIC_GROUP="${STATIC_GROUP:-$(id -gn)}"

if git -C "$APP_ROOT" rev-parse --git-dir >/dev/null 2>&1; then
    CURRENT_COMMIT="$(git -C "$APP_ROOT" rev-parse --short HEAD)"
    log "Deploying current checkout at commit $CURRENT_COMMIT"
fi

if [[ "$SKIP_PIP_INSTALL" != "1" ]]; then
    log "Installing backend dependencies"
    "$PIP_BIN" install -r "$APP_ROOT/requirements.txt"
else
    log "Skipping backend dependency install"
fi

if [[ "$SKIP_NPM_INSTALL" != "1" ]]; then
    log "Installing frontend dependencies"
    if [[ -f "$FRONTEND_DIR/package-lock.json" ]]; then
        (
            cd "$FRONTEND_DIR"
            "$NPM_BIN" ci
        )
    else
        (
            cd "$FRONTEND_DIR"
            "$NPM_BIN" install
        )
    fi
else
    log "Skipping frontend dependency install"
fi

log "Building frontend bundle"
(
    cd "$FRONTEND_DIR"
    "$NPM_BIN" run build
)

log "Applying database migrations"
(
    cd "$APP_ROOT"
    "$PYTHON_BIN" manage.py migrate --noinput
)

log "Collecting static files into $STATIC_ROOT"
run_as_root install -d -m 755 "$STATIC_ROOT"
run_as_root chown -R "${STATIC_OWNER}:${STATIC_GROUP}" "$STATIC_ROOT"
(
    cd "$APP_ROOT"
    "$PYTHON_BIN" manage.py collectstatic --noinput
)

if [[ "$SKIP_CONFIG_SYNC" != "1" ]]; then
    if [[ -f "$SYSTEMD_SOURCE" ]]; then
        log "Syncing systemd unit from $SYSTEMD_SOURCE"
        run_as_root cp "$SYSTEMD_SOURCE" "/etc/systemd/system/${SERVICE_NAME}.service"
        run_as_root systemctl daemon-reload
        run_as_root systemctl enable "$SERVICE_NAME"
    else
        log "Systemd unit file not found, skipping sync"
    fi

    if [[ -f "$NGINX_SOURCE" ]]; then
        log "Syncing nginx site from $NGINX_SOURCE"
        run_as_root cp "$NGINX_SOURCE" "/etc/nginx/sites-available/${NGINX_SITE_NAME}"
        run_as_root ln -sf "/etc/nginx/sites-available/${NGINX_SITE_NAME}" "/etc/nginx/sites-enabled/${NGINX_SITE_NAME}"
        run_as_root nginx -t
    else
        log "Nginx site file not found, skipping sync"
    fi
else
    log "Skipping systemd/nginx config sync"
fi

log "Restarting ${SERVICE_NAME}"
run_as_root systemctl restart "$SERVICE_NAME"

if [[ "$SKIP_NGINX_RELOAD" != "1" && -f "$NGINX_SOURCE" ]]; then
    log "Reloading nginx"
    run_as_root systemctl reload nginx
fi

log "Production update complete"
