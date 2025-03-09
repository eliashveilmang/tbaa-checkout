// Load environment variables from .env file
require('dotenv').config();

// Use the keys from the .env file
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-11-20.acacia; checkout_server_update_beta=v1',
});
const express = require('express');
const app = express();

app.use(express.static('public'));
app.use(express.json()); // Add this to parse JSON request bodies

const port = process.env.PORT || 4242;

const YOUR_DOMAIN = process.env.DOMAIN || 'https://tbaa-ehv.herokuapp.com';

// Add CORS middleware - this is critical for external access
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*'); // Consider restricting this to your Readymag domain
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Endpoint to get the public Stripe key
app.get('/stripe-public-key', (req, res) => {
  res.json({ publicKey: process.env.STRIPE_PUBLIC_KEY });
});

// Set Content-Security-Policy header for all responses
app.use((req, res, next) => {
  res.setHeader("Content-Security-Policy", 
    "default-src 'self';" +
    "script-src 'self' https://js.stripe.com;" +
    "connect-src 'self' https://api.stripe.com https://merchant-ui-api.stripe.com;" +
    "style-src 'self' 'unsafe-inline' https://js.stripe.com;" +
    "frame-src https://js.stripe.com;" +
    "img-src 'self' data: https://js.stripe.com;" +
    "font-src 'self';" +
    "object-src 'none';" +
    "base-uri 'self';"
  );
  next();
});


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

// Keep your embedded checkout endpoint separate
app.post('/create-checkout-session', async (req, res) => {
  console.log('Received request for checkout session');
  try {
    const session = await stripe.checkout.sessions.create({
      ui_mode: 'embedded',
      shipping_address_collection: {
        allowed_countries: ['US', 'CA', 'DE', 'GB', 'FR', 'IT', 'ES', 'AT', 'BE', 'NL', 'DK', 'SE', 'FI', 'NO'], 
      },
      shipping_options: [
        {
          shipping_rate: SHIPPING_RATES.DE,
        },
        {
          shipping_rate: SHIPPING_RATES.EU,
        },
        {
          shipping_rate: SHIPPING_RATES.OTHER,
        }
      ],
      line_items: [
        {
          price: 'price_1R055YDiRHn1y6KSCIrUYuxJ',
          quantity: 1,
        },
      ],
      mode: 'payment',
      return_url: `https://eliasimg.de/return?session_id={CHECKOUT_SESSION_ID}`,
      automatic_tax: {enabled: true},
      permissions: {
        update: {
          shipping_details: 'server_only'
        }
      }
    });

    console.log("Embedded Checkout Session Created:", session.id);

    res.json({ clientSecret: session.client_secret }); // Return clientSecret for embedded checkout
  } catch (error) {
    res.status(500).json({ error: error.message });
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

    if (!shipping_details) {
      return res.status(400).json({ type: "error", message: "Shipping details missing in request." });
    }
    
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
        collected_information: {
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

app.get("/", (req, res) => {
  res.send("Server is running! Ready for Stripe checkout integration.");
});

app.listen(PORT, () => console.log(`Running on port ${PORT}`));