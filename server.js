// Load environment variables from .env file
require('dotenv').config();

// Use the keys from the .env file
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-11-20.acacia; checkout_server_update_beta=v1',
});
const express = require('express');
const cors = require('cors'); // Add this line
const app = express();

// Update your CORS configuration in server.js
const corsOptions = {
  origin: ['https://js.stripe.com', 'https://api.stripe.com', 'https://checkout.stripe.com', 'https://eliasimg.de', 'https://readymag.com', 'https://*.readymag.com', '*'],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Origin'],
  credentials: true
};

app.use(cors(corsOptions)); // Add CORS middleware before other middleware

// Update your CSP in server.js to be less restrictive
app.use((req, res, next) => {
  res.setHeader("Content-Security-Policy", 
    "default-src 'self' https://js.stripe.com https://api.stripe.com https://checkout.stripe.com;" +
    "script-src 'self' 'unsafe-inline' https://js.stripe.com;" +
    "connect-src 'self' https://api.stripe.com https://checkout.stripe.com;" +
    "style-src 'self' 'unsafe-inline' https://js.stripe.com;" +
    "frame-src 'self' https://js.stripe.com https://checkout.stripe.com;" +
    "frame-ancestors 'self' https://eliasimg.de https://*.eliasimg.de https://readymag.com https://*.readymag.com;" +
    "img-src 'self' data: https://js.stripe.com"
  );
  next();
});

app.use(express.static('public'));
app.use(express.json()); // Add this to parse JSON request bodies

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  next();
});

// Add these headers to allow embedding
app.use((req, res, next) => {
  // Allow embedding from eliasimg.de
  res.setHeader('X-Frame-Options', 'ALLOW-FROM https://eliasimg.de');
  
  // Set additional security headers
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  
  next();
});

app.options('*', cors(corsOptions));

const YOUR_DOMAIN = 'https://tbaa-ehv-4792f0431457.herokuapp.com';

// Define your shipping rates
const SHIPPING_RATES = {
  'DE': 'shr_1R0KvnDiRHn1y6KSVogC3Erg', // Standard Germany Shipping
  'EU': 'shr_1R0KydDiRHn1y6KSYZ3aUlzs', // Standard EU Shipping
  'OTHER': 'shr_1R0Kz8DiRHn1y6KSqU0DZYeT' // Standard International
};

// EU country codes
const EU_COUNTRIES = [
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 
  'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 
  'PT', 'RO', 'SK', 'SI', 'ES', 'SE'
];

// Return a boolean indicating whether the shipping details are valid.
function validateShippingDetails(shippingDetails) {
  if (!shippingDetails || !shippingDetails.address) {
    return false;
  }
  const { country, line1, city, postal_code, state } = shippingDetails.address;

  if (!country || !line1 || !city || !postal_code) {
    return false; // These fields are mandatory
  }

  // Only require "state" if the country mandates it
  const countriesRequiringState = ['US', 'CA', 'AU']; // Add other countries if needed
  if (countriesRequiringState.includes(country) && !state) {
    return false;
  }

  return true;
}

// Return the appropriate shipping rate ID based on the country
function getShippingRateId(country) {
  if (country === 'DE') {
    return SHIPPING_RATES.DE;
  } else if (EU_COUNTRIES.includes(country)) {
    return SHIPPING_RATES.EU;
  } else {
    return SHIPPING_RATES.OTHER;
  }
}

app.post('/create-checkout-session', async (req, res) => {
  try {

    // Generate a unique identifier for this session (optional)
    const sessionTimestamp = Date.now();
    
    const session = await stripe.checkout.sessions.create({
      ui_mode: 'embedded',
      shipping_address_collection: {
        allowed_countries: ['US', 'CA', 'DE', 'GB', 'FR', 'IT', 'ES', 'AT', 'BE', 'NL', 'DK', 'SE', 'FI', 'NO'], 
      },
      shipping_options: [
        {
          shipping_rate: SHIPPING_RATES.DE, // Default to German shipping
        },
        {
          shipping_rate: SHIPPING_RATES.EU, // EU shipping option
        },
        {
          shipping_rate: SHIPPING_RATES.OTHER, // International shipping option
        }
      ],
      line_items: [
        {
          // Provide the exact Price ID of the product you want to sell
          price: 'price_1R055YDiRHn1y6KSCIrUYuxJ',
          quantity: 1,
        },
      ],
      mode: 'payment',
      return_url: `${YOUR_DOMAIN}/return.html?session_id={CHECKOUT_SESSION_ID}`,
      automatic_tax: {enabled: true},
      // Add this permissions parameter to allow onShippingDetailsChange
      permissions: {
        update: {
          shipping_details: 'server_only'
        }
      }
    });
    
    // Send the session ID to the frontend
    res.json({ client_secret: session.client_secret, session_id: session.id });

   // Added conditional logging to prevent potential errors
   if (session) {
    console.log("Checkout Session Created:");
    console.log("Session ID:", session.id);
    console.log("Client Secret:", session.client_secret);
    if (session.shipping_options) {
      console.log("Shipping Options:", JSON.stringify(session.shipping_options, null, 2));
    }
  }

} catch (error) {
  console.error('Error creating session:', error);
  res.status(500).send({ 
    error: error.message,
    details: error.toString()
  });
}
});

