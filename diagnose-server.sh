#!/bin/bash
# Diagnostic script to run ON your Digital Ocean server
# Run with: bash diagnose-server.sh

echo "========================================="
echo "QuickMark Server Diagnostics"
echo "========================================="
echo ""

# Test 1: Can the server reach YouTube?
echo "Test 1: Basic connectivity to YouTube"
curl -I https://www.youtube.com 2>&1 | head -5
echo ""

# Test 2: Can we reach YouTube's oEmbed API?
echo "Test 2: YouTube oEmbed API"
curl -s "https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=dQw4w9WgXcQ&format=json" | head -5
echo ""

# Test 3: From inside the Docker container
echo "Test 3: From inside Docker container"
docker-compose exec -T quickmark curl -s "https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=dQw4w9WgXcQ&format=json" 2>&1 | head -10
echo ""

# Test 4: Check if curl is available in container
echo "Test 4: Tools available in container"
docker-compose exec -T quickmark which curl 2>&1 || echo "curl not found"
docker-compose exec -T quickmark which wget 2>&1 || echo "wget not found"
echo ""

# Test 5: DNS resolution
echo "Test 5: DNS resolution in container"
docker-compose exec -T quickmark nslookup youtube.com 2>&1 || docker-compose exec -T quickmark ping -c 1 youtube.com 2>&1 || echo "DNS tools not found"
echo ""

# Test 6: Check if container can make ANY outbound HTTPS request
echo "Test 6: General HTTPS connectivity from container"
docker-compose exec -T quickmark wget -O- --timeout=5 https://api.github.com 2>&1 | head -5 || echo "Failed"
echo ""

# Test 7: Check current logs
echo "Test 7: Recent container logs (last 20 lines)"
docker-compose logs --tail=20 quickmark
echo ""

echo "========================================="
echo "Diagnostics complete!"
echo "========================================="
