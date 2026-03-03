// Create global variables
let userEmail = '';
let userCity = '';
let userZip = '';
// Function to update global variables
function updateVariables() {
  const emailInput = document.getElementById('email');
  const cityInput = document.getElementById('city');
  const zipInput = document.getElementById('zip');
  if (emailInput) {
    userEmail = emailInput.value;
  }
  if (cityInput) {
    userCity = cityInput.value;
  }
  if (zipInput) {
    userZip = zipInput.value;
  }
}
// Add event listeners to input boxes
document.addEventListener('DOMContentLoaded', function() {
  const emailInput = document.getElementById('email');
  const cityInput = document.getElementById('city');
  const zipInput = document.getElementById('zip');
  updateVariables();
  if (emailInput) {
    emailInput.addEventListener('input', updateVariables);
  }
  if (cityInput) {
    cityInput.addEventListener('input', updateVariables);
  }
  if (zipInput) {
    zipInput.addEventListener('input', updateVariables);
  }
});

// Get the cart count element
const cartCountElement = document.getElementById('cart-count');

// Initialize the cart
let cart = {};

// Function to update the cart count
function updateCartCount() {
    const cartCount = Object.values(cart).reduce((acc, item) => acc + item.quantity, 0);
    cartCountElement.textContent = cartCount;
}

// ─── Meta Pixel: Product ID lookup ────────────────────────────────────────────
// Maps product names to stable content_ids used in Pixel events
const productIds = {
    'Liverpool Jersey': 'liverpool-jersey',
    'Nike Air Max - Liverpool Shoes': 'nike-air-max-liverpool',
    'Liverpool 24-25 Champions Shirt': 'lfc-champions-shirt-2425'
};

// ─── Meta Pixel: ViewContent ───────────────────────────────────────────────────
// Fires when a user clicks on a product (signals interest in a specific item)
function trackViewContent(contentId, contentName, value) {
    fbq('track', 'ViewContent', {
        content_ids: [contentId],
        content_type: 'product',
        contents: [{ id: contentId, quantity: 1 }],
        content_name: contentName,
        currency: 'USD',
        value: value
    });
}

// ─── Meta Pixel: AddToCart ─────────────────────────────────────────────────────
// Function to add an item to the cart
function addToCart(name, price) {
    if (cart[name]) {
        cart[name].quantity++;
    } else {
        cart[name] = { price, quantity: 1 };
    }
    updateCartCount();
    showNotification(`Added ${name} to cart!`);
    saveCartToLocalStorage();

    // Fire Meta Pixel AddToCart event
    const contentId = productIds[name] || name.toLowerCase().replace(/\s+/g, '-');
    fbq('track', 'AddToCart', {
        content_ids: [contentId],
        content_type: 'product',
        contents: [{ id: contentId, quantity: 1 }],
        content_name: name,
        currency: 'USD',
        value: price
    });
}

// Function to remove an item from the cart
function removeFromCart(name) {
    if (cart[name]) {
        delete cart[name];
    }
    updateCartCount();
    saveCartToLocalStorage();
}

// Function to save the cart to local storage
function saveCartToLocalStorage() {
    localStorage.setItem('cart', JSON.stringify(cart));
}

// Function to load the cart from local storage
function loadCartFromLocalStorage() {
    const storedCart = localStorage.getItem('cart');
    if (storedCart) {
        cart = JSON.parse(storedCart);
        updateCartCount();
    }
}

// Load the cart from local storage when the page loads
loadCartFromLocalStorage();

// Function to display the cart table
function displayCartTable() {
    const cartTableBody = document.getElementById('cart-body');
    cartTableBody.innerHTML = '';
    for (const name in cart) {
        const row = document.createElement('tr');
        const nameCell = document.createElement('td');
        nameCell.textContent = name;
        row.appendChild(nameCell);
        const priceCell = document.createElement('td');
        priceCell.textContent = `$${cart[name].price}`;
        row.appendChild(priceCell);
        const quantityCell = document.createElement('td');
        quantityCell.textContent = cart[name].quantity;
        row.appendChild(quantityCell);
        const totalCell = document.createElement('td');
        totalCell.textContent = `$${cart[name].price * cart[name].quantity}`;
        row.appendChild(totalCell);
        cartTableBody.appendChild(row);
    }

    // Calculate and display the cart total
    const total = getCartTotal();
    document.getElementById('cart-total').textContent = total.toFixed(2);
}

// Display the cart table when the cart page loads
if (document.getElementById('cart-table')) {
    displayCartTable();
}

