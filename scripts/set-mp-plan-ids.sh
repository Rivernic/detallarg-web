#!/usr/bin/env bash
# Reemplaza los placeholders TU_PLAN_ID_INDEPENDIENTE / TU_PLAN_ID_INTERMEDIO /
# TU_PLAN_ID_PRO en index.html por los plan_id reales de Mercado Pago, una vez
# que existan (creados vía API). No toca nada más del archivo.
#
# Uso:
#   scripts/set-mp-plan-ids.sh <plan_id_independiente> <plan_id_intermedio> <plan_id_pro> [archivo]
#
# El 4to argumento es opcional (por defecto index.html en la raíz del repo) y
# existe sobre todo para poder probar el script contra una copia antes de
# correrlo contra el archivo real.

set -euo pipefail

if [ "$#" -lt 3 ] || [ "$#" -gt 4 ]; then
  echo "Uso: $0 <plan_id_independiente> <plan_id_intermedio> <plan_id_pro> [archivo]" >&2
  exit 1
fi

INDEPENDIENTE="$1"
INTERMEDIO="$2"
PRO="$3"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_FILE="${4:-$SCRIPT_DIR/../index.html}"

if [ ! -f "$TARGET_FILE" ]; then
  echo "No se encontró $TARGET_FILE" >&2
  exit 1
fi

for placeholder in TU_PLAN_ID_INDEPENDIENTE TU_PLAN_ID_INTERMEDIO TU_PLAN_ID_PRO; do
  if ! grep -q "$placeholder" "$TARGET_FILE"; then
    echo "Aviso: no se encontró el placeholder $placeholder en $TARGET_FILE (¿ya se reemplazó antes?)" >&2
  fi
done

sed -i \
  -e "s/TU_PLAN_ID_INDEPENDIENTE/${INDEPENDIENTE}/g" \
  -e "s/TU_PLAN_ID_INTERMEDIO/${INTERMEDIO}/g" \
  -e "s/TU_PLAN_ID_PRO/${PRO}/g" \
  "$TARGET_FILE"

echo "Listo. Verificá con: grep -n 'preapproval_plan_id=' $TARGET_FILE"
