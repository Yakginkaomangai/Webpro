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

// Middleware ตรวจสอบว่าเป็น admin หรือไม่
function isAdmin(req, res, next) {
    if (req.session.user && req.session.user.role === 'admin') {
        return next(); // ถ้าเป็น admin ให้ดำเนินการต่อ
    } else {
        return res.status(403).send('คุณไม่มีสิทธิ์เข้าถึงหน้านี้');
    }
}

// หน้า Admin Dashboard
app.get('/admin', isAdmin, (req, res) => {
    const isLoggedIn = req.session && req.session.user ? true : false;
    const isAdmin = req.session.user && req.session.user.role === 'admin';

    if (isAdmin) {
        db.all('SELECT * FROM menu ORDER BY type', (err, rows) => {
            if (err) {
                console.error(err);
                return res.status(500).send('เกิดข้อผิดพลาด');
            }
            res.render('admin/dashboard', { isLoggedIn, isAdmin, menus: rows });
        });
    } else {
        res.redirect('/login');
    }
});

// หน้าเพิ่มเมนู
app.get('/admin/menu/add', isAdmin, (req, res) => {
    const isLoggedIn = req.session && req.session.user ? true : false;
    const isAdmin = req.session.user && req.session.user.role === 'admin';
    res.render('admin/addMenu', { isLoggedIn, isAdmin});
});

// เพิ่มเมนูในฐานข้อมูล
app.post('/admin/menu/add', isAdmin, (req, res) => {
    const { name, thname, price, type, img } = req.body;

    const sql = `INSERT INTO menu (name, thname, price, type, img) VALUES (?, ?, ?, ?, ?)`;
    db.run(sql, [name, thname, price, type, img], function(err) {
        if (err) {
            console.error(err);
            return res.status(500).send('เกิดข้อผิดพลาดในการเพิ่มเมนู');
        }
        res.redirect('/admin');
    });
});

// หน้าแก้ไขเมนู
app.get('/admin/menu/edit/:menu_id', isAdmin, (req, res) => {
    const isLoggedIn = req.session && req.session.user ? true : false;
    const isAdmin = req.session.user && req.session.user.role === 'admin';
    const { menu_id } = req.params;
    db.get('SELECT * FROM menu WHERE menu_id = ?', [menu_id], (err, row) => {
        if (err) {
            console.error(err);
            return res.status(500).send('เกิดข้อผิดพลาด');
        }
        res.render('admin/editMenu', { isLoggedIn, isAdmin, menu: row });
    });
});

// อัปเดตเมนูในฐานข้อมูล
app.post('/admin/menu/edit/:menu_id', isAdmin, (req, res) => {
    const { menu_id } = req.params;
    const { name, thname, price, type, img } = req.body;

    const sql = `UPDATE menu SET name = ?, thname = ?, price = ?, type = ?, img = ? WHERE menu_id = ?`;
    db.run(sql, [name, thname, price, type, img, menu_id], function(err) {
        if (err) {
            console.error(err);
            return res.status(500).send('เกิดข้อผิดพลาดในการอัปเดตเมนู');
        }
        res.redirect('/admin');
    });
});

// ลบเมนู
app.post('/admin/menu/delete/:menu_id', isAdmin, (req, res) => {
    const { menu_id } = req.params;
    db.run('DELETE FROM menu WHERE menu_id = ?', [menu_id], function(err) {
        if (err) {
            console.error(err);
            return res.status(500).send('เกิดข้อผิดพลาดในการลบเมนู');
        }
        res.redirect('/admin');
    });
});

// Routes
app.get('/', (req, res) => {
    const isLoggedIn = req.session && req.session.user ? true : false;
    const isAdmin = req.session.user && req.session.user.role === 'admin';
    res.render('home', {isLoggedIn, isAdmin})
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

        req.session.user = {
            id: user.user_id,
            email: user.email,
            name: user.name,
            role: user.role
        }; // เก็บข้อมูลผู้ใช้ใน session


         // ✅ บันทึก Session ก่อน Redirect
        req.session.save(err => {
            if (err) return res.send('Error saving session: ' + err.message);
            res.redirect('/'); // กลับไปหน้า Home
        }); 
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
    const isAdmin = req.session.user && req.session.user.role === 'admin';
    res.render('checkout', { isLoggedIn, isAdmin });
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
    const isAdmin = req.session.user && req.session.user.role === 'admin';
    
    db.all("SELECT menu_id, name, thname, price, img FROM menu WHERE type = 'sandwich'", (err, rows) => {
        if (err) {
            console.error("Database error:", err);
            return res.status(500).send("Error fetching sandwiches data.");
        }

        console.log("Fetched sandwiches:", rows); // ✅ ตรวจสอบค่าที่ได้จาก DB

        res.render('allsandwich', { 
            isLoggedIn,
            isAdmin,
            sandwiches: rows.map(row => ({
                menu_id: row.menu_id,  // <- ตรวจสอบว่ามีค่าหรือไม่
                name: row.name,
                thname: row.thname,
                price: row.price,
                img: row.img
            }))
        });
    });
});


