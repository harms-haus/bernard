#!/bin/bash
# delete-better-auth-user.sh <email>
EMAIL="${1:?Usage: $0 <email>}"
REDIS_HOST="${REDIS_HOST:-127.0.0.1}"
REDIS_PORT="${REDIS_PORT:-6379}"
redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" --scan --pattern "auth:user:*" | while read -r key; do
  user_email=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" HGET "$key" email)
  if [ "$user_email" = "$EMAIL" ]; then
    echo "Deleting user: $key"
    redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" DEL "$key" "auth:email:$EMAIL"
  fi
done