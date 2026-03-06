import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Gestion de la persistance des données
const dataDir = process.env.NODE_ENV === "production" ? "/app/data" : ".";
if (process.env.NODE_ENV === "production" && !fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, "serefis.db");
const db = new Database(dbPath);

// Initialisation de la base de données
db.exec(`
  CREATE TABLE IF NOT EXISTS participants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fullName TEXT NOT NULL,
    whatsapp TEXT NOT NULL,
    emergencyContact TEXT,
    email TEXT,
    school TEXT,
    studyLevel TEXT,
    subCommittee TEXT,
    gender TEXT,
    participationType TEXT,
    amount INTEGER,
    paymentStatus TEXT DEFAULT 'pending',
    transactionId TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

async function startServer() {
  const app = express();
  app.use(express.json());
  const PORT = process.env.PORT || 3000;

  // Inscription d'un participant
  app.post("/api/register", (req, res) => {
    const { fullName, whatsapp, emergencyContact, email, school, studyLevel, subCommittee, gender, participationType } = req.body;
    const amount = participationType === "with_polo" ? 6000 : 5000;

    try {
      const stmt = db.prepare(`
        INSERT INTO participants (fullName, whatsapp, emergencyContact, email, school, studyLevel, subCommittee, gender, participationType, amount)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const info = stmt.run(fullName, whatsapp, emergencyContact, email, school, studyLevel, subCommittee, gender, participationType, amount);
      res.json({ id: info.lastInsertRowid, amount });
    } catch (error) {
      res.status(500).json({ error: "Erreur lors de l'enregistrement" });
    }
  });

  // Validation du paiement avec preuve (ID Transaction)
  app.post("/api/payment/confirm", (req, res) => {
    const { participantId, userReference } = req.body;
    try {
      const participant = db.prepare("SELECT * FROM participants WHERE id = ?").get(participantId);
      if (!participant) return res.status(404).json({ error: "Participant non trouvé" });

      // Vérification d'unicité de l'ID de transaction
      const existing = db.prepare("SELECT id FROM participants WHERE transactionId = ?").get(userReference);
      if (existing) return res.status(400).json({ error: "Cette référence a déjà été utilisée." });

      const stmt = db.prepare("UPDATE participants SET paymentStatus = 'paid', transactionId = ? WHERE id = ?");
      stmt.run(userReference, participantId);
      res.json({ success: true, participant: db.prepare("SELECT * FROM participants WHERE id = ?").get(participantId) });
    } catch (error) {
      res.status(500).json({ error: "Erreur serveur" });
    }
  });

  // Admin Login
  app.post("/api/admin/login", (req, res) => {
    const { email, password } = req.body;
    if (email === "kaboremoussa926@gmail.com" && password === "serefis2026") {
      res.json({ success: true, token: "admin-token" });
    } else {
      res.status(401).json({ error: "Identifiants invalides" });
    }
  });

  app.get("/api/admin/participants", (req, res) => {
    const participants = db.prepare("SELECT * FROM participants ORDER BY createdAt DESC").all();
    res.json(participants);
  });

  // Vite Middleware
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => res.sendFile(path.join(__dirname, "dist", "index.html")));
  }

  app.listen(PORT, "0.0.0.0", () => console.log(`Serveur sur le port ${PORT}`));
}

startServer();