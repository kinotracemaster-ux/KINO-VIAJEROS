const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Inicializar DB
const db = new sqlite3.Database('./viajeros.db', (err) => {
    if (err) {
        console.error('Error abriendo DB', err.message);
    } else {
        console.log('Conectado a la base de datos SQLite.');
        db.run(`CREATE TABLE IF NOT EXISTS travelers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            departure_date TEXT NOT NULL,
            arrival_date TEXT NOT NULL
        )`);
        
        db.run(`CREATE TABLE IF NOT EXISTS expenses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            traveler_id INTEGER NOT NULL,
            date TEXT NOT NULL,
            concept TEXT NOT NULL,
            amount REAL NOT NULL,
            notes TEXT,
            FOREIGN KEY (traveler_id) REFERENCES travelers(id)
        )`);
    }
});

// API Routes

// Registrar o verificar viajero
app.post('/api/travelers', (req, res) => {
    const { name, departure_date, arrival_date } = req.body;
    
    // Check if exists
    db.get('SELECT * FROM travelers WHERE name = ?', [name], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        
        if (row) {
            // Update dates if needed
            db.run('UPDATE travelers SET departure_date = ?, arrival_date = ? WHERE id = ?', 
                [departure_date, arrival_date, row.id], function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ ...row, departure_date, arrival_date });
            });
        } else {
            // Insert new
            db.run('INSERT INTO travelers (name, departure_date, arrival_date) VALUES (?, ?, ?)',
                [name, departure_date, arrival_date], function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ id: this.lastID, name, departure_date, arrival_date });
            });
        }
    });
});

// Obtener todos los viajeros (Admin)
app.get('/api/travelers', (req, res) => {
    db.all('SELECT * FROM travelers', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Obtener gastos de un viajero
app.get('/api/travelers/:id/expenses', (req, res) => {
    db.all('SELECT * FROM expenses WHERE traveler_id = ? ORDER BY id DESC', [req.params.id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Agregar gasto
app.post('/api/travelers/:id/expenses', (req, res) => {
    const { date, concept, amount, notes } = req.body;
    db.run('INSERT INTO expenses (traveler_id, date, concept, amount, notes) VALUES (?, ?, ?, ?, ?)',
        [req.params.id, date, concept, amount, notes], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, traveler_id: req.params.id, date, concept, amount, notes });
    });
});

// Eliminar gasto
app.delete('/api/expenses/:id', (req, res) => {
    db.run('DELETE FROM expenses WHERE id = ?', [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, changes: this.changes });
    });
});

// Vaciar gastos de un viajero
app.delete('/api/travelers/:id/expenses', (req, res) => {
    db.run('DELETE FROM expenses WHERE traveler_id = ?', [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, changes: this.changes });
    });
});

// Obtener resumen de todos (Admin)
app.get('/api/admin/summary', (req, res) => {
    const query = `
        SELECT t.id, t.name, t.departure_date, t.arrival_date, 
               COALESCE(SUM(e.amount), 0) as total_expenses,
               COUNT(e.id) as expense_count
        FROM travelers t
        LEFT JOIN expenses e ON t.id = e.traveler_id
        GROUP BY t.id
    `;
    db.all(query, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.listen(PORT, () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
});
