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
        
        db.run(`CREATE TABLE IF NOT EXISTS correrias (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            start_date TEXT,
            end_date TEXT
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS expenses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            traveler_id INTEGER NOT NULL,
            correria_id INTEGER,
            date TEXT NOT NULL,
            concept TEXT NOT NULL,
            amount REAL NOT NULL,
            notes TEXT,
            FOREIGN KEY (traveler_id) REFERENCES travelers(id),
            FOREIGN KEY (correria_id) REFERENCES correrias(id)
        )`, () => {
            // Migración: si la tabla expenses ya existía sin la columna correria_id, agregarla
            db.all("PRAGMA table_info(expenses)", [], (e, cols) => {
                const tieneCol = !e && cols && cols.some(c => c.name === 'correria_id');
                if (!tieneCol) {
                    db.run("ALTER TABLE expenses ADD COLUMN correria_id INTEGER", () => sembrarDatosIniciales());
                } else {
                    sembrarDatosIniciales();
                }
            });
        });
    }
});

// Correrías iniciales (el admin puede crear más).
const CORRERIAS_INICIALES = [
    { name: 'Correría Julio',  start_date: '2026-07-01', end_date: '2026-07-15' },
    { name: 'Correría Agosto', start_date: '2026-08-01', end_date: '2026-08-20' }
];

// Viajeros iniciales con su historial de gastos, repartidos entre correrías.
// Solo se insertan si no existen previamente (se identifican por nombre).
const VIAJEROS_INICIALES = [
    {
        name: 'Alejo', departure_date: '2026-08-01', arrival_date: '2026-08-10',
        expenses: [
            { correria: 'Correría Julio',  date: '2026-07-03', concept: 'Transporte',    amount: 70000,  notes: 'Peajes' },
            { correria: 'Correría Julio',  date: '2026-07-05', concept: 'Alimentacion',  amount: 38000,  notes: 'Almuerzo' },
            { correria: 'Correría Agosto', date: '2026-08-02', concept: 'Transporte',    amount: 85000,  notes: 'Taxi aeropuerto' },
            { correria: 'Correría Agosto', date: '2026-08-03', concept: 'Alojamiento',   amount: 220000, notes: 'Hotel centro' },
            { correria: 'Correría Agosto', date: '2026-08-04', concept: 'Alimentacion',  amount: 45000,  notes: 'Almuerzo ejecutivo' },
            { correria: 'Correría Agosto', date: '2026-08-05', concept: 'Representacion', amount: 130000, notes: 'Cena con cliente' }
        ]
    },
    {
        name: 'Horacio', departure_date: '2026-08-05', arrival_date: '2026-08-15',
        expenses: [
            { correria: 'Correría Julio',  date: '2026-07-04', concept: 'Transporte',   amount: 55000,  notes: 'Bus' },
            { correria: 'Correría Julio',  date: '2026-07-06', concept: 'Alojamiento',  amount: 150000, notes: 'Hostal' },
            { correria: 'Correría Agosto', date: '2026-08-06', concept: 'Transporte',   amount: 60000,  notes: 'Bus intermunicipal' },
            { correria: 'Correría Agosto', date: '2026-08-07', concept: 'Alimentacion', amount: 32000,  notes: 'Desayuno' },
            { correria: 'Correría Agosto', date: '2026-08-08', concept: 'Alojamiento',  amount: 180000, notes: 'Hostal' },
            { correria: 'Correría Agosto', date: '2026-08-09', concept: 'Otros',        amount: 25000,  notes: 'Papelería' }
        ]
    },
    {
        name: 'Esteban', departure_date: '2026-08-10', arrival_date: '2026-08-20',
        expenses: [
            { correria: 'Correría Julio',  date: '2026-07-08', concept: 'Alimentacion',  amount: 48000,  notes: 'Cena' },
            { correria: 'Correría Agosto', date: '2026-08-11', concept: 'Alimentacion',  amount: 52000,  notes: 'Cena' },
            { correria: 'Correría Agosto', date: '2026-08-12', concept: 'Transporte',    amount: 95000,  notes: 'Combustible' },
            { correria: 'Correría Agosto', date: '2026-08-13', concept: 'Representacion', amount: 210000, notes: 'Reunión comercial' }
        ]
    }
];

function sembrarDatosIniciales() {
    // 1) Sembrar correrías (si no existen), luego los viajeros con sus gastos.
    let pendientes = CORRERIAS_INICIALES.length;
    if (pendientes === 0) return sembrarViajeros();
    CORRERIAS_INICIALES.forEach((c) => {
        db.get('SELECT id FROM correrias WHERE name = ?', [c.name], (err, row) => {
            const listo = () => { if (--pendientes === 0) sembrarViajeros(); };
            if (err || row) return listo();
            db.run('INSERT INTO correrias (name, start_date, end_date) VALUES (?, ?, ?)',
                [c.name, c.start_date, c.end_date], () => { console.log(`Correría sembrada: ${c.name}`); listo(); });
        });
    });
}

