#!/bin/bash
# Deploy frontend-only changes to Pi
# Ensures version.json is regenerated to prevent cache issues

set -e

PI_HOST="${DEPLOY_TARGET_PI:-miles@192.168.1.206}"
CONTAINER_NAME="${APP_NAME:-rfcapture}"

echo "=== Frontend Deployment Script ==="
echo "Target: $PI_HOST"
echo "Container: $CONTAINER_NAME"
echo

# Step 1: Build frontend
echo "📦 Building frontend..."
cd src/frontend
npm run build
cd ../..
echo "✓ Frontend built"
echo

# Step 2: Generate fresh version.json with current commit
echo "🔖 Generating version.json..."
npm run version:generate
echo "✓ Version generated"
echo

# Step 3: Package everything
echo "📤 Packaging files..."
tar czf /tmp/static-react.tar.gz -C src/middleware/web static-react
tar czf /tmp/version.tar.gz version.json
echo "✓ Files packaged"
echo

# Step 4: Transfer to Pi
echo "🚀 Transferring to Pi..."
scp /tmp/static-react.tar.gz "$PI_HOST:/tmp/"
scp /tmp/version.tar.gz "$PI_HOST:/tmp/"
echo "✓ Files transferred"
echo

# Step 5: Deploy to container
echo "🎯 Deploying to container..."
ssh "$PI_HOST" << 'EOF'
  # Copy tarballs into container
  docker cp /tmp/static-react.tar.gz rfcapture:/tmp/
  docker cp /tmp/version.tar.gz rfcapture:/tmp/

  # Extract in container
  docker exec rfcapture sh -c '
    cd /app/src/middleware/web
    rm -rf static-react
    tar xzf /tmp/static-react.tar.gz

    cd /app
    tar xzf /tmp/version.tar.gz

    echo "Deployed files:"
    ls -lh /app/version.json
    ls -lh /app/src/middleware/web/static-react/assets/*.js | head -3
  '

  # Cleanup temp files
  rm -f /tmp/static-react.tar.gz /tmp/version.tar.gz
EOF
echo "✓ Deployed to container"
echo

# Step 6: Verify deployment
echo "🔍 Verifying deployment..."
VERSION_INFO=$(ssh "$PI_HOST" "docker exec $CONTAINER_NAME curl -s http://localhost:3000/api/version")
COMMIT=$(echo "$VERSION_INFO" | grep -o '"commit":"[^"]*"' | cut -d'"' -f4 | cut -c1-7)
LOCAL_COMMIT=$(git rev-parse --short HEAD)

echo "Remote commit: $COMMIT"
echo "Local commit:  $LOCAL_COMMIT"

if [ "$COMMIT" = "$LOCAL_COMMIT" ]; then
  echo "✅ Deployment successful! Version matches."
else
  echo "⚠️  Warning: Version mismatch detected"
  echo "   This might indicate a deployment issue"
fi
echo

echo "=== Deployment Complete ==="
echo "Frontend will auto-reload within 30 seconds on all connected clients"
echo

# Cleanup local temp files
rm -f /tmp/static-react.tar.gz /tmp/version.tar.gz
