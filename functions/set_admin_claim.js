const admin = require('firebase-admin');
const path = require('path');

// Initialize admin SDK.
// Option A: set GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json before running.
// Option B: pass the path as the second argument: node set_admin_claim.js <UID> /path/to/service-account.json
if (!admin.apps.length) {
  const keyArg = process.argv[3];
  if (keyArg) {
    const keyPath = path.resolve(keyArg);
    const serviceAccount = require(keyPath);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    admin.initializeApp(); // ADC picks up GOOGLE_APPLICATION_CREDENTIALS automatically
  } else {
    console.error(
      '\nNo credentials found. Do one of:\n' +
      '  A) Download a service account key from Firebase Console > Project Settings > Service Accounts,\n' +
      '     then run: node functions/set_admin_claim.js <UID> /path/to/service-account.json\n' +
      '  B) Run: gcloud auth application-default login  then retry.\n'
    );
    process.exit(1);
  }
}

async function setAdmin(uid) {
  if (!uid) {
    console.error('Usage: node set_admin_claim.js <UID>');
    process.exit(1);
  }

  try {
    await admin.auth().setCustomUserClaims(uid, { admin: true });
    console.log(`Set admin claim for user ${uid}`);
    process.exit(0);
  } catch (e) {
    console.error('Error setting claim:', e);
    process.exit(1);
  }
}

const uid = process.argv[2];
setAdmin(uid);
