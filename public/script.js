// ─── Global user variables (populated from checkout form) ─────────────────────
let userEmail = '';
let userCity  = '';
let userZip   = '';

// ─── Cart state ────────────────────────────────────────────────────────────────
let cart = {};

// ─── Product ID map ────────────────────────────────────────────────────────────
const productIds = {
    'Liverpool Jersey':               'liverpool-jersey',
    'Nike Air Max - Liverpool Shoes': 'nike-air-max-liverpool',
    'Liverpool 24-25 Champions Shirt':'lfc-champions-shirt-2425'
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

// Always look up the element fresh — avoids null-ref if script loads before DOM
function updateCartCount() {
    const el = document.getElementById('cart-count');
    if (!el) return;
    const count = Object.values(cart).reduce((acc, item) => acc + item.quantity, 0);
    el.textContent = count;
}

function getCartTotal() {
    return Object.values(cart).reduce((acc, item) => acc + item.price * item.quantity, 0);
}

function saveCartToLocalStorage() {
    localStorage.setItem('cart', JSON.stringify(cart));
}

function loadCartFromLocalStorage() {
    try {
        const stored = localStorage.getItem('cart');
        if (stored) cart = JSON.parse(stored);
    } catch (e) {
        cart = {};
    }
    updateCartCount();
}

function showNotification(message) {
    const note = document.createElement('div');
    note.classList.add('notification');
    note.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 20 20">
            <path d="M10 2C5.14 2 1 5.14 1 10s4.14 8 9 8 9-4.14 9-8S14.86 2 10 2z"/>
        </svg>
        <span>${message}</span>`;
    document.body.appendChild(note);
    setTimeout(() => note.remove(), 3000);
}

// ─── Initialise on every page load ────────────────────────────────────────────
loadCartFromLocalStorage();

// ─── Checkout form: keep user variables in sync ────────────────────────────────
function updateVariables() {
    const emailInput = document.getElementById('email');
    const cityInput  = document.getElementById('city');
    const zipInput   = document.getElementById('zip');
    if (emailInput) userEmail = emailInput.value;
    if (cityInput)  userCity  = cityInput.value;
    if (zipInput)   userZip   = zipInput.value;
}

document.addEventListener('DOMContentLoaded', function () {
    updateVariables();
    ['email', 'city', 'zip'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', updateVariables);
    });

    // ── Cart page ──────────────────────────────────────────────────────────────
    if (document.getElementById('cart-table')) {
        displayCartTable();
    }

    // ── Checkout page ──────────────────────────────────────────────────────────
    if (document.getElementById('cart-summary-table')) {
        displayCartSummary();

        const contents    = Object.keys(cart).map(name => ({
            id: productIds[name] || name.toLowerCase().replace(/\s+/g, '-'),
            quantity: cart[name].quantity
        }));
        const contentIds  = contents.map(c => c.id);
        const numItems    = Object.values(cart).reduce((a, i) => a + i.quantity, 0);
        const totalValue  = getCartTotal();

        fbq('track', 'InitiateCheckout', {
            content_ids: contentIds,
            contents:    contents,
            currency:    'USD',
            num_items:   numItems,
            value:       totalValue
        });
    }
});

// ─── Meta Pixel: ViewContent ───────────────────────────────────────────────────
function trackViewContent(contentId, contentName, value) {
    fbq('track', 'ViewContent', {
        content_ids:  [contentId],
        content_type: 'product',
        contents:     [{ id: contentId, quantity: 1 }],
        content_name: contentName,
        currency:     'USD',
        value:        value
    });
}

// ─── Add to Cart ───────────────────────────────────────────────────────────────
function addToCart(name, price) {
    if (cart[name]) {
        cart[name].quantity++;
    } else {
        cart[name] = { price, quantity: 1 };
    }
    updateCartCount();
    showNotification(`Added ${name} to cart!`);
    saveCartToLocalStorage();

    const contentId = productIds[name] || name.toLowerCase().replace(/\s+/g, '-');

    // 1. Server-side CAPI AddToCart — fires first to generate the event_id.
    //    The returned event_id is then passed to the Pixel call for deduplication.
    fetch('/api/capi/add-to-cart', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            eventSourceUrl: window.location.href,
            value:          price,
            contentId:      contentId,
            contentName:    name,
        }),
    })
    .then(res => res.json())
    .then(data => {
        // 2. Browser-side Pixel AddToCart — uses the server-generated event_id
        //    so Meta can deduplicate this event against the CAPI call above.
        fbq('track', 'AddToCart', {
            content_ids:  [contentId],
            content_type: 'product',
            contents:     [{ id: contentId, quantity: 1 }],
            content_name: name,
            currency:     'USD',
            value:        price
        }, { eventID: data.eventId });
    })
    .catch(err => console.error('[CAPI] AddToCart fetch error:', err));
}

// ─── Remove from Cart ──────────────────────────────────────────────────────────
function removeFromCart(name) {
    delete cart[name];
    updateCartCount();
    saveCartToLocalStorage();
}

// ─── Display Cart Table (cart.html) ───────────────────────────────────────────
function displayCartTable() {
    const tbody = document.getElementById('cart-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    const keys = Object.keys(cart);
    if (keys.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="cart-empty">
            Your cart is empty. <a href="products.html">Browse products</a>
        </td></tr>`;
    } else {
        keys.forEach(name => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${name}</td>
                <td>$${cart[name].price.toFixed(2)}</td>
                <td>${cart[name].quantity}</td>
                <td>$${(cart[name].price * cart[name].quantity).toFixed(2)}</td>`;
            tbody.appendChild(row);
        });
    }

    const totalEl = document.getElementById('cart-total');
    if (totalEl) totalEl.textContent = getCartTotal().toFixed(2);
}

// ─── Display Cart Summary (checkout.html) ─────────────────────────────────────
function displayCartSummary() {
    const tbody = document.getElementById('cart-summary-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    Object.keys(cart).forEach(name => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${name}</td>
            <td style="text-align:center">${cart[name].quantity}</td>
            <td style="text-align:right">$${(cart[name].price * cart[name].quantity).toFixed(2)}</td>`;
        tbody.appendChild(row);
    });

    const totalEl = document.getElementById('cart-total');
    if (totalEl) totalEl.textContent = getCartTotal().toFixed(2);
}

