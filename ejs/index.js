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
    res.render('allsandwich', { isLoggedIn,
        sandwiches: [
            { name: "Bacon and Cheese", price: 109, image: "/img/ham.png" },
            { name: "Ham Cheese", price: 89, image: "/img/ham.png" },
            { name: "Extra Cheese", price: 99, image: "/img/ham.png" },
            { name: "Blackpepper Chicken Breast", price: 119, image: "/img/ham.png" },
            { name: "BBQ Chicken", price: 99, image: "/img/ham.png" },
            { name: "Spicy Chicken", price: 99, image: "/img/ham.png" }
        ]
    });
});

app.get('/comboset', (req, res) => {
    const isLoggedIn = req.session && req.session.user ? true : false;
    const comboset = [
        { name: 'Mashed Potato', price: 79, image: '/img/ham.png' },
        { name: 'Croissant', price: 99, image: '/img/ham.png' },
        { name: 'Cookie', price: 69, image: '/img/ham.png' },
        { name: 'French Fries', price: 89, image: '/img/ham.png' },
        { name: 'Fried Onions', price: 79, image: '/img/ham.png' },
        { name: 'Cheese Sticks', price: 99, image: '/img/ham.png' }
    ];
    res.render('comboset', { isLoggedIn, comboset });
});

app.get('/appetizers', (req, res) => {
    const isLoggedIn = req.session && req.session.user ? true : false;
    const appetizers = [
        { name: 'Mashed Potato', price: 79, image: '/img/ham.png' },
        { name: 'Croissant', price: 99, image: '/img/ham.png' },
        { name: 'Cookie', price: 69, image: '/img/ham.png' },
        { name: 'French Fries', price: 89, image: '/img/ham.png' },
        { name: 'Fried Onions', price: 79, image: '/img/ham.png' },
        { name: 'Cheese Sticks', price: 99, image: '/img/ham.png' }
    ];
    res.render('appetizers', { isLoggedIn, appetizers });
});

app.get('/drinks', (req, res) => {
    const isLoggedIn = req.session && req.session.user ? true : false;
    const drinks = [
        { name: 'Coke', price: 30, image: '/img/coke.png' },
        { name: 'Sprite', price: 30, image: '/img/sprite.png' },
        { name: 'Fanta', price: 30, image: '/img/fanta.png' },
        { name: 'Orange Juice', price: 40, image: '/img/orange_juice.png' },
        { name: 'Lemon Tea', price: 45, image: '/img/lemon_tea.png' },
        { name: 'Iced Coffee', price: 50, image: '/img/iced_coffee.png' }
    ];
    res.render('drinks', { isLoggedIn, drinks });
});



app.get('/custom', (req, res) => {
    const isLoggedIn = req.session && req.session.user ? true : false;
    res.render('custom', { isLoggedIn });
});

// เริ่มเซิร์ฟเวอร์
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});