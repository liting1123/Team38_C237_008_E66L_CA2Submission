const express = require('express');
const mysql = require('mysql2');
const multer = require('multer');
const session = require('express-session');
const flash = require('connect-flash');
const app = express();

// Set up multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/images'); // Directory to save uploaded files
    },
    filename: (req, file, cb) => {
        cb(null, file.originalname); 
    }
});

const upload = multer({ storage: storage });
// Database connection
const db = mysql.createConnection({
    host: 'glpfrl.h.filess.io',
    user: 'CA2_sumtopwar',
    password: '2d8a6da63a6676e514d71a0955e42fb8d4ddd4c7',
    database: 'CA2_sumtopwar',
    port: 3307
});

db.connect((err) => {
    if (err) {
        console.error('Database connection error:', err);
        throw err; // Still throw to stop the app if connection fails
    }
    console.log('Connected to Food Service database');
});
 
app.use(express.urlencoded({ extended: false }));
app.use(express.static('public'));
app.use(session({
    secret: 'secret',
    resave: false,
    saveUninitialized: true,
    // Session expires after 1 week of inactivity
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 }
}));

app.use(flash());
 
// Setting up EJS
app.set('view engine', 'ejs');
 
const checkAuthenticated = (req, res, next) => {
    if (req.session.user) {
        return next();
    } else {
        req.flash('error', 'Please log in to view !!!!!');
        res.redirect('/login');
    }
};
  
 
app.get('/', (req, res) => {
    res.render('index', { user: req.session.user, messages: req.flash('success')});
});

app.get('/register', (req, res) => {
    res.render('register', { messages: req.flash('error'), formData: req.flash('formData')[0] });
});
 
const validateRegistration = (req, res, next) => {
    const { username, email, password, address, contact } = req.body;
    if (!username || !email || !password || !address || !contact) {
        return res.status(400).send('All fields are required.');
    }

    const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*])[A-Za-z\d!@#$%^&*]+$/;
    if (!strongPasswordRegex.test(password)) {
        req.flash('error', 'Password must include at least one uppercase letter, one lowercase letter, ' +
        'one digit, and one special character (!@#$%^&*).');
        req.flash('formData', req.body);
        return res.redirect('/register');
    }
    next();
};
 
app.post('/register',validateRegistration, (req, res) => {
    const { username, email, password, address, contact, role} = req.body;
    const sql = 'INSERT INTO user (username, email, password, address, contact, role) VALUES (?, ?, SHA1(?), ?, ?, ?)';
    db.query(sql, [username, email, password, address, contact, role], (err, result) => {
        if (err) {
            console.error("Error during user registration:", err); // Log registration errors too
            req.flash('error', 'Registration failed. Please try again or use a different email.');
            return res.redirect('/register');
        }
        console.log(result);
        req.flash('success', 'Registration successful! Please log in.');
        res.redirect('/login');
    });
});
 
app.get('/login', (req, res) => {
    res.render('login', {
        messages: req.flash('success'), 
        errors: req.flash('error')      
    });
});
 
app.post('/login', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        req.flash('error', 'All fields are required.');
        return res.redirect('/login');
    }
 
    const sql = 'SELECT * FROM user WHERE email = ? AND password = SHA1(?)';
    db.query(sql, [email, password], (err, results) => {
        if (err) {
            console.error("Error during login query:", err); 
            req.flash('error', 'An error occurred during login. Please try again.');
            return res.redirect('/login');
        }
        if (results.length > 0) {
            // Successful login
            req.session.user = results[0];           
            req.flash('success', 'Login successful! You can start order your food now.');
            res.redirect('/dashboard');
        } else {
            // Invalid credentials
            req.flash('error', 'Invalid email or password.');
            res.redirect('/login');
        }
    });
});
 
app.get('/dashboard', checkAuthenticated, (req, res) => {
    res.render('dashboard', { user: req.session.user });
});


app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

