const admin = require('firebase-admin');

if (!admin.apps.length) {
  // If you have a service account JSON file, you can use:
  // const serviceAccount = require('../firebase-service-account.json');
  // admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId:   process.env.FIREBASE_PROJECT_ID,
      privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    }),
  });
}

module.exports = admin;