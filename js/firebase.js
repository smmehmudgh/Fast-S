/* ============================================================
   Firebase — app init, Auth & Firestore instances.
   Every other module imports `auth` / `db` from here instead
   of re-initializing Firebase.
   ============================================================ */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-analytics.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCX7u6tAmK-k-6Oq-S7DNhU74MyyfT38Uw",
  authDomain: "java-corn.firebaseapp.com",
  databaseURL: "https://java-corn-default-rtdb.firebaseio.com",
  projectId: "java-corn",
  storageBucket: "java-corn.firebasestorage.app",
  messagingSenderId: "925971536544",
  appId: "1:925971536544:web:29bc09fc96f40e7dc747c5",
  measurementId: "G-TKDER5WR36"
};

const fbApp = initializeApp(firebaseConfig);
try { getAnalytics(fbApp); } catch (e) {}

export const auth = getAuth(fbApp);
export const db = getFirestore(fbApp);