app.get('/menu', checkAuthenticated, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const selectedCategory = req.query.category; 
        const searchName = req.query.name; 

        //Searchbar
        db.query('SELECT DISTINCT category FROM menuItems ORDER BY category', (err, categoryResults) => {
            if (err) {
                console.error('Error fetching categories:', err);
                return res.status(500).send('Error loading categories for menu.');
            }
            const categories = categoryResults.map(row => row.category);

            let query = 'SELECT * FROM menuItems';
            const queryParams = [];
            const conditions = [];

            if (selectedCategory && selectedCategory !== '') {
                conditions.push('category = ?');
                queryParams.push(selectedCategory);
            }

            if (searchName) {
                conditions.push('name LIKE ?');
                queryParams.push(`%${searchName}%`);
            }

            if (conditions.length > 0) {
                query += ' WHERE ' + conditions.join(' AND ');
            }

            db.query(query, queryParams, (err, foodItems) => {
                if (err) {
                    console.error('Error fetching menu items:', err);
                    return res.status(500).send('Error loading menu items.');
                }

                //Fetch favourite items
                db.query('SELECT idmenuItems FROM user_favourite WHERE iduser = ?', [userId], (favErr, favResults) => {
                    if (favErr) {
                        console.error('Error fetching user favourites:', favErr);
                        return res.status(500).send('Error loading favourites for menu.');
                    }

                    const favouriteItemIds = new Set(favResults.map(fav => fav.idmenuItems));

                     //Add isFavourited flag to food items
                    const foodWithFavStatus = foodItems.map(item =>{
                        const inCart = req.session.cart?.find(c => c.idmenuItems == item.idmenuItems);
                        return{
                        ...item,
                        isFavourited: favouriteItemIds.has(item.idmenuItems),
                        quantity: inCart ? inCart.quantity : 0
                    }
         })
                

                    //Render the menu page with all necessary data
                    res.render('menu', { 
                        food: foodWithFavStatus, 
                        user: req.session.user, 
                        selectedCategory: selectedCategory,
                        searchName: searchName,           
                        categories: categories,            
                    });
                });
            });
        });

    } catch (error) {
        console.error('Error in /menu route:', error);
        res.status(500).send('Server error.');
    }
});

// Increase quantity
app.post('/increaseQuantity/:id', (req, res) => {
  const id = req.params.id;

  if (!req.session.cart) req.session.cart = [];

  let item = req.session.cart.find(i => i.idmenuItems == id);

  if (item) {
    item.quantity += 1;
    return res.redirect('/menu');
  } 

  const sql = 'SELECT * FROM menuItems WHERE idmenuItems = ?';
  db.query(sql,[id], (error,results) => {
    if (error || results.length === 0){
        console.error("Error fetching item for cart:", error);
        return res.redirect('/menu')
    }

    const foodItem = results[0];
        req.session.cart.push({
         idmenuItems: foodItem.idmenuItems,
            name: foodItem.name,
            price: foodItem.price,
            quantity:1,
            image:foodItem.image
    })
    res.redirect('/menu')
  })
});



// Decrease quantity
app.post('/decreaseQuantity/:id', (req, res) => {
  const id = req.params.id;
  if (!req.session.cart){
     req.session.cart = [];
}
let item = req.session.cart.find(i => i.idmenuItems == id);
if (item) {
    if (item.quantity > 1){
        item.quantity -= 1;
    } else{
        req.session.cart = req.session.cart.filter(i => i.idmenuItems != id);
    }
}
res.redirect('/menu')
});

app.get('/favourites', checkAuthenticated, (req, res) => {
    const userId = req.session.user.id; 
    db.query(`
        SELECT mi.*, uf.created_at as favourited_at FROM menuItems mi
        JOIN user_favourite uf ON mi.idmenuItems = uf.idmenuItems
        WHERE uf.iduser = ? ORDER BY uf.created_at DESC`, [userId], (err, favouriteItems) => {
        if (err) {
            console.error('Error fetching favourite items:', err);
            return res.status(500).send('Error fetching favourite items.');
        }

        res.render('favourites', {        
            user: req.session.user,
            favouriteItems: favouriteItems 
        });
    });
});

app.post('/addfavourites/:idmenuItems', checkAuthenticated, (req, res) => {
    const menuItemId = req.params.idmenuItems;
    const userId = req.session.user.id;

    db.query('SELECT * FROM user_favourite WHERE iduser = ? AND idmenuItems = ?', [userId, menuItemId], (err, results) => {
        if (err) {
            console.error('Error checking favourite status:', err);
            return res.redirect('/menu?error=FailedToAdd');
        }

        if (results.length > 0) {
            return res.redirect('/menu?info=AlreadyFavourited');
        }

        db.query('INSERT INTO user_favourite (iduser, idmenuItems) VALUES (?, ?)', [userId, menuItemId], (err, result) => {
            if (err) {
                console.error('Error adding to favourites:', err);
                return res.redirect('/menu?error=FailedToAdd');
            }
            res.redirect('/menu?success=AddedToFavourites');
        });
    });
});

