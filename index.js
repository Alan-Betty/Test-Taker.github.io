// firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBeBiDUwG4PuV-NEJHWuxFGBJu0_wNMaTs",
  authDomain: "test-taker-8ab9a.firebaseapp.com",
  projectId: "test-taker-8ab9a",
  storageBucket: "test-taker-8ab9a.firebasestorage.app",
  messagingSenderId: "393233465495",
  appId: "1:393233465495:web:c82a259d9846dc6be569d2"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
