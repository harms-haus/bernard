#!/bin/bash
# delete-better-auth-user.sh <email> [prefix]
# prefix defaults to "auth:" for core, use "core2:auth:" for core2
EMAIL="${1:?Usage: $0 <email> [prefix]}"
PREFIX="${2:-auth:}"
REDIS_HOST="${REDIS_HOST:-127.0.0.1}"
REDIS_PORT="${REDIS_PORT:-6379}"

echo "Deleting user '$EMAIL' with prefix '$PREFIX'..."

redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" --scan --pattern "${PREFIX}user:*" | while read -r key; do
  user_email=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" HGET "$key" email)
  if [ "$user_email" = "$EMAIL" ]; then
    echo "Deleting user: $key"
    redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" DEL "$key" "${PREFIX}email:$EMAIL" "${PREFIX}session:*" 2>/dev/null
    echo "Done"
  fi
done

echo "Complete"