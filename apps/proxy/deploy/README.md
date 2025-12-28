# Corrector Proxy VPS Deployment

This guide describes a minimal production setup for the proxy backend using systemd + nginx with HTTPS.

## A) Server prerequisites

Ubuntu/Debian example:

```bash
sudo apt-get update
sudo apt-get install -y nodejs npm nginx sqlite3
```

If you need a newer Node.js, install it via the official NodeSource method, then proceed with the steps below.

## B) Create service user and directories

```bash
sudo useradd --system --create-home --shell /usr/sbin/nologin corrector
sudo mkdir -p /etc/corrector
sudo mkdir -p /var/lib/corrector
sudo chown -R corrector:corrector /var/lib/corrector
sudo chmod 700 /var/lib/corrector
```

## C) Put repo on server

Place the repo at `/opt/corrector` (or update the paths in the service file accordingly).

Install dependencies for the proxy app:

```bash
cd /opt/corrector/apps/proxy
npm ci --omit=dev
```

If your deployment workflow installs dependencies from the repo root, ensure the proxy app dependencies are installed before starting the service.

## D) Configure env

Copy the example env file and set secrets:

```bash
sudo cp /opt/corrector/apps/proxy/deploy/proxy.env.example /etc/corrector/proxy.env
sudo nano /etc/corrector/proxy.env
```

Set `OPENAI_API_KEY` and confirm:

```
DB_PATH=/var/lib/corrector/proxy.sqlite
```

Protect the file:

```bash
sudo chmod 600 /etc/corrector/proxy.env
```

## E) Install systemd unit

```bash
sudo cp /opt/corrector/apps/proxy/deploy/corrector-proxy.service /etc/systemd/system/corrector-proxy.service
sudo systemctl daemon-reload
sudo systemctl enable --now corrector-proxy
sudo systemctl status corrector-proxy
sudo journalctl -u corrector-proxy -f
```

## F) Install nginx config

```bash
sudo cp /opt/corrector/apps/proxy/deploy/nginx.corrector-proxy.conf /etc/nginx/sites-available/corrector-proxy
sudo ln -s /etc/nginx/sites-available/corrector-proxy /etc/nginx/sites-enabled/corrector-proxy
sudo nginx -t
sudo systemctl reload nginx
```

Update `YOUR_DOMAIN` in the nginx config before reloading.

## G) HTTPS (optional but recommended)

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d YOUR_DOMAIN
```

Certbot will edit the nginx config to enable HTTPS and manage certificate renewals.

## H) Verification commands

Local health check:

```bash
curl http://127.0.0.1:8787/health
```

HTTPS health check (after certbot):

```bash
curl https://YOUR_DOMAIN/health
```

Register and transform (replace placeholders):

```bash
curl -s -X POST https://YOUR_DOMAIN/v1/register \
  -H "Content-Type: application/json" \
  -d '{"install_id":"00000000-0000-0000-0000-000000000000","version":"1.0.0"}'
```

```bash
curl -s -X POST https://YOUR_DOMAIN/v1/transform \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer INSTALL_TOKEN_FROM_REGISTER" \
  -d '{"mode":"polish","style":"neutral","text":"Please fix this sentence."}'
```

Persistence check:

```bash
sudo systemctl restart corrector-proxy
```

Use the same `INSTALL_TOKEN_FROM_REGISTER` again and verify the request still works (this confirms the SQLite DB persisted).

## Rollback / troubleshooting

* **Check service logs:** `sudo journalctl -u corrector-proxy -f`
* **Check nginx logs:** `/var/log/nginx/error.log` and `/var/log/nginx/access.log`
* **Common issues:**
  * Incorrect permissions on `/var/lib/corrector`
  * Wrong `DB_PATH` in `/etc/corrector/proxy.env`
  * Missing `OPENAI_API_KEY`
  * Port 8787 already in use

To disable the service:

```bash
sudo systemctl disable --now corrector-proxy
```
