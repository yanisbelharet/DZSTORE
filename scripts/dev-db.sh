#!/usr/bin/env bash
# Démarre un PostgreSQL local et crée les bases `dz_dev` et `dz_test` (idempotent).
#   - Docker disponible  → service `postgres` de docker-compose.yml (PostgreSQL 17)
#   - sinon              → PostgreSQL natif (Debian/Ubuntu : pg_ctlcluster)
# Usage : pnpm db:local
set -euo pipefail

readonly DB_USER=dz
readonly DB_PASSWORD=dz
readonly DATABASES=(dz_dev dz_test)

if [[ "${NODE_ENV:-}" == "production" ]]; then
  echo "Refusé : script réservé au développement local (NODE_ENV=production)." >&2
  exit 1
fi

cd "$(dirname "$0")/.."

as_postgres() {
  if [[ "$(id -u)" == "0" ]]; then
    runuser -u postgres -- "$@"
  else
    sudo -u postgres -- "$@"
  fi
}

if docker info >/dev/null 2>&1; then
  mode="docker"
  port=5432
  docker compose up -d --wait postgres
elif command -v pg_lsclusters >/dev/null 2>&1; then
  mode="natif"
  read -r version cluster port status _ < <(pg_lsclusters --no-header | head -n 1)
  if [[ -z "${version:-}" ]]; then
    echo "Aucun cluster PostgreSQL natif trouvé (pg_lsclusters)." >&2
    exit 1
  fi
  if [[ "$status" != online* ]]; then
    pg_ctlcluster "$version" "$cluster" start
  fi
  as_postgres psql --quiet -v ON_ERROR_STOP=1 -p "$port" -d postgres <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${DB_USER}') THEN
    CREATE ROLE ${DB_USER} LOGIN CREATEDB PASSWORD '${DB_PASSWORD}';
  END IF;
END
\$\$;
SQL
else
  echo "Ni Docker (démon actif) ni PostgreSQL natif trouvés. Installer l'un des deux." >&2
  exit 1
fi

for _ in $(seq 1 30); do
  pg_isready -q -h localhost -p "$port" && break
  sleep 1
done
pg_isready -q -h localhost -p "$port" || { echo "PostgreSQL ne répond pas sur le port $port." >&2; exit 1; }

export PGPASSWORD="$DB_PASSWORD"
for db in "${DATABASES[@]}"; do
  exists="$(psql -h localhost -p "$port" -U "$DB_USER" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '${db}'")"
  if [[ "$exists" != "1" ]]; then
    psql --quiet -h localhost -p "$port" -U "$DB_USER" -d postgres -c "CREATE DATABASE ${db}"
    echo "Base créée : ${db}"
  fi
done

server_version="$(psql -h localhost -p "$port" -U "$DB_USER" -d dz_dev -tAc 'SHOW server_version')"
cat <<INFO
PostgreSQL ${server_version} prêt (mode ${mode}).
  DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@localhost:${port}/dz_dev
  DATABASE_URL_TEST=postgresql://${DB_USER}:${DB_PASSWORD}@localhost:${port}/dz_test
INFO
