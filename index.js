const express = require('express');
const path = require('path');
const fs = require('fs');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const fileUpload = require('express-fileupload');

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

function isManager(req, res, next) {
    if (req.session.user && req.session.user.role === 'manager') {
        return next(); // ถ้าเป็น manager ให้ดำเนินการต่อ
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
    const { ingre_id } = req.params;
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
    const { ingre_id } = req.params;
    db.run('DELETE FROM ingredients WHERE ingre_id = ?', [ingre_id], function(err) {
        if (err) {
            console.error(err);
            return res.status(500).send('เกิดข้อผิดพลาดในการลบเมนู');
        }
        res.redirect('/admin/ingredients');
    });
});

app.get('/user', (req, res) => {
    if (!req.session || !req.session.user) {
        return res.redirect('/login');
    }

    const user_id = req.session.user.id;
    const isAdmin = req.session.user.role === 'admin';
    const isManager = req.session.user.role === 'manager';

    db.get('SELECT * FROM users WHERE user_id = ?', [user_id], (err, user) => {
        if (err) {
            console.error("Database error:", err);
            return res.status(500).send('เกิดข้อผิดพลาด');
        }
    
        if (!user) {
            return res.status(404).send('ไม่พบข้อมูลผู้ใช้');
        }
        
        
            // ดึงข้อมูลคำสั่งซื้อของผู้ใช้
            const query = `
            SELECT o.order_id, o.created_at, o.total_price, o.status, oi.name, oi.quantity, oi.price
            FROM orders o
            JOIN order_items oi ON o.order_id = oi.order_id
            WHERE o.user_id = ?
            ORDER BY o.created_at DESC
        `;

        db.all(query, [user_id], (err, orders) => {
            if (err) {
                console.error("Error fetching orders:", err);
                return res.status(500).send('เกิดข้อผิดพลาดในการโหลดคำสั่งซื้อ');
            }

            // รวมข้อมูลของ order_items สำหรับแต่ละ order_id
            const ordersWithItems = orders.reduce((acc, order) => {
                const existingOrder = acc.find(o => o.order_id === order.order_id);
                
                if (existingOrder) {
                    existingOrder.items.push({
                        name: order.name,
                        quantity: order.quantity,
                        price: order.price
                    });
                    existingOrder.totalPrice += order.quantity * order.price; // อัปเดตราคาสุทธิ
                } else {
                    acc.push({
                        order_id: order.order_id,
                        created_at: order.created_at,
                        status: order.status,
                        items: [{
                            name: order.name,
                            quantity: order.quantity,
                            price: order.price
                        }],
                        totalPrice: order.quantity * order.price
                    });
                }

                return acc;
            }, []);

            res.render('user/profile', { isLoggedIn: true, isAdmin, isManager, users: user, orders: ordersWithItems });
        });
        
    });
});

app.get('/user/edit/:user_id', (req, res) => {
    if (!req.session || !req.session.user) {
        return res.redirect('/login');
    }

    const isLoggedIn = true;
    const isAdmin = req.session.user.role === 'admin';
    const isManager = req.session.user.role === 'manager';
    const user_id = req.params.user_id;

    db.get('SELECT * FROM users WHERE user_id = ?', [user_id], (err, row) => {
        if (err) {
            console.error(err);
            return res.status(500).send('เกิดข้อผิดพลาด');
        }

        if (!row) {
            return res.status(404).send('ไม่พบข้อมูลผู้ใช้');
        }

        res.render('user/useredit', { isLoggedIn, isAdmin, isManager, users: row });
    });
});


