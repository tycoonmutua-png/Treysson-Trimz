const admin = require('firebase-admin');

if (!admin.apps.length) {
  const projectId   = process.env.FIREBASE_PROJECT_ID;
  const privateKey  = process.env.FIREBASE_PRIVATE_KEY;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;

  if (projectId && privateKey && clientEmail &&
      projectId !== 'your-project-id' &&
      privateKey.includes('BEGIN PRIVATE KEY')) {
    // Real Firebase credentials — initialize normally
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        privateKey:  privateKey.replace(/\\n/g, '\n'),
        clientEmail,
      }),
    });
    console.log('✅ Firebase Admin initialized');
  } else {
    // No credentials yet — initialize with a dummy app so server still starts
    admin.initializeApp({ projectId: 'placeholder' });
    console.warn('⚠️  Firebase not configured — customer auth disabled until you add Firebase credentials to .env');
  }
}

module.exports = admin;