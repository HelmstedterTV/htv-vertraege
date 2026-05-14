import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

// ─── Firestore: neues Projekt htv-vertraege ───────────────────────────────────
// TODO: Firebase Console → Neues Projekt "htv-vertraege" anlegen →
//       Projekteinstellungen → Web-App hinzufügen → Werte hier eintragen
const firestoreConfig = {
  apiKey: "AIzaSyCBo69NFyloUpl3-1c5MdykBLfUF9BT8ho",
  authDomain: "htv-vertraege.firebaseapp.com",
  projectId: "htv-vertraege",
  storageBucket: "htv-vertraege.firebasestorage.app",
  messagingSenderId: "244031347624",
  appId: "1:244031347624:web:90e64aa53efbc37b271b9d",
};

// ─── Auth: gemeinsames schluesselapp-Projekt (gleiche Nutzer wie andere Apps) ─
const authConfig = {
  apiKey: "AIzaSyDfP2xCpV5d2qCefkMFgxmYJK8pCALY2N0",
  authDomain: "schluesselapp-15d55.firebaseapp.com",
  projectId: "schluesselapp-15d55",
  storageBucket: "schluesselapp-15d55.firebasestorage.app",
  messagingSenderId: "170328595810",
  appId: "1:170328595810:web:fd32f77f2505b63629603b",
};

const app = initializeApp(firestoreConfig);
const authApp = initializeApp(authConfig, "auth");

export const db = getFirestore(app);
export const auth = getAuth(authApp);