function calculateShippingOptions(shipping_details, session) {
  const country = shipping_details.address.country;
  let shippingOptions = [];

  const shippingRateId = getShippingRateId(country);
  if (shippingRateId) {
    shippingOptions.push({
      shipping_rate: shippingRateId,
    });
  }

  return shippingOptions;
}

app.post('/calculate-shipping-options', async (req, res) => {
console.log("===== SHIPPING OPTIONS REQUEST =====");

try {
  const {checkout_session_id, shipping_details} = req.body;

  // Check if shipping details are provided
    if (!shipping_details) {
      return res.status(400).json({ type: "error", message: "Shipping details missing in request." });
    }

    console.log("Detailed Shipping Details Check:");
    console.log("Full Shipping Details:", JSON.stringify(shipping_details, null, 2));
  
  // Robust validation
  const isAddressComplete = 
  shipping_details 
  && shipping_details.name && shipping_details.name.trim() !== ''
  && shipping_details.address 
  && shipping_details.address.line1 && shipping_details.address.line1.trim() !== ''
  && shipping_details.address.city && shipping_details.address.city.trim() !== ''
  && shipping_details.address.postal_code && shipping_details.address.postal_code.trim() !== ''
  && shipping_details.address.country && shipping_details.address.country.trim() !== '';

  console.log("Comprehensive Address Check:", {
    hasName: !!shipping_details.name,
    nameNotEmpty: shipping_details.name && shipping_details.name.trim() !== '',
    hasAddress: !!shipping_details.address,
    hasLine1: shipping_details.address && !!shipping_details.address.line1,
    hasCity: shipping_details.address && !!shipping_details.address.city,
    hasPostalCode: shipping_details.address && !!shipping_details.address.postal_code,
    hasCountry: shipping_details.address && !!shipping_details.address.country
  });

  if (!isAddressComplete) {
    console.log("INCOMPLETE SHIPPING DETAILS - REJECTING");
    return res.status(400).json({
      type: 'error', 
      message: 'Please provide complete shipping information'
    });
  }

  // Get the country from shipping details
  const country = shipping_details.address.country;
    
  // Get the appropriate shipping rate ID
  const shippingRateId = getShippingRateId(country);
  
  console.log("Selected Shipping Rate ID:", shippingRateId);

  // Send the response without using `return`
  res.json({
    type: 'success',
    shippingRateId: shippingRateId,
    sessionId: checkout_session_id
  });
  
  // Retrieve current session to verify its state
  const currentSession = await stripe.checkout.sessions.retrieve(checkout_session_id);

  // Validate shipping details
  if (!validateShippingDetails(shipping_details)) {
    return res.json({ type: "error", message: "Invalid shipping details." });
  }

  // Calculate shipping options
  const shippingOptions = calculateShippingOptions(shipping_details, currentSession);

  // Update the Checkout Session with ONLY shipping options
  try {
    const updatedSession = await stripe.checkout.sessions.update(checkout_session_id, {
      collected_information: { // ✅ Correct way to update shipping details
        shipping_details: {
          name: shipping_details.name,
          address: {
            line1: shipping_details.address.line1,
            line2: shipping_details.address.line2 || "",
            city: shipping_details.address.city,
            postal_code: shipping_details.address.postal_code,
            country: shipping_details.address.country,
            state: shipping_details.address.state || "",
          },
        },
      },
      shipping_options: [
        {
          shipping_rate: shippingRateId,
        }
      ]
    });
    
    
    console.log("Updated Session Details:", JSON.stringify(updatedSession, null, 2));
    console.log("Session update successful");
    
    return res.json({
      type: 'object', 
      value: {
        succeeded: true,
        sessionId: updatedSession.id
      }
    });

  } catch (updateError) {
    console.error("ERROR UPDATING SESSION:", updateError);
    return res.status(500).json({
      type: 'error',
      message: 'Error updating shipping: ' + updateError.message,
      details: updateError.toString()
    });
  }
} catch (error) {
  console.error('FATAL ERROR calculating shipping options:', error);
  return res.status(500).json({
    type: 'error',
    message: 'An error occurred while processing your request: ' + error.message,
    details: error.toString()
  });
}
});

app.get('/session-status', async (req, res) => {
const session = await stripe.checkout.sessions.retrieve(req.query.session_id);

res.send({
  status: session.status,
  customer_email: session.customer_details?.email || 'No email provided'
});
});

const port = process.env.PORT || 4242; // Heroku will set PORT in production
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});