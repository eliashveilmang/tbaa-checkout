// Add your Heroku server base URL
const SERVER_BASE_URL = "https://tbaa-ehv-4792f0431457.herokuapp.com";
// This is your public test API key.
const stripe = Stripe("pk_live_51QP5vhDiRHn1y6KS3GBaWIQqIQ0jgaddsz3Qo2PDBuiSmBFoDbJVqyj2y5LnzSk1vMaTBCa6NnB5fEZEazdegfz2007uJcUD4O", {
  betas: ['embedded_checkout_byol_beta_1'],
  // Add this line to allow embedding in Readymag
  stripeAccount: {
    businessURL: 'https://readymag.com'
  }
});

document.addEventListener('DOMContentLoaded', function() {
  initialize();
});

// Create a Checkout Session with dynamic shipping
async function initialize() {
  try {
    // Fetch Checkout Session and retrieve the client secret
    const fetchClientSecret = async () => {
      try {
        const response = await fetch("/create-checkout-session", {
          method: "POST",
          headers: {
            'Content-Type': 'application/json'
          }
        });

        
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Error response from server: ${errorText}`);
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log("Response Data:", data);
        return data.client_secret;
      } catch (error) {
        console.error("Error fetching client secret:", error);
        throw error;
      }
    };

    // Call your backend to set shipping options
    // Modify the onShippingDetailsChange function
    const onShippingDetailsChange = async (shippingDetailsChangeEvent) => {
      console.log("===== SHIPPING DETAILS CHANGE EVENT =====");
      console.log("Full Event Object:", JSON.stringify(shippingDetailsChangeEvent, null, 2));
      
      const { checkoutSessionId, shippingDetails } = shippingDetailsChangeEvent;

      if (!shippingDetails) {
        console.error("Error: shippingDetails is missing from event.");
        return { type: "reject", errorMessage: "Shipping details are missing." };
      }
      
      console.log("Checkout Session ID:", checkoutSessionId);
      console.log("Shipping Details:", JSON.stringify(shippingDetails, null, 2));
    
      // Comprehensive field validation
      const missingFields = [];
      if (!shippingDetails) {
        console.error("NO SHIPPING DETAILS PROVIDED");
        return { 
          type: "reject", 
          errorMessage: "Shipping details are missing. Please complete all required fields." 
        };
      }
    
      // Check for required fields
      if (!shippingDetails.name) missingFields.push("Name");
      if (!shippingDetails.address) missingFields.push("Address");
      if (!shippingDetails.address?.line1) missingFields.push("Address Line 1");
      if (!shippingDetails.address?.city) missingFields.push("City");
      if (!shippingDetails.address?.postal_code) missingFields.push("Postal Code");
      if (!shippingDetails.address?.country) missingFields.push("Country");
    
      if (missingFields.length > 0) {
        console.error("MISSING FIELDS:", missingFields);
        return { 
          type: "reject", 
          errorMessage: `Please complete the following shipping details: ${missingFields.join(", ")}` 
        };
      }
    
// Add this log before the fetch call
console.log("About to send request to /calculate-shipping-options");

      try {
        // Instead of using updateShippingAddress, send to server for handling
        const response = await fetch("/calculate-shipping-options", {
          method: "POST",
          body: JSON.stringify({
            checkout_session_id: checkoutSessionId,
            shipping_details: shippingDetails,
          }),
          headers: { "Content-Type": "application/json" },
        });

        const responseData = await response.json(); // Ensure response is parsed only once

      // Add this log after parsing the response
      console.log("Received result from server:", JSON.stringify(responseData, null, 2));

      if (responseData.type === 'error') {
        return { type: "reject", errorMessage: responseData.message };
      } else {
        return { type: "accept" };
      }
      } catch (error) {
        console.error('Error processing shipping details:', error);
        return { 
          type: "reject", 
          errorMessage: `Shipping details error: ${error.message}` 
        };
      }
    };

    console.log("Sending request to /calculate-shipping-options");

    console.log("Initializing embedded checkout...");

    document.getElementById('loading').style.display = 'flex';
    document.getElementById('checkout').style.display = 'none';

    // Initialize Checkout with shipping calculation
    const checkout = await stripe.initEmbeddedCheckout({
      fetchClientSecret,
      onShippingDetailsChange,
      // Add this configuration
      frameAncestors: ['https://readymag.com', 'https://*.readymag.com'],
    });
console.log("Checkout initialized, mounting to DOM...");

// Hide loading and show checkout container
document.getElementById('loading').style.display = 'none';
document.getElementById('checkout').style.display = 'block';
    
    // Mount Checkout
    checkout.mount('#checkout');
    console.log("Checkout mounted");
    
  } catch (error) {
    console.error("Initialization error:", error);
    document.querySelector('#checkout').innerHTML = `
      <div class="error-message">
        <p>There was an error initializing the checkout: ${error.message}</p>
        <p>Please check the console for more details.</p>
      </div>
    `;
  }
}