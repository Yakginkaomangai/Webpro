const express = require('express');
const path = require('path');

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

// เสิร์ฟไฟล์ Static
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.get('/', (req, res) => {
    res.render('home');
});

app.get('/login', (req, res) => {
    res.render('login');
});

app.get('/checkout', (req, res) => {
    res.render('checkout');
});

app.get('/register', (req, res) => {
    res.render('register');
});

app.get('/allsandwich', (req, res) => {
    res.render('allsandwich', {
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
    const comboset = [
        { name: 'Mashed Potato', price: 79, image: '/img/ham.png' },
        { name: 'Croissant', price: 99, image: '/img/ham.png' },
        { name: 'Cookie', price: 69, image: '/img/ham.png' },
        { name: 'French Fries', price: 89, image: '/img/ham.png' },
        { name: 'Fried Onions', price: 79, image: '/img/ham.png' },
        { name: 'Cheese Sticks', price: 99, image: '/img/ham.png' }
    ];
    res.render('comboset', { comboset });
});

app.get('/appetizers', (req, res) => {
    const appetizers = [
        { name: 'Mashed Potato', price: 79, image: '/img/ham.png' },
        { name: 'Croissant', price: 99, image: '/img/ham.png' },
        { name: 'Cookie', price: 69, image: '/img/ham.png' },
        { name: 'French Fries', price: 89, image: '/img/ham.png' },
        { name: 'Fried Onions', price: 79, image: '/img/ham.png' },
        { name: 'Cheese Sticks', price: 99, image: '/img/ham.png' }
    ];
    res.render('appetizers', { appetizers });
});

app.get('/drinks', (req, res) => {
    const drinks = [
        { name: 'Coke', price: 30, image: '/img/coke.png' },
        { name: 'Sprite', price: 30, image: '/img/sprite.png' },
        { name: 'Fanta', price: 30, image: '/img/fanta.png' },
        { name: 'Orange Juice', price: 40, image: '/img/orange_juice.png' },
        { name: 'Lemon Tea', price: 45, image: '/img/lemon_tea.png' },
        { name: 'Iced Coffee', price: 50, image: '/img/iced_coffee.png' }
    ];
    res.render('drinks', { drinks });
});



app.get('/custom', (req, res) => {
    res.render('custom');
});

// เริ่มเซิร์ฟเวอร์
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});