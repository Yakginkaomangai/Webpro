const express = require('express');
const path = require('path');
const fs = require('fs');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const fileUpload = require('express-fileupload');

const recommendedQuery = `SELECT * FROM menu ORDER BY COALESCE(popularity, 0) DESC LIMIT 3`;
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
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(fileUpload());

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
app.post('/admin/menu/add', (req, res) => {
    const { name, thname, price, type } = req.body;
    
    // ตรวจสอบค่าที่ได้รับจากฟอร์ม
    if (!name || !thname || !price || !type) {
        return res.status(400).send('กรุณากรอกข้อมูลให้ครบ');
    }

    let newImg = req.files?.img;
    let imgPath = null; // ตั้งค่าเริ่มต้นเป็น null

    if (newImg) {
        imgPath = `/img/${type}s/${newImg.name}`;
        const savePath = path.join(__dirname, 'public', imgPath);

        if (!fs.existsSync(path.dirname(savePath))) {
            return res.status(400).send('โฟลเดอร์ไม่ถูกต้อง');
        }

        newImg.mv(savePath, (err) => {
            if (err) {
                console.error(err);
                return res.status(500).send('เกิดข้อผิดพลาดในการอัปโหลดรูปภาพ');
            }

            db.run(
                'INSERT INTO menu (name, thname, price, type, img) VALUES (?, ?, ?, ?, ?)',
                [name, thname, price, type, imgPath],
                (err) => {
                    if (err) {
                        console.error(err);
                        return res.status(500).send('เกิดข้อผิดพลาดในการเพิ่มเมนู');
                    }
                    res.redirect('/admin');
                }
            );
        });
    } else {
        return res.status(400).send('กรุณาอัปโหลดรูปภาพ');
    }
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
    const { name, thname, price, type } = req.body;
    let newImg = req.files?.img;

    // ดึง path รูปเดิมจากฐานข้อมูล
    db.get(`SELECT img FROM menu WHERE menu_id = ?`, [menu_id], (err, row) => {
        if (err) {
            console.error(err);
            return res.status(500).send('เกิดข้อผิดพลาดในการดึงข้อมูลเมนู');
        }

        let imgPath = row?.img || null; // ใช้ path เดิมถ้าไม่มีการอัปโหลดใหม่

        if (newImg) {
            // ใช้โฟลเดอร์ที่มีอยู่แล้ว: public/img/types/
            imgPath = `/img/${type}s/${newImg.name}`;
            const savePath = path.join(__dirname, 'public', imgPath);

            // ตรวจสอบว่าโฟลเดอร์มีอยู่หรือไม่ แต่ **ไม่สร้างใหม่**
            if (!fs.existsSync(path.dirname(savePath))) {
                return res.status(400).send('โฟลเดอร์ไม่ถูกต้อง');
            }

            // ย้ายไฟล์ไปยังโฟลเดอร์
            newImg.mv(savePath, (err) => {
                if (err) {
                    console.error(err);
                    return res.status(500).send('เกิดข้อผิดพลาดในการอัปโหลดรูปภาพ');
                }

                // อัปเดตฐานข้อมูลพร้อม path รูปใหม่
                const sql = `UPDATE menu SET name = ?, thname = ?, price = ?, type = ?, img = ? WHERE menu_id = ?`;
                db.run(sql, [name, thname, price, type, imgPath, menu_id], function (err) {
                    if (err) {
                        console.error(err);
                        return res.status(500).send('เกิดข้อผิดพลาดในการอัปเดตเมนู');
                    }
                    res.redirect('/admin');
                });
            });
        } else {
            // ถ้าไม่มีการอัปโหลดใหม่ ให้อัปเดตข้อมูลโดยใช้ path รูปเดิม
            const sql = `UPDATE menu SET name = ?, thname = ?, price = ?, type = ?, img = ? WHERE menu_id = ?`;
            db.run(sql, [name, thname, price, type, imgPath, menu_id], function (err) {
                if (err) {
                    console.error(err);
                    return res.status(500).send('เกิดข้อผิดพลาดในการอัปเดตเมนู');
                }
                res.redirect('/admin');
            });
        }
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

app.get('/admin/ingredients', isAdmin, (req, res) => {
    const isLoggedIn = req.session && req.session.user ? true : false;
    const isAdmin = req.session.user && req.session.user.role === 'admin';

    if (isAdmin) {
        db.all('SELECT * FROM ingredients ORDER BY type', (err, rows) => {
            if (err) {
                console.error(err);
                return res.status(500).send('เกิดข้อผิดพลาด');
            }
            res.render('admin/ingredients', { isLoggedIn, isAdmin, ingredients: rows });
        });
    } else {
        res.redirect('/login');
    }
});

// หน้าเพิ่มเมนู
app.get('/admin/ingredients/add', isAdmin, (req, res) => {
    const isLoggedIn = req.session && req.session.user ? true : false;
    const isAdmin = req.session.user && req.session.user.role === 'admin';
    res.render('admin/addingre', { isLoggedIn, isAdmin});
});

// เพิ่มเมนูในฐานข้อมูล
app.post('/admin/ingredients/add', (req, res) => {
    const { name, thname, price, type } = req.body;
    
    // ตรวจสอบค่าที่ได้รับจากฟอร์ม
    if (!name || !thname || !price || !type) {
        return res.status(400).send('กรุณากรอกข้อมูลให้ครบ');
    }

    let newImg = req.files?.img;
    let imgPath = null; // ตั้งค่าเริ่มต้นเป็น null

    if (newImg) {
        imgPath = `/img/ingredients/${newImg.name}`;
        const savePath = path.join(__dirname, 'public', imgPath);

        if (!fs.existsSync(path.dirname(savePath))) {
            return res.status(400).send('โฟลเดอร์ไม่ถูกต้อง');
        }

        newImg.mv(savePath, (err) => {
            if (err) {
                console.error(err);
                return res.status(500).send('เกิดข้อผิดพลาดในการอัปโหลดรูปภาพ');
            }

            db.run(
                'INSERT INTO ingredients (name, thname, price, type, img) VALUES (?, ?, ?, ?, ?)',
                [name, thname, price, type, imgPath],
                (err) => {
                    if (err) {
                        console.error(err);
                        return res.status(500).send('เกิดข้อผิดพลาดในการเพิ่มเมนู');
                    }
                    res.redirect('/admin/ingredients');
                }
            );
        });
    } else {
        return res.status(400).send('กรุณาอัปโหลดรูปภาพ');
    }
});



// หน้าแก้ไขเมนู
app.get('/admin/ingredients/edit/:ingre_id', isAdmin, (req, res) => {
    const isLoggedIn = req.session && req.session.user ? true : false;
    const isAdmin = req.session.user && req.session.user.role === 'admin';
    const { ingre_id } = req.params;
    db.get('SELECT * FROM ingredients WHERE ingre_id = ?', [ingre_id], (err, row) => {
        if (err) {
            console.error(err);
            return res.status(500).send('เกิดข้อผิดพลาด');
        }
        res.render('admin/editingre', { isLoggedIn, isAdmin, ingredients: row });
    });
});

// อัปเดตเมนูในฐานข้อมูล
app.post('/admin/ingredients/edit/:ingre_id', isAdmin, (req, res) => {
    const { menu_id } = req.params;
    const { name, thname, price, type } = req.body;
    let newImg = req.files?.img;

    // ดึง path รูปเดิมจากฐานข้อมูล
    db.get(`SELECT img FROM ingredients WHERE ingre_id = ?`, [ingre_id], (err, row) => {
        if (err) {
            console.error(err);
            return res.status(500).send('เกิดข้อผิดพลาดในการดึงข้อมูลเมนู');
        }

        let imgPath = row?.img || null; // ใช้ path เดิมถ้าไม่มีการอัปโหลดใหม่

        if (newImg) {
            // ใช้โฟลเดอร์ที่มีอยู่แล้ว: public/img/types/
            imgPath = `/img/ingredients/${newImg.name}`;
            const savePath = path.join(__dirname, 'public', imgPath);

            // ตรวจสอบว่าโฟลเดอร์มีอยู่หรือไม่ แต่ **ไม่สร้างใหม่**
            if (!fs.existsSync(path.dirname(savePath))) {
                return res.status(400).send('โฟลเดอร์ไม่ถูกต้อง');
            }

            // ย้ายไฟล์ไปยังโฟลเดอร์
            newImg.mv(savePath, (err) => {
                if (err) {
                    console.error(err);
                    return res.status(500).send('เกิดข้อผิดพลาดในการอัปโหลดรูปภาพ');
                }

                // อัปเดตฐานข้อมูลพร้อม path รูปใหม่
                const sql = `UPDATE ingredients SET name = ?, thname = ?, price = ?, type = ?, img = ? WHERE ingre_id = ?`;
                db.run(sql, [name, thname, price, type, imgPath, ingre_id], function (err) {
                    if (err) {
                        console.error(err);
                        return res.status(500).send('เกิดข้อผิดพลาดในการอัปเดตเมนู');
                    }
                    res.redirect('/admin/ingredients');
                });
            });
        } else {
            // ถ้าไม่มีการอัปโหลดใหม่ ให้อัปเดตข้อมูลโดยใช้ path รูปเดิม
            const sql = `UPDATE ingredients SET name = ?, thname = ?, price = ?, type = ?, img = ? WHERE ingre_id = ?`;
            db.run(sql, [name, thname, price, type, imgPath, ingre_id], function (err) {
                if (err) {
                    console.error(err);
                    return res.status(500).send('เกิดข้อผิดพลาดในการอัปเดตเมนู');
                }
                res.redirect('/admin/ingredients');
            });
        }
    });
});

// ลบเมนู
app.post('/admin/ingredients/delete/:ingre_id', isAdmin, (req, res) => {
    const { menu_id } = req.params;
    db.run('DELETE FROM ingredients WHERE ingre_id = ?', [menu_id], function(err) {
        if (err) {
            console.error(err);
            return res.status(500).send('เกิดข้อผิดพลาดในการลบเมนู');
        }
        res.redirect('/admin/ingredients');
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
    const recommendedQuery = `SELECT * FROM menu ORDER BY COALESCE(popularity, 0) DESC LIMIT 3`;
    const cartQuery = `
    SELECT cart.*, menu.name, menu.price, menu.img 
    FROM cart 
    JOIN menu ON cart.product_id = menu.menu_id 
    WHERE cart.user_id = ?`;



    if (!req.session.user) {
        return res.redirect('/login'); // ถ้าไม่ได้ล็อกอินให้ไปหน้า login
    }

    db.all(recommendedQuery, [], (err, recommendedMenu) => {
        if (err) {
            console.error("🔥 Database Error (Recommended Menu):", err.message);
            return res.status(500).send(`🔥 Database Error: ${err.message}`);
        }

        db.all(cartQuery, [req.session.user.id], (err, cartItems) => {
            if (err) {
                console.error("🔥 Database Error (Cart):", err.message);
                return res.status(500).send(`🔥 Database Error: ${err.message}`);
            }

            // ✅ คำนวณค่า Subtotal
            let subtotal = cartItems.reduce((sum, item) => sum + (item.price * (item.quantity || 1)), 0);
            let total = subtotal; // ค่าส่งฟรี

            console.log("✅ Cart Items:", cartItems);
            console.log("✅ Subtotal:", subtotal);
            console.log("✅ Total:", total);

            res.render('checkout', {
                isLoggedIn: req.session.user ? true : false,
                isAdmin: req.session.user ? req.session.user.role === 'admin' : false,
                recommendedMenu: recommendedMenu,
                cartItems: cartItems || [], // ถ้าไม่มีให้ใช้ array ว่าง
                subtotal: cartItems.reduce((sum, item) => sum + (item.price * (item.quantity || 1)), 0),
                total: cartItems.reduce((sum, item) => sum + (item.price * (item.quantity || 1)), 0)
            });
        });
    });
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
    
    db.all("SELECT * FROM menu WHERE type = 'sandwich'", (err, rows) => {
        if (err) {
            console.error("Database error:", err);
            return res.status(500).send("Error fetching sandwiches data.");
        }

        console.log("Fetched sandwiches:", rows); // ✅ ตรวจสอบค่าที่ได้จาก DB

        res.render('allsandwich', { 
            isLoggedIn,
            isAdmin,
            sandwiches: rows
        });
    });
});


app.get('/comboset', (req, res) => {
    const isLoggedIn = req.session && req.session.user ? true : false;
    const isAdmin = req.session.user && req.session.user.role === 'admin';
    
    db.all("SELECT * FROM menu WHERE type = 'combo'", (err, rows) => {
        if (err) {
            console.error("Database error:", err);
            return res.status(500).send("Error fetching combo set data.");
        }

        console.log("Fetched combo sets:", rows); // ✅ Debug ข้อมูลที่ได้จาก DB

        res.render('comboset', { 
            isLoggedIn,
            isAdmin,
            combosets: rows
        });
    });
});



app.get('/appetizers', (req, res) => {
    const isLoggedIn = req.session && req.session.user ? true : false;
    const isAdmin = req.session.user && req.session.user.role === 'admin';
    
    db.all("SELECT * FROM menu WHERE type = 'appetizer'", (err, rows) => {
        if (err) {
            console.error("Database error:", err);
            return res.status(500).send("Error fetching appetizers data.");
        }

        console.log("🍽️ Debug Appetizers:", rows); // ✅ ตรวจสอบค่าที่ดึงมา

        res.render('appetizers', { 
            isLoggedIn,
            isAdmin,
            appetizers: rows
        });
    });
});


app.get('/drinks', (req, res) => {
    const isLoggedIn = req.session && req.session.user ? true : false;
    const isAdmin = req.session.user && req.session.user.role === 'admin';
    db.all("SELECT * FROM menu WHERE type = 'drink'", (err, rows) => {
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
    const breads = "SELECT thname, price, img FROM ingredients WHERE type = 'Bread'"
    const meats = "SELECT thname, price, img FROM ingredients WHERE type = 'Meat'"
    const vegetables = "SELECT thname, price, img FROM ingredients WHERE type = 'Vegetables'"
    const sauces = "SELECT thname, price, img FROM ingredients WHERE type = 'Sauces'"
    
            db.all(breads, [], (err, breads) => {
                if (err) {
                    console.error(err);
                    return res.status(500).send('Database error');
                }
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
                            breads: breads.map(row => ({
                                name: row.thname,
                                price: row.price,
                                img: row.img
                            })),  
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
});

// เส้นทางสำหรับแสดงหน้าข้อมูลผู้ใช้
app.get('/user', (req, res) => {
    // ตัวอย่างข้อมูลที่สามารถส่งไปแสดงในหน้า HTML
    const isLoggedIn = req.session && req.session.user ? true : false;
    const isAdmin = req.session.user && req.session.user.role === 'admin';
    const user = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com',
        phone: '123-456-7890',
        gender: 'ชาย',
        birthDate: '1990-01-01',
    };

    const orders = [
        {
            id: 12345,
            status: 'จัดส่งแล้ว',
            orderDate: '2023-10-01',
            deliveryDate: '2023-10-05',
        },
        {
            id: 67890,
            status: 'กำลังดำเนินการ',
            orderDate: '2023-10-10',
            deliveryDate: '-',
        },
    ];

    // Render หน้า user-detail.ejs พร้อมส่งข้อมูล
    res.render('user', { isLoggedIn, isAdmin, user, orders });
});

app.use(express.json()); // รองรับ JSON ในการรับ-ส่งข้อมูล

// 🛒 1. เพิ่มสินค้าเข้าตะกร้า
app.post('/cart/add', (req, res) => {
    if (!req.session.user || !req.session.user.id) {
        return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบก่อนเพิ่มสินค้า' });
    }

    const user_id = req.session.user.id; // ดึง user_id จาก session
    const { product_id, product_name, price, quantity } = req.body; // รับ quantity จาก frontend

    // ถ้า quantity ไม่ถูกต้อง ให้ return error
    if (!quantity || quantity <= 0) {
        return res.status(400).json({ error: 'จำนวนสินค้าต้องมากกว่า 0' });
    }

    db.get(`SELECT * FROM cart WHERE user_id = ? AND product_id = ?`, [user_id, product_id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });

        if (row) {
            // อัปเดต quantity ของสินค้าในตะกร้า
            db.run(`UPDATE cart SET quantity = quantity + ? WHERE id = ?`, [quantity, row.id], function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ message: `เพิ่ม ${product_name} ${quantity} ชิ้นในตะกร้าแล้ว` });
            });
        } else {
            // เพิ่มสินค้าใหม่ลงในตะกร้า
            db.run(`INSERT INTO cart (user_id, product_id, product_name, price, quantity) VALUES (?, ?, ?, ?, ?)`, 
                [user_id, product_id, product_name, price, quantity], function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ message: `เพิ่ม ${product_name} ${quantity} ชิ้นเข้าตะกร้าเรียบร้อย` });
            });
        }
    });
});



// 🗑️ 2. ลบสินค้าออกจากตะกร้า
app.post('/cart/remove', (req, res) => {
    const { cart_id } = req.body;  // รับ cart_id จาก body
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


app.get('/get-toppings', (req, res) => {
    let db = new sqlite3.Database('project.db');
    db.all('SELECT * FROM toppings', [], (err, rows) => {
        if (err) {
            res.status(500).send({ error: err.message });
        } else {
            res.json(rows);
        }
    });
});

app.post('/submit-order', (req, res) => {
    let db = new sqlite3.Database('project.db');
    let { cart } = req.body;

    if (!cart || cart.length === 0) {
        return res.status(400).json({ error: "ตะกร้าสินค้าว่างเปล่า" });
    }

    let orderId = Date.now();
    let query = "INSERT INTO orders (order_id, item_name, quantity, price) VALUES (?, ?, ?, ?)";
    
    let stmt = db.prepare(query);
    cart.forEach(item => {
        stmt.run(orderId, item.name, item.quantity, item.price * item.quantity);
    });
    stmt.finalize();

    res.json({ orderId });
});

// เริ่มเซิร์ฟเวอร์
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});