app.post('/removefavourite/:idmenuItems', checkAuthenticated, (req, res) => {
    const menuItemId = req.params.idmenuItems;
    const userId = req.session.user.id; 

    db.query('DELETE FROM user_favourite WHERE iduser = ? AND idmenuItems = ?', [userId, menuItemId], (err, result) => {
        if (err) {
            console.error('Error removing from favourites:', err);
            return res.redirect('/favourites?error=failedToRemove'); 
        }
        if (result && result.affectedRows === 0) {
            return res.redirect('/favourites?info=itemNotFound'); 
        }
        res.redirect('/menu?success=removed'); 
    });
});

// Inventory
app.get('/inventory', checkAuthenticated, (req, res) => {
    const sql = 'SELECT idmenuItems, name, image, quantity, price, category FROM menuItems';
    db.query(sql, (error, results) => {
        if (error) {
            console.error('Error fetching menu items:', error);
            return res.status(500).send('Error fetching menu items');
        }
        res.render('inventory', {
            food: results,
            user: req.session.user
        });
    });
});

// View each menu item by id
app.get('/food/:id', (req, res) => {
    const id = req.params.id;
    const sql = 'SELECT * from menuItems WHERE idmenuItems = ?';
             db.query(sql, [id],(error, results) => {
        if (error) {
            console.error('Error fetching menu items:' ,error);
            return res.status(500).send('Error fetching menu items');
            }
        res.render('food', { food: results[0],
            user: req.session.user}
        ); 
    }); 
});

app.get('/cart', checkAuthenticated, (req, res) => {
    let cart = req.session.cart || [];
    cart = cart.filter(item => item.quantity > 0)
    req.session.cart = cart;

    res.render('cart', { cart, user: req.session.user });
});

app.post('/add-to-cart/:id', checkAuthenticated, (req, res) => {
    const idmenuItems = parseInt(req.params.id);
    const quantity = parseInt(req.body.quantity) || 0;

    db.query('SELECT * FROM menuItems WHERE idmenuItems = ?', [idmenuItems], (error, results) => {
        if (error) {
            console.error('Error fetching menu item for cart:', error); 
            throw error; 
        }
        if (results.length > 0) {
            const menuItems = results[0];

            // Initialize cart in session if not exists
            if (!req.session.cart) {
                req.session.cart = [];
            }

            // Check if food already in cart
            const existingItem = req.session.cart.find(item => item.idmenuItems === idmenuItems);
            if (existingItem) {
                existingItem.quantity += quantity;
            } else {
                req.session.cart.push({
                    idmenuItems: menuItems.idmenuItems,
                    name: menuItems.name,
                    price: menuItems.price,
                    quantity: quantity,
                    image: menuItems.image
                });
            }
            res.redirect('/cart');
            } else {
                res.status(404).send("Menu not found");
            }
        });
});


app.post('/updateCartQuantities', checkAuthenticated, (req, res) => {
    if (!req.session.cart) {
        req.session.cart = [];
    }

    const updatedCart = [];
    for (const key in req.body) {
        if (key.startsWith('quantity_')) {
            const idmenuItems = parseInt(key.split('_')[1]);
            const newQuantity = parseInt(req.body[key]);
            const itemName = req.body[`itemName_${idmenuItems}`];
            const itemPrice = req.body[`itemPrice_${idmenuItems}`];
            const itemImage = req.body[`itemImage_${idmenuItems}`];
            if (newQuantity > 0 && !isNaN(newQuantity) && !isNaN(itemPrice) && itemName && itemImage) {
                updatedCart.push({
                    idmenuItems: idmenuItems,
                    name: itemName,
                    price: itemPrice,
                    quantity: newQuantity,
                    image: itemImage
                });
            }
        }
    }
    req.session.cart = updatedCart;
    res.redirect('/cart');
});

app.post('/deleteCart/:idmenuItems', (req, res) => {
    const itemId = req.params.idmenuItems;
    req.session.cart = req.session.cart.filter(item => item.idmenuItems != itemId);
    res.redirect('/cart');
});