function sembrarViajeros() {
    // Mapa de nombre de correría -> id
    db.all('SELECT id, name FROM correrias', [], (err, correrias) => {
        const mapa = {};
        (correrias || []).forEach((c) => { mapa[c.name] = c.id; });
        VIAJEROS_INICIALES.forEach((v) => {
            db.get('SELECT id FROM travelers WHERE name = ?', [v.name], (err2, row) => {
                if (err2 || row) return; // ya existe o error
                db.run('INSERT INTO travelers (name, departure_date, arrival_date) VALUES (?, ?, ?)',
                    [v.name, v.departure_date, v.arrival_date], function (err3) {
                        if (err3) return;
                        const travelerId = this.lastID;
                        const stmt = db.prepare('INSERT INTO expenses (traveler_id, correria_id, date, concept, amount, notes) VALUES (?, ?, ?, ?, ?, ?)');
                        v.expenses.forEach((g) => stmt.run([travelerId, mapa[g.correria] || null, g.date, g.concept, g.amount, g.notes]));
                        stmt.finalize();
                        console.log(`Viajero inicial sembrado: ${v.name}`);
                    });
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

// Listar correrías (público: el viajero elige en cuál registra el gasto)
app.get('/api/correrias', (req, res) => {
    db.all('SELECT * FROM correrias ORDER BY start_date ASC, id ASC', [], (err, rows) => {
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

// Agregar gasto (incluye la correría elegida)
app.post('/api/travelers/:id/expenses', (req, res) => {
    const { date, concept, amount, notes, correria_id } = req.body;
    db.run('INSERT INTO expenses (traveler_id, correria_id, date, concept, amount, notes) VALUES (?, ?, ?, ?, ?, ?)',
        [req.params.id, correria_id || null, date, concept, amount, notes], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, traveler_id: req.params.id, correria_id: correria_id || null, date, concept, amount, notes });
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

// Obtener resumen de todos (Admin, requiere contraseña)
app.get('/api/admin/summary', (req, res) => {
    if (!esAdmin(req)) return res.status(401).json({ error: 'No autorizado' });
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

// ===== Correrías (Admin) =====

// Crear correría (Admin)
app.post('/api/admin/correrias', (req, res) => {
    if (!esAdmin(req)) return res.status(401).json({ error: 'No autorizado' });
    const { name, start_date, end_date } = req.body;
    if (!name) return res.status(400).json({ error: 'El nombre es obligatorio' });
    db.get('SELECT id FROM correrias WHERE name = ?', [name], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (row) return res.status(409).json({ error: 'Ya existe una correría con ese nombre' });
        db.run('INSERT INTO correrias (name, start_date, end_date) VALUES (?, ?, ?)',
            [name, start_date || null, end_date || null], function (err2) {
                if (err2) return res.status(500).json({ error: err2.message });
                res.json({ id: this.lastID, name, start_date, end_date });
            });
    });
});

// Eliminar correría (Admin). Los gastos asociados quedan sin correría (correria_id = NULL).
app.delete('/api/admin/correrias/:id', (req, res) => {
    if (!esAdmin(req)) return res.status(401).json({ error: 'No autorizado' });
    const id = req.params.id;
    db.serialize(() => {
        db.run('UPDATE expenses SET correria_id = NULL WHERE correria_id = ?', [id]);
        db.run('DELETE FROM correrias WHERE id = ?', [id], function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, changes: this.changes });
        });
    });
});

// Resumen de correrías con totales y desglose por categoría (Admin).
// Ordenadas cronológicamente para poder comparar cada una con la anterior.
app.get('/api/admin/correrias/summary', (req, res) => {
    if (!esAdmin(req)) return res.status(401).json({ error: 'No autorizado' });
    db.all('SELECT id, name, start_date, end_date FROM correrias ORDER BY start_date ASC, id ASC', [], (err, correrias) => {
        if (err) return res.status(500).json({ error: err.message });
        db.all('SELECT correria_id, concept, SUM(amount) AS total, COUNT(*) AS cnt FROM expenses WHERE correria_id IS NOT NULL GROUP BY correria_id, concept', [], (err2, rows) => {
            if (err2) return res.status(500).json({ error: err2.message });
            const porId = {};
            correrias.forEach((c) => { porId[c.id] = { ...c, total: 0, count: 0, categorias: {} }; });
            rows.forEach((r) => {
                const c = porId[r.correria_id];
                if (c) { c.categorias[r.concept] = r.total; c.total += r.total; c.count += r.cnt; }
            });
            res.json(correrias.map((c) => porId[c.id]));
        });
    });
});

// Gastos de una correría, con el nombre del viajero (Admin)
app.get('/api/admin/correrias/:id/expenses', (req, res) => {
    if (!esAdmin(req)) return res.status(401).json({ error: 'No autorizado' });
    const query = `
        SELECT e.*, t.name AS traveler_name
        FROM expenses e
        LEFT JOIN travelers t ON t.id = e.traveler_id
        WHERE e.correria_id = ?
        ORDER BY e.date DESC, e.id DESC
    `;
    db.all(query, [req.params.id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.listen(PORT, () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
});
