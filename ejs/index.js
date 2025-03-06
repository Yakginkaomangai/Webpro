const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const session = require('express-session');

const app = express();
const PORT = process.env.PORT || 3000;
const sqlite3 = require('sqlite3').verbose();

// Connect to SQLite database
let db = new sqlite3.Database('project.db', (err) => {    
    if (err) {
        return console.error(err.message);
    }
    console.log('Connected to the SQlite database.');
  });

// ตั้งค่า EJS เป็น View Engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(bodyParser.urlencoded({ extended: true }));

// เสิร์ฟไฟล์ Static
app.use(express.static(path.join(__dirname, 'public')));

// ใช้ Session เก็บสถานะล็อกอิน
app.use(session({
    secret: '1234',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
}));


// Routes
app.get('/', (req, res) => {
    const isLoggedIn = req.session && req.session.user ? true : false;
    res.render('home', { isLoggedIn }); 
});

// หน้า Login (เช็ค error message)
app.get('/login', (req, res) => {
    const error = req.query.error ? "อีเมลหรือรหัสผ่านไม่ถูกต้อง!" : null;
    const isLoggedIn = req.session && req.session.user ? true : false;
    res.render('login', { error, isLoggedIn });  // ส่งค่าไปให้ login.ejs
});


// จัดการ Login
app.post('/login', (req, res) => {
    const { email, password } = req.body;

    const sql = "SELECT * FROM Users WHERE email = ?";
    db.get(sql, [email], async (err, user) => {
        if (err) return res.send('เกิดข้อผิดพลาด: ' + err.message);
        if (!user) return res.redirect('/login?error=1'); // ถ้าไม่มี user

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.redirect('/login?error=1');

        req.session.user = user; // เก็บข้อมูลผู้ใช้ใน session
        res.redirect('/'); // กลับไปหน้า home
    });
});

// Logout
app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/login'); // กลับไปหน้า login
    });
});


app.get('/checkout', (req, res) => {
    const isLoggedIn = req.session && req.session.user ? true : false;
    res.render('checkout', { isLoggedIn });
});

app.get('/register', (req, res) => {
    const success = req.query.success ? true : false;
    const isLoggedIn = req.session && req.session.user ? true : false;
    res.render('register', { isLoggedIn, success });
});

app.post('/register', async (req, res) => {
    const { first_name, last_name, dob, email, password, confirm_password, phone, gender } = req.body;

    // Check if passwords match
    if (password !== confirm_password) {
        return res.send("Error: Passwords do not match!");
    }

    // Hash password before storing
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert user into database
    const sql = `
        INSERT INTO users (first_name, last_name, dob, email, password, phone, gender)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    db.run(sql, [first_name, last_name, dob, email, hashedPassword, phone, gender], function (err) {
        if (err) {
            return res.send('Error: ' + err.message);
        }
        res.redirect('/register?success=1');
    });
});

app.get('/allsandwich', (req, res) => {
    const isLoggedIn = req.session && req.session.user ? true : false;
    db.all("SELECT name, price FROM menu WHERE type = 'sandwich'", (err, rows) => {
        if (err) {
            console.error(err);
            return res.status(500).send("Error fetching sandwiches data.");
        }
         // ส่งข้อมูลไปยังหน้า allsandwich
         res.render('allsandwich', { 
            isLoggedIn,
            sandwiches: rows.map(row => ({
                name: row.name,
                price: row.price,
                image: "/img/ham.png" // แทนค่าภาพด้วย default image
            }))
        });
    });
});

app.get('/comboset', (req, res) => {
    const isLoggedIn = req.session && req.session.user ? true : false;
    db.all("SELECT name, price FROM menu WHERE type = 'comboset' ", (err, rows) => {
        if (err) {
            console.error(err);
            return res.status(500).send("Error fetching comboset data.");
        }
         // ส่งข้อมูลไปยังหน้า allsandwich
         res.render('comboset', { 
            isLoggedIn,
            comboset: rows.map(row => ({
                name: row.name,
                price: row.price,
                image: "/img/ham.png" // แทนค่าภาพด้วย default image
            }))
        });
    });
});

app.get('/appetizers', (req, res) => {
    const isLoggedIn = req.session && req.session.user ? true : false;

    // ดึงข้อมูลจากฐานข้อมูลที่ type = 'appetizer'
    db.all("SELECT name, price FROM menu WHERE type = 'appitizer'", (err, rows) => {
        if (err) {
            console.error(err);
            return res.status(500).send("Error fetching appetizers data.");
        }

        // ส่งข้อมูลไปยังหน้า appetizers
        res.render('appetizers', { 
            isLoggedIn, 
            appetizers: rows.map(row => ({
                name: row.name,
                price: row.price,
                image: row.image || "/img/ham.png" // ใช้ default image ถ้าไม่มีภาพใน db
            }))
        });
    });
});

app.get('/drinks', (req, res) => {
    const isLoggedIn = req.session && req.session.user ? true : false;
    db.all("SELECT name, price FROM menu WHERE type = 'drink'", (err, rows) => {
        if (err) {
            console.error(err);
            return res.status(500).send("Error fetching drinks data.");
        }
         // ส่งข้อมูลไปยังหน้า allsandwich
         res.render('drinks', { 
            isLoggedIn,
            drinks: rows.map(row => ({
                name: row.name,
                price: row.price,
                image: "/img/ham.png" // แทนค่าภาพด้วย default image
            }))
        });
    });
});


app.get('/custom', (req, res) => {
    const isLoggedIn = req.session && req.session.user ? true : false;
    const meats = "SELECT thname, price, img FROM ingredients WHERE type = 'Meat'"
    const vegetables = "SELECT thname, price, img FROM ingredients WHERE type = 'Vegetables'"
    const sauces = "SELECT thname, price, img FROM ingredients WHERE type = 'Sauces'"

    db.all(meats, [], (err, meats) => {
        if (err) {
            console.error(err);
            return res.status(500).send('Database error');
        }

        db.all(vegetables, [], (err, vegetables) => {
            if (err) {
                console.error(err);
                return res.status(500).send('Database error');
            }

            db.all(sauces, [], (err, sauces) => {
                if (err) {
                    console.error(err);
                    return res.status(500).send('Database error');
                }

                // ส่งข้อมูลไปยัง view
                res.render('custom', { 
                    isLoggedIn, 
                    meats: meats.map(row => ({
                        name: row.thname,
                        price: row.price,
                        img: row.img
                    })), 
                    vegetables: vegetables.map(row => ({
                        name: row.thname,
                        price: row.price,
                        img: row.img
                    })), 
                    sauces: sauces.map(row => ({
                        name: row.thname,
                        price: row.price,
                        img: row.img
                    })) 
                });
            });
        });
    });
    
});

// เริ่มเซิร์ฟเวอร์
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});