// ─── InitiateCheckout (from cart page button) ─────────────────────────────────
function initiateCheckout() {
    const contents   = Object.keys(cart).map(name => ({
        id: productIds[name] || name.toLowerCase().replace(/\s+/g, '-'),
        quantity: cart[name].quantity
    }));
    const contentIds = contents.map(c => c.id);
    const numItems   = Object.values(cart).reduce((a, i) => a + i.quantity, 0);
    const total      = getCartTotal();

    fbq('track', 'InitiateCheckout', {
        content_ids: contentIds,
        contents:    contents,
        currency:    'USD',
        num_items:   numItems,
        value:       total
    });

    window.location.href = 'checkout.html';
}

// ─── Cookie helper ────────────────────────────────────────────────────────────
/**
 * Read a browser cookie by name. Returns empty string if not found.
 * Used to capture _fbp and _fbc for the CAPI payload.
 */
function getCookie(name) {
    const match = document.cookie.match(new RegExp('(?:^|;\\s*)' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=([^;]*)'));
    return match ? decodeURIComponent(match[1]) : '';
}

// ─── Complete Purchase (checkout.html) ────────────────────────────────────────
function completePurchase() {
    updateVariables();

    const contents   = Object.keys(cart).map(name => ({
        id: productIds[name] || name.toLowerCase().replace(/\s+/g, '-'),
        quantity: cart[name].quantity
    }));
    const contentIds = contents.map(c => c.id);
    const numItems   = Object.values(cart).reduce((a, i) => a + i.quantity, 0);
    const total      = getCartTotal();

    // Read Meta first-party cookies for identity matching
    // fbp: Meta browser ID (set by Pixel on first page load)
    // fbc: Meta click ID (set when user arrives via a Meta ad with fbclid param)
    const fbp = getCookie('_fbp');
    const fbc = getCookie('_fbc');

    // Use a session-scoped external ID as a user signal.
    // Stored in sessionStorage so it persists across the checkout flow.
    let externalId = sessionStorage.getItem('capiExternalId');
    if (!externalId) {
        externalId = 'sess-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9);
        sessionStorage.setItem('capiExternalId', externalId);
    }

    // Re-init Pixel with PII for advanced matching
    fbq('init', '1914070242854182', {
        em: userEmail,
        ct: userCity ? userCity.toLowerCase().replace(/\s+/g, '') : '',
        zp: userZip,
        external_id: externalId,
    });

    // 1. Server-side CAPI Purchase — fires first to generate the event_id.
    //    The returned event_id is then passed to the Pixel call for deduplication.
    fetch('/api/capi/purchase', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            eventSourceUrl: window.location.href,  // required for all website events
            fbp,                                    // Meta browser ID cookie (plain text)
            fbc,                                    // Meta click ID cookie (plain text)
            externalId,                             // user session signal
            email:      userEmail,
            city:       userCity,
            zip:        userZip,
            value:      total,
            contentIds,
            contents,
            numItems,
        }),
    })
    .then(res => res.json())
    .then(data => {
        // 2. Browser-side Pixel Purchase — uses the server-generated event_id
        //    so Meta can deduplicate this event against the CAPI call above.
        fbq('track', 'Purchase', {
            content_ids:  contentIds,
            content_type: 'product',
            contents:     contents,
            currency:     'USD',
            num_items:    numItems,
            value:        total
        }, { eventID: data.eventId });

        // Clear cart and redirect after the CAPI call completes
        cart = {};
        saveCartToLocalStorage();
        updateCartCount();
        window.location.href = 'purchase-confirmation.html';
    })
    .catch(err => {
        console.error('[CAPI] fetch error:', err);
        // Redirect even if CAPI call fails to avoid blocking the user
        cart = {};
        saveCartToLocalStorage();
        updateCartCount();
        window.location.href = 'purchase-confirmation.html';
    });
}