// ─── Meta Pixel: InitiateCheckout ──────────────────────────────────────────────
// Function to initiate checkout
function initiateCheckout() {
    // Build cart contents array for Pixel
    const contents = Object.keys(cart).map(name => ({
        id: productIds[name] || name.toLowerCase().replace(/\s+/g, '-'),
        quantity: cart[name].quantity
    }));
    const contentIds = contents.map(c => c.id);
    const numItems = Object.values(cart).reduce((acc, item) => acc + item.quantity, 0);
    const totalValue = getCartTotal();

    // Fire Meta Pixel InitiateCheckout event
    fbq('track', 'InitiateCheckout', {
        content_ids: contentIds,
        contents: contents,
        currency: 'USD',
        num_items: numItems,
        value: totalValue
    });

    // Redirect to the checkout page
    window.location.href = 'checkout.html';
}

// ─── Meta Pixel: InitiateCheckout (on checkout page load) ─────────────────────
// Also fires when the checkout page loads directly (e.g., via direct URL)
if (document.getElementById('cart-summary-table')) {
    loadCartFromLocalStorage();
    displayCartSummary();

    // Build cart contents array for Pixel
    const checkoutContents = Object.keys(cart).map(name => ({
        id: productIds[name] || name.toLowerCase().replace(/\s+/g, '-'),
        quantity: cart[name].quantity
    }));
    const checkoutContentIds = checkoutContents.map(c => c.id);
    const checkoutNumItems = Object.values(cart).reduce((acc, item) => acc + item.quantity, 0);
    const checkoutTotal = getCartTotal();

    fbq('track', 'InitiateCheckout', {
        content_ids: checkoutContentIds,
        contents: checkoutContents,
        currency: 'USD',
        num_items: checkoutNumItems,
        value: checkoutTotal
    });
}

// ─── Meta Pixel: Purchase ──────────────────────────────────────────────────────
// Function to complete purchase
function completePurchase() {
    // Capture cart data before clearing
    const purchaseContents = Object.keys(cart).map(name => ({
        id: productIds[name] || name.toLowerCase().replace(/\s+/g, '-'),
        quantity: cart[name].quantity
    }));
    const purchaseContentIds = purchaseContents.map(c => c.id);
    const purchaseNumItems = Object.values(cart).reduce((acc, item) => acc + item.quantity, 0);
    const purchaseTotal = getCartTotal();

    // Re-initialise Pixel with PII from the checkout form (manual advanced matching)
    fbq('init', '935724062207149', {
        em: userEmail,
        ct: userCity ? userCity.toLowerCase().replace(/\s+/g, '') : '',
        zp: userZip
    });

    // Fire Meta Pixel Purchase event
    fbq('track', 'Purchase', {
        content_ids: purchaseContentIds,
        content_type: 'product',
        contents: purchaseContents,
        currency: 'USD',
        num_items: purchaseNumItems,
        value: purchaseTotal
    });

    // Clear the cart
    cart = {};
    saveCartToLocalStorage();
    updateCartCount();

    // Redirect to the purchase confirmation page
    window.location.href = 'purchase-confirmation.html';
}

// Add event listener to the purchase button
if (document.getElementById('purchase-btn')) {
    document.getElementById('purchase-btn').addEventListener('click', completePurchase);
}

function showNotification(message) {
    const notification = document.createElement('div');
    notification.classList.add('notification');
    notification.innerHTML = `
        <span>${message}</span>
        <svg width="20" height="20" viewBox="0 0 20 20">
            <path d="M10 2C5.14 2 1 5.14 1 10s4.14 8 9 8 9-4.14 9-8S14.86 2 10 2z" fill="#fff" />
        </svg>
    `;
    document.body.appendChild(notification);
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// Function to get the total value of the cart
function getCartTotal() {
    let total = 0;
    for (const name in cart) {
        total += cart[name].price * cart[name].quantity;
    }
    return total;
}

// Function to display the cart summary
function displayCartSummary() {
    const cartSummaryBody = document.getElementById('cart-summary-body');
    cartSummaryBody.innerHTML = '';
    for (const name in cart) {
        const row = document.createElement('tr');
        const productCell = document.createElement('td');
        productCell.textContent = name;
        productCell.style.width = '40%';
        row.appendChild(productCell);
        const quantityCell = document.createElement('td');
        quantityCell.textContent = cart[name].quantity;
        quantityCell.style.width = '20%';
        quantityCell.style.textAlign = 'center';
        row.appendChild(quantityCell);
        const totalCell = document.createElement('td');
        totalCell.textContent = `$${cart[name].price * cart[name].quantity}`;
        totalCell.style.width = '40%';
        totalCell.style.textAlign = 'right';
        row.appendChild(totalCell);
        cartSummaryBody.appendChild(row);
    }
    // Calculate and display the cart total
    const total = getCartTotal();
    document.getElementById('cart-total').textContent = total.toFixed(2);
}