app.post('/placeOrder', async (req, res) => {
  try {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    const body = req.body;
    const cartItems = [];
    const selectedItemIds = Array.isArray(body.selectedItemIds) ? body.selectedItemIds : [body.selectedItemIds].filter(Boolean);
    selectedItemIds.forEach(id => {
        const itemId = id; 
        const itemName = body[`itemName_${itemId}`];
        const itemPrice = parseFloat(body[`itemPrice_${itemId}`]);
        const itemQuantity = parseInt(body[`quantity_${itemId}`], 10); 

        if (itemId && itemName && !isNaN(itemPrice) && !isNaN(itemQuantity) && itemQuantity > 0) {
            cartItems.push({
            idmenuItems: itemId,
            name: itemName,
            price: itemPrice,
            quantity: itemQuantity
            });
        } else {
            console.warn(`Skipping invalid/incomplete item data for selected ID: ${itemId}`);
        }
    });

    if (cartItems.length === 0) {
      return res.status(400).send('No valid items selected for order, or cart is empty.');
    }

    let totalAmount = 0;
    cartItems.forEach(item => {
      totalAmount += item.price * item.quantity;
    });

    const insertOrderSql = 'INSERT INTO orders (iduser, name, total_amount, order_date) VALUES (?, ?, ?, NOW())';
    db.query(insertOrderSql, [req.session.user.id, req.session.user.username, totalAmount], (err, orderResult) => { 
        if (err) {
            console.error('Error inserting order:', err);
            return res.status(500).send('Error placing order');
        }
        const orderId = orderResult.insertId;
        const insertItemsSql = 'INSERT INTO orderItems (idorder, idmenuItems, quantity, price) VALUES ?';
        const itemsData = cartItems.map(item => [
            orderId,
            item.idmenuItems,
            item.quantity,
            item.price
        ]);

        db.query(insertItemsSql, [itemsData], (err2) => {
            if (err2) {
            console.error('Error inserting order items:', err2);
            return res.status(500).send('Error saving order items');
            }

        req.session.cart = []; // clear cart
        res.redirect(`/orderConfirmation?idorder=${orderId}`);
       });
    });

    } catch (err) {
        console.error(err);
        res.status(500).send('Server error');
    }
});

//Order Confirmation
app.get('/orderConfirmation', async (req, res) => {
    const orderId = req.query.idorder;
    const dbPromise = db.promise();

    try {
        const [orderRows] = await dbPromise.query(
        `SELECT * FROM orders WHERE idorder = ?`,
        [orderId]
        );

    const [itemRows] = await dbPromise.query(
        `SELECT oi.*, m.name AS foodName FROM orderItems oi 
        JOIN menuItems m ON oi.idmenuItems = m.idmenuItems WHERE oi.idorder = ?`,
        [orderId]
    );

    res.render('orderConfirmation', {
      order: orderRows[0],
      items: itemRows,
      user: req.session.user
    });
    } catch (err) {
        console.error('Error loading confirmation:', err);
        res.status(500).send('Unable to load confirmation page');
    }
});

app.get('/addInventory', checkAuthenticated, (req, res) => {
    res.render('AddInventory', {user: req.session.user } ); 
});

app.post('/addInventory', upload.single('Images'), (req, res) => {
    const { name, quantity, price, category } = req.body;
    let image;
    if (req.file) {
        image = req.file.filename; 
    } else {
        image = null;
    }

    const sql = 'INSERT INTO menuItems (name, image, quantity, price, category) VALUES (?, ?, ?, ?,?)';
    db.query(sql, [name, image, quantity, price, category], (error, results) => {
        if (error) {
            console.error("Error adding menu to database:", error);
            res.status(500).send(`Error adding menu: ${error.message || error}`); 
        } else {
            res.redirect('/inventory');
        }
    });
});

app.get('/editInventory/:id',(req,res) => {
    const idmenuItems = req.params.id;
    const sql = 'SELECT * FROM menuItems WHERE idmenuItems = ?';

    db.query( sql , [idmenuItems], (error, results) => {
        if (error) {
            console.error('Database query error:', error.message);
            return res.status(500).send('Error retrieving Food by ID');
        }

        if (results.length > 0 ) {
            res.render('editInventory', { menuItems: results[0],user: req.session.user });
        } else {
            res.status(404).send('Order not found');
        }
    });
});

app.post('/editInventory/:id',upload.single('image'), (req,res) => {
    const idmenuItems = req.params.id;
    const {name, Image, quantity , price, category} = req.body;
    
    let image = req.body.currentImageName;
    if(req.file) image = req.file.filename;
    
    const sql = 'Update menuItems SET name =?,image = ?, quantity =? , price = ?, category = ?  WHERE idmenuItems = ?';
    db.query(sql, [ name, image, quantity, price, category,idmenuItems], (error, result) => {
        if (error){
            console.error('Update error:', error);
            return res.status(500).send('Error updating food item');
        }else{
            res.redirect('/inventory');
       }
    });
}); 

