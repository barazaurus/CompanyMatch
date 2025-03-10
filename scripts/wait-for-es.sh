#!/bin/sh

set -e

host="$1"
port="$2"
shift 2
cmd="$@"

max_attempts=30
attempt=0

>&2 echo "Starting wait-for-elasticsearch.sh script"
>&2 echo "Attempting to connect to $host:$port"

# Check network connectivity first
>&2 echo "Checking network configuration..."
>&2 echo "Hostname resolution:"
>&2 hostname -f
>&2 echo "Host lookup:"
>&2 getent hosts "$host" || >&2 echo "Could not resolve hostname"

>&2 echo "Routing information:"
>&2 route -n

while [ $attempt -lt $max_attempts ]; do
  attempt=$((attempt+1))
  
  >&2 echo "Connection attempt $attempt..."
  
  # Detailed wget with more verbose output
  wget_output=$(wget -v -T 10 -O /dev/null "http://$host:$port" 2>&1)
  exit_code=$?
  
  >&2 echo "Wget exit code: $exit_code"
  >&2 echo "Wget output: $wget_output"
  
  if [ $exit_code -eq 0 ]; then
    >&2 echo "Elasticsearch is up and responding!"
    break
  else
    >&2 echo "Attempt $attempt: Connection failed"
    sleep 5
  fi
done

if [ $attempt -ge $max_attempts ]; then
  >&2 echo "ERROR: Elasticsearch did not become available within the time limit"
  exit 1
fi

>&2 echo "Executing command: $@"
exec "$@"