app.get('/comboset', (req, res) => {
    const isLoggedIn = req.session && req.session.user ? true : false;
    const isAdmin = req.session.user && req.session.user.role === 'admin';
    
    db.all("SELECT combo_id, name, description, price, img FROM combo", (err, rows) => {
        if (err) {
            console.error("Database error:", err);
            return res.status(500).send("Error fetching combo set data.");
        }

        console.log("Fetched combo sets:", rows); // ✅ Debug ข้อมูลที่ได้จาก DB

        res.render('comboset', { 
            isLoggedIn,
            isAdmin,
            combosets: rows.map(row => ({
                menu_id: row.combo_id,  // ✅ เปลี่ยนจาก menu_id เป็น combo_id
                name: row.name,
                thname: row.description, // ✅ ใช้ description เป็นรายละเอียดของคอมโบ้
                price: row.price,
                img: row.img
            }))
        });
    });
});



app.get('/appetizers', (req, res) => {
    const isLoggedIn = req.session && req.session.user ? true : false;
    const isAdmin = req.session.user && req.session.user.role === 'admin';
    
    db.all("SELECT menu_id, name, thname, price, img FROM menu WHERE type = 'appetizer'", (err, rows) => {
        if (err) {
            console.error("Database error:", err);
            return res.status(500).send("Error fetching appetizers data.");
        }

        console.log("🍽️ Debug Appetizers:", rows); // ✅ ตรวจสอบค่าที่ดึงมา

        res.render('appetizers', { 
            isLoggedIn,
            isAdmin,
            appetizers: rows.map(row => ({
                menu_id: row.menu_id,  
                name: row.name,
                thname: row.thname,
                price: row.price,
                img: row.img
            }))
        });
    });
});


app.get('/drinks', (req, res) => {
    const isLoggedIn = req.session && req.session.user ? true : false;
    const isAdmin = req.session.user && req.session.user.role === 'admin';
    db.all("SELECT menu_id, name, thname, price, img FROM menu WHERE type = 'drink'", (err, rows) => {
        if (err) {
            console.error("Database error:", err);
            return res.status(500).send("Error fetching drinks data.");
        }
        console.log("Fetched drinks:", rows);
        res.render('drinks', { 
            isLoggedIn,
            isAdmin,
            drinks: rows
        });
    });
});

app.get('/custom', (req, res) => {
    const isLoggedIn = req.session && req.session.user ? true : false;
    const isAdmin = req.session.user && req.session.user.role === 'admin';
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
                    isAdmin, 
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

app.use(express.json()); // รองรับ JSON ในการรับ-ส่งข้อมูล

// 🛒 1. เพิ่มสินค้าเข้าตะกร้า
app.post('/cart/add', (req, res) => {
    if (!req.session.user || !req.session.user.id) {
        return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบก่อนเพิ่มสินค้า' });
    }

    const user_id = req.session.user.id; // ✅ ดึง user_id จาก session
    const { product_id, product_name, price } = req.body;

    db.get(`SELECT * FROM cart WHERE user_id = ? AND product_id = ?`, [user_id, product_id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });

        if (row) {
            db.run(`UPDATE cart SET quantity = quantity + 1 WHERE id = ?`, [row.id], function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ message: 'เพิ่มจำนวนสินค้าในตะกร้าแล้ว' });
            });
        } else {
            db.run(`INSERT INTO cart (user_id, product_id, product_name, price, quantity) VALUES (?, ?, ?, ?, ?)`, 
                [user_id, product_id, product_name, price, 1], function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ message: 'เพิ่มสินค้าเข้าตะกร้าเรียบร้อย' });
            });
        }
    });
});



// 🗑️ 2. ลบสินค้าออกจากตะกร้า
app.post('/cart/remove', (req, res) => {
    const { cart_id } = req.body;
    db.run(`DELETE FROM cart WHERE id = ?`, [cart_id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'ลบสินค้าออกจากตะกร้าสำเร็จ' });
    });
});

// 🔄 3. อัปเดตจำนวนสินค้าในตะกร้า
app.post('/cart/update', (req, res) => {
    const { cart_id, quantity } = req.body;
    db.run(`UPDATE cart SET quantity = ? WHERE id = ?`, [quantity, cart_id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'อัปเดตจำนวนสินค้าเรียบร้อย' });
    });
});

// 📌 API ดึงข้อมูลตะกร้าสินค้า
app.get('/cart/items', (req, res) => {
    const user_id = req.session.user ? req.session.user.id : null;

    if (!user_id) {
        return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบก่อนดูตะกร้า' });
    }

    db.all(`SELECT * FROM cart WHERE user_id = ?`, [user_id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ cart: rows });
    });
}); 

// เริ่มเซิร์ฟเวอร์
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});