app.post('/user/useredit/:user_id', async (req, res) => {
    const { first_name, last_name, dob, email, password, confirm_password, phone, gender} = req.body;
    const user_id = req.params.user_id;

    // Check if passwords match if they are provided
    if (password && password !== confirm_password) {
        return res.send("Error: Passwords do not match!");
    }

    // Log the user_id to ensure it's being passed correctly
    console.log("User ID:", user_id);

    // Fetch the current user data to get the existing password if needed
    db.get('SELECT password FROM users WHERE user_id = ?', [user_id], async (err, row) => {
        if (err) {
            console.error("Database Error:", err);  // Log detailed database error
            return res.status(500).send('เกิดข้อผิดพลาดในการค้นหาข้อมูลผู้ใช้');
        }

        if (!row) {
            console.error("User not found for user_id:", user_id);  // Log if user is not found
            return res.status(404).send('ไม่พบผู้ใช้ในระบบ');
        }

        // Use existing password if no new password is provided
        let hashedPassword;
        if (password) {
            hashedPassword = await bcrypt.hash(password, 10);  // Hash new password
        } else {
            hashedPassword = row.password;  // Use the existing password from the database
        }

        // Prepare the SQL query to update the user data
        const sql = `UPDATE users SET first_name = ?, last_name = ?, dob = ?, email = ?, password = ?, phone = ?, gender = ? WHERE user_id = ?`;

        console.log("SQL Query:", sql);
        console.log("Parameters:", [first_name, last_name, dob, email, hashedPassword, phone, gender, user_id]);

        // Execute the query to update user data
        db.run(sql, [first_name, last_name, dob, email, hashedPassword, phone, gender, user_id], function (err) {
            if (err) {
                console.error("Error while updating user data:", err);  // Log the error message
                return res.status(500).send('เกิดข้อผิดพลาดในการแก้ไขข้อมูล');
            }
            res.redirect('/user');
        });
    });
});


app.get('/manager/orders', isManager, (req, res) => {
    const isLoggedIn = req.session && req.session.user ? true : false;
    const isAdmin = req.session.user && req.session.user.role === 'admin';
    const isManager = req.session.user && req.session.user.role === 'manager';

    const query = `
        SELECT orders.order_id, orders.created_at, orders.status, orders.total_price, 
               users.first_name AS customer_name, oi.name AS product_name, oi.quantity, oi.price
        FROM orders
        JOIN users ON orders.user_id = users.user_id
        JOIN order_items oi ON orders.order_id = oi.order_id
        ORDER BY orders.created_at DESC
    `;

    db.all(query, [], (err, orders) => {
        if (err) {
            console.error(err);
            return res.status(500).send('Error retrieving orders');
        }

        // รวมข้อมูลของ order_items สำหรับแต่ละ order_id
        const ordersWithItems = orders.reduce((acc, order) => {
            const existingOrder = acc.find(o => o.order_id === order.order_id);
            
            if (existingOrder) {
                existingOrder.items.push({
                    product_name: order.product_name,
                    quantity: order.quantity,
                    price: order.price
                });
                existingOrder.totalPrice += order.quantity * order.price; // อัปเดตราคาสุทธิ
            } else {
                acc.push({
                    order_id: order.order_id,
                    created_at: order.created_at,
                    status: order.status,
                    customer_name: order.customer_name,
                    items: [{
                        product_name: order.product_name,
                        quantity: order.quantity,
                        price: order.price
                    }],
                    totalPrice: order.quantity * order.price
                });
            }

            return acc;
        }, []);

        res.render('manager/orders', { isLoggedIn, isManager, isAdmin, orders: ordersWithItems });
    });
});


// เส้นทางสำหรับอัปเดตสถานะคำสั่งซื้อ
app.post('/order/update-status/:order_id', isManager, (req, res) => {
    const { status } = req.body;
    const { order_id } = req.params;

    console.log("Updating order:", order_id, "to status:", status); // Debugging

    if (!status) {
        return res.status(400).send('Missing status');
    }

    // อัปเดตสถานะและเวลา update_at
    db.run('UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE order_id = ?', [status, order_id], (err) => {
        if (err) {
            console.error(err);
            return res.status(500).send('Error updating order status');
        }
        res.redirect('/manager/orders');
    });
});


