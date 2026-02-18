#!/usr/bin/env bash
set -euo pipefail

# Generates src/js/firebase-config.js from environment variables.
# Support two common naming schemes for env vars: short names used by
# the deploy workflow (APIKEY, AUTHDOMAIN, ...) and explicit FIREBASE_* names
pick() {
  # pick VAR or fallback VAR_ALT
  local var="$1"; local alt="$2"
  if [ -n "${!var:-}" ]; then
    printf '%s' "${!var}"
  elif [ -n "${!alt:-}" ]; then
    printf '%s' "${!alt}"
  else
    return 1
  fi
}

APIKEY_VALUE=$(pick APIKEY FIREBASE_API_KEY) || { echo "Error: API key not set (APIKEY or FIREBASE_API_KEY)"; exit 1; }
AUTHDOMAIN_VALUE=$(pick AUTHDOMAIN FIREBASE_AUTH_DOMAIN) || { echo "Error: AUTHDOMAIN not set (AUTHDOMAIN or FIREBASE_AUTH_DOMAIN)"; exit 1; }
PROJECTID_VALUE=$(pick PROJECTID FIREBASE_PROJECT_ID) || { echo "Error: PROJECTID not set (PROJECTID or FIREBASE_PROJECT_ID)"; exit 1; }
STORAGEBUCKET_VALUE=$(pick STORAGEBUCKET FIREBASE_STORAGE_BUCKET) || { echo "Error: STORAGEBUCKET not set (STORAGEBUCKET or FIREBASE_STORAGE_BUCKET)"; exit 1; }
MESSAGINGSENDERID_VALUE=$(pick MESSAGINGSENDERID FIREBASE_MESSAGING_SENDER_ID) || { echo "Error: MESSAGINGSENDERID not set (MESSAGINGSENDERID or FIREBASE_MESSAGING_SENDER_ID)"; exit 1; }
APPID_VALUE=$(pick APPID FIREBASE_APP_ID) || { echo "Error: APPID not set (APPID or FIREBASE_APP_ID)"; exit 1; }

mkdir -p src/js
cat > src/js/firebase-config.js <<EOF
// Firebase config injected from environment for local development
const firebaseConfig = {
  apiKey: "${APIKEY_VALUE}",
  authDomain: "${AUTHDOMAIN_VALUE}",
  projectId: "${PROJECTID_VALUE}",
  storageBucket: "${STORAGEBUCKET_VALUE}",
  messagingSenderId: "${MESSAGINGSENDERID_VALUE}",
  appId: "${APPID_VALUE}"
};
if (typeof firebase !== 'undefined' && firebase.initializeApp) {
  try { firebase.initializeApp(firebaseConfig); } catch(e){}
}
try { var db = firebase.firestore(); var storage = firebase.storage(); } catch(e){}
EOF

echo "Generated src/js/firebase-config.js"
