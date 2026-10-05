# The playtest build: the static client, served by Caddy. CI copies the verified build into site/ and uploads this
# folder to Railway on every push to main (.github/workflows/ci.yml).
FROM caddy:2-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY site /srv
