import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCLCFRt-o5fKNbR1leUxbBbB6RljT_4_8w",
  authDomain: "fornecedores-cp.firebaseapp.com",
  projectId: "fornecedores-cp",
  storageBucket: "fornecedores-cp.firebasestorage.app",
  messagingSenderId: "282005256935",
  appId: "1:282005256935:web:df3e33036142fc434dc042",
  measurementId: "G-06DS7T6QGR"
};

const app = getApps().find(item => item.name === "[DEFAULT]") || initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db };