app.get('/deleteInventory/:id', (req,res) => {
    const idmenuItems = req.params.id;
    const sql = 'DELETE FROM menuItems WHERE idmenuItems = ?';
    db.query( sql, [idmenuItems], (error, results) => {
        if (error) {
            console.error("Error deleting inventory:", error);
            res.status(500).send('Error deleting inventory');
        } else {
            res.redirect('/inventory');
        }
    }); 
});

app.get('/payment', checkAuthenticated, (req, res) => {
    const orderId = req.query.idorder;

    if (!orderId) {
        req.flash('error', 'Order ID is required.');
        return res.redirect('/menu');
    }

    const sql = 'SELECT total_amount FROM orders WHERE idorder = ?';

    db.query(sql, [orderId], (err, results) => {
        if (err) {
            console.error('Database error:', err);
            req.flash('error', 'An error occurred while fetching the order.');
            return res.redirect('/menu');
        }

        if (results.length === 0) {
            req.flash('error', 'Order not found.');
            return res.redirect('/menu');
        }

        const totalAmount = results[0].total_amount;

        res.render('payment', {
            user: req.session.user,
            total: totalAmount,
            orderId: orderId,
            messages: req.flash('error')
        });
    });
});


app.post('/processPayment', checkAuthenticated, (req, res) => {
    const { cardNumber, expiryDate, cvv, idorder } = req.body;

    if (!cardNumber || !expiryDate || !cvv || !idorder) {
        req.flash('error', 'All payment fields are required.');
        return res.redirect(`/payment?idorder=${idorder}`);
    }

    const sql = 'SELECT total_amount FROM orders WHERE idorder = ?';
    db.query(sql, [idorder], (err, results) => {
        if (err) {
            console.error('Database error:', err);
            req.flash('error', 'Failed to fetch total amount.');
            return res.redirect(`/payment?idorder=${idorder}`);
        }

        if (results.length === 0) {
            req.flash('error', 'Order not found.');
            return res.redirect(`/payment?idorder=${idorder}`);
        }

        const totalAmount = results[0].total_amount;
        req.session.cart = [];

        res.render('PaymentSuccess', {
            user: req.session.user,
            amount: totalAmount,
            orderId: idorder
        });
    });
    const updateStatusSql = 'UPDATE orders SET status = ? WHERE idorder = ?';
    db.query(updateStatusSql, ['Paid', idorder], (err3) => {
    if (err3) 
        console.error('Error updating order status:', err3);
    });
});

//Admin view user
app.get('/viewUsers', (req,res) => {
    const sql = 'SELECT * FROM user';
    db.query(sql, (error,results) =>{
        if (error) {
            console.error("Error fetching users:", error);
            req.flash("error", "User cannot be loaded");
            return res.redirect('/admin');
        }
        res.render('viewUsers',{
            users:results,
            user: req.session.user,
            messages: req.flash('success')
        })
    })
})

// Edit Userview
app.get('/editUser/:id', (req, res) => {
    const id = req.params.id;
    const sql = 'SELECT id, username, email, contact, address, role FROM user WHERE id = ?';


    db.query(sql, [id], (error, results) => {
        if (error) {
            console.error('Database query error:', error.message);
            return res.status(500).send('Error retrieving user by ID');
        }

        if (results.length > 0) {
            res.render('editUser', { 
                user: results[0],              // for form data
                currentUser: req.session.user // if you need current logged-in user for navbar, etc
            });
        } else {
            res.status(404).send('User not found');
        }
    });
});


app.post('/editUser/:id', (req,res) => {
    const id = req.params.id;
    const {username, email ,contact,address, role} = req.body;
    
    const sql = 'Update user SET username =?, email =? , contact = ?  ,address = ? ,  role = ? WHERE id = ?';
    db.query(sql, [ username, email, contact, address,role,id], (error, result) => {
        if (error){
            console.error('Update error:', error);
            return res.status(500).send('Error updating user item');
        }else{
            res.redirect('/viewUsers');
       }
    });
}); 

app.get('/deleteUser/:id', (req, res) => {
    const id = req.params.id;
    const sql = 'DELETE FROM user WHERE id = ?';

    db.query(sql, [id], (error, result) => {
        if (error) {
            console.error('Delete error:', error);
            return res.status(500).send('Error deleting user');
        }
        res.redirect('/viewUsers'); 
    });
});

// Starting the server
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Foodiess is running on http://localhost:${PORT}`);
});