app.post('/order/cancel/:order_id', isManager, (req, res) => {
    const { order_id } = req.params;

    // ลบจาก orders
    db.run('DELETE FROM orders WHERE order_id = ?', [order_id], (err) => {
        if (err) {
            console.error('Error deleting from orders:', err);
            return res.status(500).send('Error deleting order');
        }

        // ลบจาก order_items
        db.run('DELETE FROM order_items WHERE order_id = ?', [order_id], (err) => {
            if (err) {
                console.error('Error deleting from order_items:', err);
                return res.status(500).send('Error deleting order items');
            }

            // รีไดเร็กต์ไปที่หน้าคำสั่งซื้อหลังจากลบเสร็จ
            res.redirect('/manager/orders');
        });
    });
});




// Routes
app.get('/', (req, res) => {
    const isLoggedIn = req.session && req.session.user ? true : false;
    const isAdmin = req.session.user && req.session.user.role === 'admin';
    const isManager = req.session.user && req.session.user.role === 'manager';

    if (isLoggedIn && isManager) {
        return res.redirect('/manager/orders'); // ถ้าเป็น Manager ให้รีไดเรกต์ไปหน้า /manager/orders
    }
    if (isLoggedIn && isAdmin) {
        return res.redirect('/admin');
    }

    res.render('home', { isLoggedIn ,isAdmin, isManager});
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
        if (err) return res.status(500).json({ success: false, message: "เกิดข้อผิดพลาด: " + err.message });
        if (!user) return res.status(401).json({ success: false, message: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(401).json({ success: false, message: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" });

        req.session.user = {
            id: user.user_id,
            email: user.email,
            name: user.first_name,
            role: user.role
        }; // เก็บข้อมูลผู้ใช้ใน session

        req.session.save(err => {
            if (err) return res.status(500).json({ success: false, message: "Error saving session: " + err.message });

            // ✅ ส่ง response เป็น JSON (ลบ res.redirect('/'))
            res.json({
                success: true,
                user: { id: user.user_id, email: user.email, name: user.first_name }
            });
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
                isAdmin : req.session.user && req.session.user.role === 'admin',
                isManager : req.session.user && req.session.user.role === 'manager',
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
    const isManager = req.session.user && req.session.user.role === 'manager';
    
    db.all("SELECT * FROM menu WHERE type = 'sandwich'", (err, rows) => {
        if (err) {
            console.error("Database error:", err);
            return res.status(500).send("Error fetching sandwiches data.");
        }

        console.log("Fetched sandwiches:", rows); // ✅ ตรวจสอบค่าที่ได้จาก DB

        res.render('allsandwich', { 
            isLoggedIn,
            isAdmin, 
            isManager,
            sandwiches: rows
        });
    });
});


app.get('/comboset', (req, res) => {
    const isLoggedIn = req.session && req.session.user ? true : false;
    const isAdmin = req.session.user && req.session.user.role === 'admin';
    const isManager = req.session.user && req.session.user.role === 'manager';
    
    db.all("SELECT * FROM menu WHERE type = 'combo'", (err, rows) => {
        if (err) {
            console.error("Database error:", err);
            return res.status(500).send("Error fetching combo set data.");
        }

        console.log("Fetched combo sets:", rows); // ✅ Debug ข้อมูลที่ได้จาก DB

        res.render('comboset', { 
            isLoggedIn,
            isAdmin, 
            isManager,
            combosets: rows
        });
    });
});



app.get('/appetizers', (req, res) => {
    const isLoggedIn = req.session && req.session.user ? true : false;
    const isAdmin = req.session.user && req.session.user.role === 'admin';
    const isManager = req.session.user && req.session.user.role === 'manager';
    
    db.all("SELECT * FROM menu WHERE type = 'appetizer'", (err, rows) => {
        if (err) {
            console.error("Database error:", err);
            return res.status(500).send("Error fetching appetizers data.");
        }

        console.log("🍽️ Debug Appetizers:", rows); // ✅ ตรวจสอบค่าที่ดึงมา

        res.render('appetizers', { 
            isLoggedIn,
            isAdmin, 
            isManager,
            appetizers: rows
        });
    });
});


app.get('/drinks', (req, res) => {
    const isLoggedIn = req.session && req.session.user ? true : false;
    const isAdmin = req.session.user && req.session.user.role === 'admin';
    const isManager = req.session.user && req.session.user.role === 'manager';
    db.all("SELECT * FROM menu WHERE type = 'drink'", (err, rows) => {
        if (err) {
            console.error("Database error:", err);
            return res.status(500).send("Error fetching drinks data.");
        }
        console.log("Fetched drinks:", rows);
        res.render('drinks', { 
            isLoggedIn,
            isAdmin, 
            isManager,
            drinks: rows
        });
    });
});

app.get('/custom', (req, res) => {
    const isLoggedIn = req.session && req.session.user ? true : false;
    const isAdmin = req.session.user && req.session.user.role === 'admin';
    const isManager = req.session.user && req.session.user.role === 'manager';
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
                            isManager,
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

// ✅ API /order
app.post("/order", async (req, res) => {
    const { user_id, payment_method, delivery_type, delivery_time, address } = req.body;

    console.log("📦 Processing Order for user_id:", user_id);

    // ✅ ตรวจสอบข้อมูลที่จำเป็น
    if (!user_id || !payment_method || !delivery_type) {
        return res.status(400).json({ success: false, message: "ข้อมูลไม่ครบถ้วน" });
    }
    
    if (delivery_type === "จัดส่ง" && !address) {
        return res.status(400).json({ success: false, message: "กรุณากรอกที่อยู่สำหรับการจัดส่ง" });
    }

    if (delivery_type === "รับที่ร้าน" && !delivery_time) {
        return res.status(400).json({ success: false, message: "กรุณาเลือกเวลารับที่ร้าน" });
    }

    try {
        // ✅ ดึงข้อมูลจากตะกร้า
        const cartItems = await new Promise((resolve, reject) => {
            db.all("SELECT * FROM cart WHERE user_id = ?", [user_id], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        if (!cartItems || cartItems.length === 0) {
            return res.status(400).json({ success: false, message: "ตะกร้าสินค้าว่างเปล่า!" });
        }

        // ✅ คำนวณราคารวม
        let total_price = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);

        db.serialize(() => {
            // ✅ บันทึกคำสั่งซื้อใน `orders`
            const orderQuery = `
                INSERT INTO orders (user_id, total_price, payment_method, delivery_type, delivery_time, address, status, created_at, updated_at) 
                VALUES (?, ?, ?, ?, ?, ?, 'รอดำเนินการ', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`;

            db.run(orderQuery, [user_id, total_price, payment_method, delivery_type, delivery_time || null, address || null], function (err) {
                if (err) {
                    console.error("❌ Error placing order:", err);
                    return res.status(500).json({ success: false, message: "เกิดข้อผิดพลาดในการสั่งซื้อ" });
                }

                const order_id = this.lastID;
                console.log("✅ Order Created:", order_id);

                // ✅ บันทึกรายการสินค้าลง `order_items`
                let insertPromises = cartItems.map(item => {
                    return new Promise((resolve, reject) => {
                        const itemQuery = `INSERT INTO order_items (order_id, product_id, name, quantity, price) VALUES (?, ?, ?, ?, ?)`;
                        db.run(itemQuery, [order_id, item.product_id, item.product_name, item.quantity, item.price], function (err) {
                            if (err) {
                                console.error("❌ Error adding order item:", err);
                                reject(err);
                            } else {
                                resolve();
                            }
                        });
                    });
                });

                // ✅ ล้างตะกร้าหลังจากสั่งซื้อเสร็จ
                Promise.all(insertPromises).then(() => {
                    db.run("DELETE FROM cart WHERE user_id = ?", [user_id], function (err) {
                        if (err) console.error("❌ Error clearing cart:", err);
                    });

                    res.json({ success: true, order_id });
                }).catch(error => {
                    console.error("❌ Error processing order items:", error);
                    res.status(500).json({ success: false, message: "เกิดข้อผิดพลาดในการบันทึกรายการสินค้า" });
                });
            });
        });

    } catch (error) {
        console.error("❌ Order Error:", error);
        res.status(500).json({ success: false, message: "เกิดข้อผิดพลาดในการสั่งซื้อ" });
    }
});




// เริ่มเซิร์ฟเวอร์
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});