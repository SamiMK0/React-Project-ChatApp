import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
    apiKey: import.meta.env.VITE_API_KEY,
    authDomain: "chat-app-4cd62.firebaseapp.com",
    projectId: "chat-app-4cd62",
    storageBucket: "chat-app-4cd62.firebasestorage.app",
    messagingSenderId: "48779369313",
    appId: "1:48779369313:web:27fbc96bbb3bd4733c8320"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

export { auth, db, storage };