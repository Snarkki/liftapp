# LiftApp

Django backend + React frontend (Webpack + TypeScript + Tailwind).

## 1) Backend setup

```bash
source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

`runserver` defaults to port `8005` in this project.
For plain local dev over HTTP, keep:
- `DEBUG=True`
- `FORCE_HTTPS=False`

Django reads these backend settings from `.env`:
- `ALLOWED_HOSTS` (comma-separated)
- `TAILSCALE_HOST_NAME` (fallback host when `ALLOWED_HOSTS` is unset)
- `PGHOST`
- `PGPORT`
- `PGDATABASE`
- `PGUSER`
- `PGPASSWORD`

Static paths can also be set in `.env`:
- `STATIC_ROOT` (where `collectstatic` writes files)
- `WEBPACK_MANIFEST_PATH` (manifest Django reads for hashed JS/CSS names)

For Nginx `location /static/ { alias /var/www/liftapp/static/; }`, use:
- `STATIC_ROOT=/var/www/liftapp/static`
- `WEBPACK_MANIFEST_PATH=/var/www/liftapp/static/manifest.json`

## 2) Frontend setup

```bash
cd frontend
npm install
npm run build
```

For active frontend development:

```bash
cd frontend
npm run dev
```

This writes compiled assets to `static/frontend/main.js` and `static/frontend/main.css`, which Django serves from `templates/lifts/index.html`.

## 3) Open app

Visit:
- `http://127.0.0.1:8005/`
- `http://127.0.0.1:8005/admin/`

## 4) Deploy behind Nginx on this server

Set `.env` for your public hostname:

```env
DEBUG=False
FORCE_HTTPS=True
ALLOWED_HOSTS=your-host.example.com,localhost,127.0.0.1
TAILSCALE_HOST_NAME=your-host.example.com
STATIC_ROOT=/var/www/liftapp/static
WEBPACK_MANIFEST_PATH=/var/www/liftapp/static/manifest.json
```

Prepare static files and the Gunicorn runtime:

```bash
sudo mkdir -p /var/www/liftapp/static
sudo chown -R "$USER":www-data /var/www/liftapp
.venv/bin/pip install gunicorn
cd frontend
npm install
npm run build
cd ..
.venv/bin/python manage.py collectstatic --noinput
```

Create machine-specific deploy files in a local `deploy/` folder. That folder is ignored by git so hostnames, usernames, and absolute paths stay private.

Example `deploy/systemd/liftapp.service`:

```ini
[Unit]
Description=LiftApp gunicorn service
After=network.target

[Service]
Type=simple
User=<app-user>
Group=<app-group>
WorkingDirectory=<app-root>
EnvironmentFile=-<app-root>/.env
Environment=DJANGO_SETTINGS_MODULE=config.settings
ExecStart=<app-root>/.venv/bin/gunicorn --workers 3 --bind 127.0.0.1:8005 --access-logfile - --error-logfile - config.wsgi:application
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Example `deploy/nginx/liftapp.conf`:

```nginx
server {
    listen 80;
    server_name <public-hostname>;

    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name <public-hostname>;

    ssl_certificate /etc/nginx/certs/liftapp/<public-hostname>.crt;
    ssl_certificate_key /etc/nginx/certs/liftapp/<public-hostname>.key;

    location /static/ {
        alias /var/www/liftapp/static/;
        access_log off;
        expires 1h;
    }

    location / {
        proxy_pass http://127.0.0.1:8005;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }
}
```

Install your local service and Nginx config:

```bash
mkdir -p deploy/systemd deploy/nginx
sudo cp deploy/systemd/liftapp.service /etc/systemd/system/liftapp.service
sudo systemctl daemon-reload
sudo systemctl enable --now liftapp

sudo install -d -m 755 /etc/nginx/certs/liftapp
sudo install -m 644 <public-hostname>.crt /etc/nginx/certs/liftapp/<public-hostname>.crt
sudo install -m 600 <public-hostname>.key /etc/nginx/certs/liftapp/<public-hostname>.key

sudo cp deploy/nginx/liftapp.conf /etc/nginx/sites-available/liftapp
sudo ln -sf /etc/nginx/sites-available/liftapp /etc/nginx/sites-enabled/liftapp
sudo nginx -t
sudo systemctl reload nginx
```

## 5) Nginx + Tailscale notes

If Nginx/Tailscale terminates TLS, Django upstream must stay HTTP:

```nginx
location / {
    proxy_pass http://127.0.0.1:8005;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Do not use `https://127.0.0.1:8005` in `proxy_pass` when the upstream is Django `runserver`.

Keep `FORCE_HTTPS=False` if Nginx is serving plain HTTP only.
Set `FORCE_HTTPS=True` only when Nginx or Tailscale is actually terminating HTTPS.

If you generated the cert with `tailscale cert <public-hostname>`, Nginx needs both files:
- `/etc/nginx/certs/liftapp/<public-hostname>.crt`
- `/etc/nginx/certs/liftapp/<public-hostname>.key`

Your local `deploy/nginx/liftapp.conf` should point at those paths.
