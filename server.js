const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Contraseña de administrador (configurable con la variable de entorno ADMIN_PASSWORD)
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '3312';
function esAdmin(req) {
    const clave = req.headers['x-admin-password'] || (req.body && req.body.password);
    return clave === ADMIN_PASSWORD;
}

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
        )`, () => sembrarDatosIniciales());
    }
});

// Viajeros iniciales con su historial de gastos.
// Solo se insertan si no existen previamente (se identifican por nombre).
const VIAJEROS_INICIALES = [
    {
        name: 'Alejo', departure_date: '2026-08-01', arrival_date: '2026-08-10',
        expenses: [
            { date: '2026-08-02', concept: 'Transporte',     amount: 85000,  notes: 'Taxi aeropuerto' },
            { date: '2026-08-03', concept: 'Alojamiento',    amount: 220000, notes: 'Hotel centro' },
            { date: '2026-08-04', concept: 'Alimentacion',   amount: 45000,  notes: 'Almuerzo ejecutivo' },
            { date: '2026-08-05', concept: 'Representacion',  amount: 130000, notes: 'Cena con cliente' }
        ]
    },
    {
        name: 'Horacio', departure_date: '2026-08-05', arrival_date: '2026-08-15',
        expenses: [
            { date: '2026-08-06', concept: 'Transporte',   amount: 60000,  notes: 'Bus intermunicipal' },
            { date: '2026-08-07', concept: 'Alimentacion', amount: 32000,  notes: 'Desayuno' },
            { date: '2026-08-08', concept: 'Alojamiento',  amount: 180000, notes: 'Hostal' },
            { date: '2026-08-09', concept: 'Otros',        amount: 25000,  notes: 'Papelería' }
        ]
    },
    {
        name: 'Esteban', departure_date: '2026-08-10', arrival_date: '2026-08-20',
        expenses: [
            { date: '2026-08-11', concept: 'Alimentacion',  amount: 52000,  notes: 'Cena' },
            { date: '2026-08-12', concept: 'Transporte',    amount: 95000,  notes: 'Combustible' },
            { date: '2026-08-13', concept: 'Representacion', amount: 210000, notes: 'Reunión comercial' }
        ]
    }
];

function sembrarDatosIniciales() {
    VIAJEROS_INICIALES.forEach((v) => {
        db.get('SELECT id FROM travelers WHERE name = ?', [v.name], (err, row) => {
            if (err || row) return; // ya existe o error: no sembrar
            db.run('INSERT INTO travelers (name, departure_date, arrival_date) VALUES (?, ?, ?)',
                [v.name, v.departure_date, v.arrival_date], function (err2) {
                    if (err2) return;
                    const travelerId = this.lastID;
                    const stmt = db.prepare('INSERT INTO expenses (traveler_id, date, concept, amount, notes) VALUES (?, ?, ?, ?, ?)');
                    v.expenses.forEach((g) => stmt.run([travelerId, g.date, g.concept, g.amount, g.notes]));
                    stmt.finalize();
                    console.log(`Viajero inicial sembrado: ${v.name}`);
                });
        });
    });
}

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

// Verificar contraseña de administrador
app.post('/api/admin/login', (req, res) => {
    if (!esAdmin(req)) return res.status(401).json({ error: 'Contraseña incorrecta' });
    res.json({ success: true });
});

// Crear viajero (Admin, requiere contraseña)
app.post('/api/admin/travelers', (req, res) => {
    if (!esAdmin(req)) return res.status(401).json({ error: 'Contraseña incorrecta' });
    const { name, departure_date, arrival_date } = req.body;
    if (!name || !departure_date || !arrival_date) {
        return res.status(400).json({ error: 'Nombre y fechas son obligatorios' });
    }
    db.get('SELECT id FROM travelers WHERE name = ?', [name], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (row) return res.status(409).json({ error: 'Ya existe un viajero con ese nombre' });
        db.run('INSERT INTO travelers (name, departure_date, arrival_date) VALUES (?, ?, ?)',
            [name, departure_date, arrival_date], function (err2) {
                if (err2) return res.status(500).json({ error: err2.message });
                res.json({ id: this.lastID, name, departure_date, arrival_date, total_expenses: 0, expense_count: 0 });
            });
    });
});

// Eliminar viajero y todos sus gastos (Admin, requiere contraseña)
app.delete('/api/admin/travelers/:id', (req, res) => {
    if (!esAdmin(req)) return res.status(401).json({ error: 'Contraseña incorrecta' });
    const id = req.params.id;
    db.serialize(() => {
        db.run('DELETE FROM expenses WHERE traveler_id = ?', [id]);
        db.run('DELETE FROM travelers WHERE id = ?', [id], function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, changes: this.changes });
        });
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
